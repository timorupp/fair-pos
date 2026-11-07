/** Integration tests for "Kasse stilllegen" (Task #151) — `retireRegister`/`reactivateRegister`. */

import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { config } from '../config.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { retireRegister, reactivateRegister, RegisterRetireError } from './retire.js';

let registerId: string;
let printerId: string;

beforeEach(async () => {
  await truncateAllTables();
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

async function insertInvoice(createdAt: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
     VALUES ($1, (SELECT COALESCE(MAX(receipt_number),0)+1 FROM invoice), 'sales_receipt', 'cash', $2)
     RETURNING id`,
    [registerId, createdAt],
  );
  return result.rows[0]!.id;
}

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

/** `to_char(...)`, matching the codebase's own convention for reading a DATE column back as a clean string (see `business_date` elsewhere) — the raw pg driver otherwise returns a JS `Date`, not a string. */
async function retiredDateOf(id: string): Promise<string | null> {
  const result = await pool.query<{ retired_date: string | null }>(
    `SELECT to_char(retired_date, 'YYYY-MM-DD') AS retired_date FROM register WHERE id = $1`, [id],
  );
  return result.rows[0]?.retired_date ?? null;
}

/** Links an invoice to its closing — inserting a `daily_closing` row alone does not retroactively link existing invoices (same as the D-075 mechanism this relies on). */
async function linkInvoiceToClosing(invoiceId: string, registerId: string): Promise<void> {
  await pool.query(
    `UPDATE invoice SET daily_closing_id = (SELECT id FROM daily_closing WHERE register_id = $1 ORDER BY z_number DESC LIMIT 1) WHERE id = $2`,
    [registerId, invoiceId],
  );
}

describe('retireRegister', () => {
  it('retires a register with no activity at all', async () => {
    await retireRegister(registerId, new Date(2026, 5, 20));
    expect(await retiredDateOf(registerId)).toBe('2026-06-20');
  });

  it('rejects when a day strictly before the retirement date is still unclosed', async () => {
    await insertInvoice('2026-06-19 18:00:00');
    await expect(retireRegister(registerId, new Date(2026, 5, 20))).rejects.toThrow(RegisterRetireError);
    expect(await retiredDateOf(registerId)).toBeNull();
  });

  it('allows the retirement day itself to still be unclosed', async () => {
    await insertInvoice('2026-06-20 18:00:00');
    await retireRegister(registerId, new Date(2026, 5, 20));
    expect(await retiredDateOf(registerId)).toBe('2026-06-20');
  });

  it('succeeds once every day before the retirement date has been closed', async () => {
    const inv = await insertInvoice('2026-06-19 18:00:00');
    await insertClosing('2026-06-19 23:00:00', 1);
    await linkInvoiceToClosing(inv, registerId);
    await retireRegister(registerId, new Date(2026, 5, 20));
    expect(await retiredDateOf(registerId)).toBe('2026-06-20');
  });

  it('rejects when a booking already exists after the chosen retirement date', async () => {
    await insertInvoice('2026-06-21 09:00:00');
    await expect(retireRegister(registerId, new Date(2026, 5, 20))).rejects.toThrow(RegisterRetireError);
    expect(await retiredDateOf(registerId)).toBeNull();
  });

  it('rejects when a closing already exists after the chosen retirement date', async () => {
    const inv = await insertInvoice('2026-06-19 18:00:00');
    await insertClosing('2026-06-19 23:00:00', 1);
    await linkInvoiceToClosing(inv, registerId);
    const inv2 = await insertInvoice('2026-06-21 09:00:00');
    await insertClosing('2026-06-21 23:00:00', 2);
    await linkInvoiceToClosing(inv2, registerId);
    await expect(retireRegister(registerId, new Date(2026, 5, 20))).rejects.toThrow(RegisterRetireError);
  });

  it('mentions the pending days in the error message', async () => {
    await insertInvoice('2026-06-19 18:00:00');
    await expect(retireRegister(registerId, new Date(2026, 5, 20)))
      .rejects.toThrow(/19\.06\.2026/);
  });

  it('mentions the offending later date in the error message, in German DD.MM.YYYY format (found live 2026-09-30 showing the raw ISO string)', async () => {
    await insertInvoice('2026-06-21 09:00:00');
    await expect(retireRegister(registerId, new Date(2026, 5, 20)))
      .rejects.toThrow(/21\.06\.2026/);
  });
});

describe('reactivateRegister', () => {
  it('clears retired_date', async () => {
    await retireRegister(registerId, new Date(2026, 5, 20));
    expect(await retiredDateOf(registerId)).toBe('2026-06-20');
    await reactivateRegister(registerId);
    expect(await retiredDateOf(registerId)).toBeNull();
  });

  it('is a no-op on a register that was never retired', async () => {
    await reactivateRegister(registerId);
    expect(await retiredDateOf(registerId)).toBeNull();
  });
});
