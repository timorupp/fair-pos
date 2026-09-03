/**
 * Integration tests for the daily-closing (Z-Bon) endpoints.
 * Covers: per-register closing, per-day filter, sequential Z-numbers, pending-day
 * detection and the close-pending catch-up loop.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import {
  assignRegisterToUser, createTestArticle, createTestPrinter,
  createTestRegister, createTestUser, seedReceiptCounter, setSystemSetting,
} from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let registerId: string;
let printerId: string;

beforeEach(async () => {
  await truncateAllTables();
  const app = await getTestApp();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(app, admin.pin, admin.password);
  const printer = await createTestPrinter();
  printerId = printer.id;
  const reg = await createTestRegister({ type: 'receipt_register', printerId });
  registerId = reg.id;
  await seedReceiptCounter(0);
  await setSystemSetting('company_name', 'Testverein');
  await setSystemSetting('system_serial', 'FairPOS-2026-TESTAAAAAA');
});

/**
 * Inserts an invoice + one paid order_item to give the register some turnover.
 * Returns the invoice id.
 */
async function insertPaidInvoice(date: string, gross: number): Promise<string> {
  const counter = await pool.query<{ value: string }>(
    `UPDATE system_setting SET value = (value::int + 1)::text
      WHERE key = 'receipt_counter' RETURNING value`,
  );
  const num = counter.rows[0]!.value;
  const inv = await pool.query<{ id: string }>(
    `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
     VALUES ($1, $2, 'sales_receipt', 'cash', $3)
     RETURNING id`,
    [registerId, num, date],
  );
  await pool.query(
    `INSERT INTO order_item (
       invoice_id, register_id, article_name, article_category_name,
       tax_rate, tax_category, price, deposit_price, status, created_at
     ) VALUES ($1, $2, 'Bier', 'Getränke', 19, 'standard', $3, NULL, 'paid', $4)`,
    [inv.rows[0]!.id, registerId, gross, date],
  );
  return inv.rows[0]!.id;
}

