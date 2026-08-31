/**
 * Integration tests for `findPendingDaysForRegister`.
 *
 * These cover the join + LEAST() logic that the pure `pendingClosingDays`
 * helper cannot reach without a real database.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { config } from '../config.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { findPendingDaysForRegister } from './pending-db.js';

let registerId: string;
let printerId: string;

beforeEach(async () => {
  await truncateAllTables();
  // Seed minimal fixtures: one printer, one register.
  const printerResult = await pool.query<{ id: string }>(
    `INSERT INTO printer (name, ip_address) VALUES ('p', '127.0.0.1') RETURNING id`,
  );
  printerId = printerResult.rows[0]!.id;
  const regResult = await pool.query<{ id: string }>(
    `INSERT INTO register (name, type, printer_id, event_id) VALUES ('R1', 'receipt_register', $1, $2) RETURNING id`,
    [printerId, config.activeEventId],
  );
  registerId = regResult.rows[0]!.id;
});

/**
 * Inserts a minimal invoice row at the given local-time `created_at`. Used to
 * simulate activity on specific calendar days.
 *
 * @param createdAt - Local-time string accepted by Postgres (e.g. `2026-06-21 12:00:00`).
 * @returns The inserted invoice id.
 */
async function insertInvoice(createdAt: string): Promise<string> {
  const result = await pool.query<{ id: string; receipt_number: string }>(
    `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
     VALUES ($1, (SELECT COALESCE(MAX(receipt_number),0)+1 FROM invoice), 'sales_receipt', 'cash', $2)
     RETURNING id, receipt_number::text`,
    [registerId, createdAt],
  );
  return result.rows[0]!.id;
}

/**
 * Inserts a daily closing for a given calendar day. The fields irrelevant to
 * pending-detection are filled with zeros.
 *
 * @param createdAt - Local-time string for the closing day.
 * @param zNumber - Sequential Z-Bon number for this register.
 */
async function insertClosing(createdAt: string, zNumber: number): Promise<void> {
  await pool.query(
    `INSERT INTO daily_closing (
       register_id, z_number, created_at, business_date, created_by_name, is_zero_closing,
       total_gross, total_tax_standard, total_tax_reduced, total_tax_zero,
       total_cash, total_cancellations
     ) VALUES ($1, $2, $3::timestamptz, $4::date, $5, true, 0, 0, 0, 0, 0, 0)`,
    [registerId, zNumber, createdAt, createdAt.split(' ')[0], 'admin'],
  );
}

describe('findPendingDaysForRegister (integration)', () => {
  beforeAll(() => { /* container started by globalSetup */ });

  it('returns an empty list when the register has no activity at all', async () => {
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual([]);
  });

  it('returns the activity day when no closing exists yet', async () => {
    await insertInvoice('2026-06-23 18:00:00');
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual(['2026-06-23']);
  });

  it('skips days that already have a closing', async () => {
    await insertInvoice('2026-06-21 18:00:00');
    await insertInvoice('2026-06-22 18:00:00');
    await insertInvoice('2026-06-23 18:00:00');
    await insertClosing('2026-06-22 23:30:00', 1);
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual(['2026-06-21', '2026-06-23']);
  });

  it('includes the closing day in the activity range when only closings exist', async () => {
    await insertClosing('2026-06-21 23:30:00', 1);
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual(['2026-06-22', '2026-06-23']);
  });

  it('never reports today as pending even when there are open invoices today', async () => {
    await insertInvoice('2026-06-24 08:00:00');
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual([]);
  });

  it('isolates per-register: another register\'s activity does not surface here', async () => {
    const otherReg = await pool.query<{ id: string }>(
      `INSERT INTO register (name, type, printer_id, event_id) VALUES ('R2', 'receipt_register', $1, $2) RETURNING id`,
      [printerId, config.activeEventId],
    );
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', '2026-06-22 18:00:00')`,
      [otherReg.rows[0]!.id],
    );
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual([]);
  });
});
