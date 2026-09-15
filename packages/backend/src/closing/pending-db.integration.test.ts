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
       total_cash, total_bonstorno, total_free, total_order_cancellations
     ) VALUES ($1, $2, $3::timestamptz, $4::date, $5, true, 0, 0, 0, 0, 0, 0, 0, 0)`,
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

  it('skips a day that already has a closing AND has no more unlinked rows', async () => {
    await insertInvoice('2026-06-21 18:00:00');
    const linked = await insertInvoice('2026-06-22 18:00:00');
    await insertInvoice('2026-06-23 18:00:00');
    await insertClosing('2026-06-22 23:30:00', 1);
    await pool.query(`UPDATE invoice SET daily_closing_id = (SELECT id FROM daily_closing WHERE register_id = $1) WHERE id = $2`, [registerId, linked]);
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual(['2026-06-21', '2026-06-23']);
  });

  it('re-opens a day that already has a closing but still has an unlinked invoice (D-075 — e.g. a sale after that day\'s Z-Bon)', async () => {
    await insertClosing('2026-06-22 20:00:00', 1);
    await insertClosing('2026-06-23 20:00:00', 2); // keeps day 23 itself out of scope for this test
    // Nothing locks a register once closed — this invoice arrives after the
    // Z-Bon above but still dated the same day, and (deliberately, matching
    // the bug) is never linked to that closing here.
    await insertInvoice('2026-06-22 23:00:00');
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual(['2026-06-22']);
  });

  it('re-opens a day via an unlinked service_order or order_cancellation too, not just invoice (D-075)', async () => {
    await insertClosing('2026-06-22 20:00:00', 1);
    await insertClosing('2026-06-23 20:00:00', 2);
    await pool.query(
      `INSERT INTO service_order (register_id, created_at) VALUES ($1, '2026-06-22 23:00:00')`,
      [registerId],
    );
    const pending = await findPendingDaysForRegister(registerId, new Date('2026-06-24T12:00:00'));
    expect(pending).toEqual(['2026-06-22']);
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