describe('POST /api/admin/registers/:id/closings', () => {
  it('creates a Z-Bon with the next sequential number', async () => {
    const app = await getTestApp();
    await insertPaidInvoice('2026-06-24 12:00:00', 10);
    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.closings).toHaveLength(1);
    expect(body.closings[0].z_number).toBe(1);
    expect(body.closings[0].is_zero_closing).toBe(false);
  });

  it('increments z_number per register', async () => {
    const app = await getTestApp();
    await insertPaidInvoice('2026-06-24 12:00:00', 10);
    await app.inject({ method: 'POST', url: `/api/admin/registers/${registerId}/closings`, headers: { cookie: adminCookie } });
    await insertPaidInvoice('2026-06-24 13:00:00', 5);
    const r2 = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(r2.json().closings[0].z_number).toBe(2);
  });

  it('produces a zero closing when there is no turnover', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    const body = response.json();
    expect(body.closings).toHaveLength(1);
    expect(body.closings[0].is_zero_closing).toBe(true);
  });

  it('links the closed invoices to the new closing (daily_closing_id set)', async () => {
    const app = await getTestApp();
    const invoiceId = await insertPaidInvoice('2026-06-24 12:00:00', 10);
    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    const closingId = response.json().closings[0].closing_id;
    const inv = await pool.query<{ daily_closing_id: string | null }>(
      `SELECT daily_closing_id FROM invoice WHERE id = $1`, [invoiceId],
    );
    expect(inv.rows[0]!.daily_closing_id).toBe(closingId);
  });

  it('enqueues a print job when the register has a printer', async () => {
    const app = await getTestApp();
    await insertPaidInvoice('2026-06-24 12:00:00', 10);
    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(response.json().closings[0].print_job_id).toBeTruthy();
    const jobs = await pool.query(`SELECT * FROM print_job WHERE type = 'daily_closing'`);
    expect(jobs.rowCount).toBe(1);
  });

  // Task #106: a register with unassigned invoices from more than one
  // calendar day used to get a single Z-Bon lump-stamped with today's date
  // — the older day's revenue was silently misattributed and the day stayed
  // marked "offen" forever. Each distinct day must now get its own,
  // correctly dated Z-Bon.
  it('produces one correctly dated Z-Bon per distinct calendar day (not one lump closing stamped as today)', async () => {
    const app = await getTestApp();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await insertPaidInvoice(`${fmt(yesterday)} 12:00:00`, 10); // an old, never-closed day
    await insertPaidInvoice('2026-06-24 09:00:00', 5);         // a second, distinct day

    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const closings = response.json().closings;
    expect(closings).toHaveLength(2);

    const stored = await pool.query<{ business_date: string; total_gross: string }>(
      `SELECT to_char(business_date, 'YYYY-MM-DD') AS business_date, total_gross::text
         FROM daily_closing WHERE register_id = $1 ORDER BY z_number`,
      [registerId],
    );
    // z_number order follows chronological day order (closeAllPendingDays
    // processes days ascending), not insertion order — 2026-06-24 predates
    // "yesterday" so it gets the lower z_number.
    expect(stored.rows[0]!.business_date).toBe('2026-06-24');
    expect(Number(stored.rows[0]!.total_gross)).toBe(5);
    expect(stored.rows[1]!.business_date).toBe(fmt(yesterday));
    expect(Number(stored.rows[1]!.total_gross)).toBe(10);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/admin/closings/pending', () => {
  it('reports pending past days for a register with invoices but no closings', async () => {
    const app = await getTestApp();
    // Insert an invoice yesterday (in real time — the helper resolves "today" via JS Date).
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    await insertPaidInvoice(`${yyyy}-${mm}-${dd} 18:00:00`, 10);

    const response = await app.inject({
      method: 'GET', url: '/api/admin/closings/pending',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const regEntry = body.registers.find((r: { register_id: string }) => r.register_id === registerId);
    expect(regEntry).toBeTruthy();
    expect(regEntry.pending_days).toContain(`${yyyy}-${mm}-${dd}`);
    expect(body.total_pending_days).toBeGreaterThanOrEqual(1);
  });

  it('reports zero pending when the register has never been used', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/closings/pending',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().total_pending_days).toBe(0);
  });
});

describe('POST /api/admin/registers/:id/close-pending', () => {
  it('catches up multiple missed days, one Z-Bon per day', async () => {
    const app = await getTestApp();
    // Two past days with invoices.
    const day1 = new Date(Date.now() - 48 * 3600 * 1000);
    const day2 = new Date(Date.now() - 24 * 3600 * 1000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await insertPaidInvoice(`${fmt(day1)} 12:00:00`, 10);
    await insertPaidInvoice(`${fmt(day2)} 12:00:00`, 5);

    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/close-pending`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.closings.length).toBe(2);
    expect(body.closings[0].z_number).toBe(1);
    expect(body.closings[1].z_number).toBe(2);
  });

  it('unlocks the register after close-pending — pending list becomes empty', async () => {
    // Regression for the "Kasse bleibt nach close-pending gesperrt" bug:
    // closings were stamped with created_at=now() so the pending walk never
    // recognised the catch-up day as closed.
    const app = await getTestApp();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await insertPaidInvoice(`${fmt(yesterday)} 12:00:00`, 7);
    await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/close-pending`,
      headers: { cookie: adminCookie },
    });
    const pending = await app.inject({
      method: 'GET', url: '/api/admin/closings/pending',
      headers: { cookie: adminCookie },
    });
    const myReg = pending.json().registers.find((r: { register_id: string }) => r.register_id === registerId);
    expect(myReg.pending_days).toEqual([]);
  });

  it('uses the system-default printer when the register has no own printer', async () => {
    const app = await getTestApp();
    // Create a fresh default printer + a register WITHOUT its own printer.
    const defaultP = await createTestPrinter({ name: 'Default', isDefault: true });
    const regNoPrinter = await createTestRegister({ name: 'NoPrinter', type: 'receipt_register', printerId: null });
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 99, 'sales_receipt', 'cash', now())`,
      [regNoPrinter.id],
    );
    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${regNoPrinter.id}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const printJobId = response.json().closings[0].print_job_id;
    expect(printJobId).not.toBeNull();
    const job = await pool.query<{ printer_id: string }>(
      `SELECT printer_id FROM print_job WHERE id = $1`, [printJobId],
    );
    expect(job.rows[0]!.printer_id).toBe(defaultP.id);
  });

  it('separates the days into different Z-Bons (no aggregation across days)', async () => {
    const app = await getTestApp();
    const day1 = new Date(Date.now() - 48 * 3600 * 1000);
    const day2 = new Date(Date.now() - 24 * 3600 * 1000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await insertPaidInvoice(`${fmt(day1)} 12:00:00`, 10);
    await insertPaidInvoice(`${fmt(day2)} 12:00:00`, 5);
    await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/close-pending`,
      headers: { cookie: adminCookie },
    });
    const closings = await pool.query<{ z_number: string; total_gross: string }>(
      `SELECT z_number::text, total_gross::text FROM daily_closing
        WHERE register_id = $1 ORDER BY z_number`,
      [registerId],
    );
    expect(Number(closings.rows[0]!.total_gross)).toBe(10);
    expect(Number(closings.rows[1]!.total_gross)).toBe(5);
  });
});

describe('POST /api/admin/closings/close-all', () => {
  it('closes every register in one call', async () => {
    const app = await getTestApp();
    const reg2 = await createTestRegister({ name: 'R2', type: 'receipt_register', printerId });
    await insertPaidInvoice('2026-06-24 12:00:00', 10);
    // Plant some turnover on the second register too
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, $2, 'sales_receipt', 'cash', $3)`,
      [reg2.id, 999, '2026-06-24 13:00:00'],
    );
    const response = await app.inject({
      method: 'POST', url: '/api/admin/closings/close-all',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().closings.length).toBe(2);
  });
});

describe('Authentication is required', () => {
  it('all closing endpoints reject requests without an admin_session', async () => {
    const app = await getTestApp();
    for (const url of [
      `/api/admin/registers/${registerId}/closings`,
      `/api/admin/registers/${registerId}/close-pending`,
      '/api/admin/closings/close-all',
    ]) {
      const r = await app.inject({ method: 'POST', url });
      expect(r.statusCode, `expected 401 for ${url}`).toBe(401);
    }
  });
  // Suppress unused import warning — the helper is part of the public test contract.
  void assignRegisterToUser; void createTestArticle;
});
