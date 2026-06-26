/**
 * Integration tests for the admin reports endpoints — verifies the aggregate
 * queries produce the expected numbers for a known set of fixtures.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import {
  createTestPrinter, createTestRegister, createTestUser, seedReceiptCounter,
} from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let eventId: string;
let registerId: string;

beforeEach(async () => {
  await truncateAllTables();
  const app = await getTestApp();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(app, admin.name, 'pw');
  const printer = await createTestPrinter();
  const reg = await createTestRegister({ type: 'receipt_register', printerId: printer.id });
  registerId = reg.id;
  await seedReceiptCounter(0);

  // One event in the past so the default-event-selector picks it.
  const ev = await pool.query<{ id: string }>(
    `INSERT INTO event (name, start_time, end_time)
     VALUES ('Test-Event', now() - interval '7 days', now() + interval '1 hour')
     RETURNING id`,
  );
  eventId = ev.rows[0]!.id;
});

/** Inserts a paid invoice with `gross`/`tax_rate` per item, optionally `cash` or `card`. */
async function insertPaidInvoice(
  receiptNumber: number,
  gross: number,
  taxRate: number = 19,
  payment: 'cash' | 'card' = 'cash',
  status: 'paid' | 'cancelled' | 'free' = 'paid',
): Promise<string> {
  const inv = await pool.query<{ id: string }>(
    `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at, receipt_token)
     VALUES ($1, $2, 'sales_receipt', $3, now() - interval '1 hour', $4) RETURNING id`,
    [registerId, receiptNumber, payment, `tok-${receiptNumber}`],
  );
  await pool.query(
    `INSERT INTO order_item (
       invoice_id, register_id, article_name, article_category_name,
       tax_rate, price, status, created_at
     ) VALUES ($1, $2, 'Bier', 'Getränke', $3, $4, $5, now() - interval '1 hour')`,
    [inv.rows[0]!.id, registerId, taxRate, gross, status],
  );
  return inv.rows[0]!.id;
}

describe('GET /api/admin/reports/invoices', () => {
  it('returns invoices in the selected event window', async () => {
    const app = await getTestApp();
    await insertPaidInvoice(1, 10);
    await insertPaidInvoice(2, 5);
    const response = await app.inject({
      method: 'GET', url: `/api/admin/reports/invoices?event_id=${eventId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.invoices.length).toBe(2);
    const totals = body.invoices.map((i: { total_gross: number }) => i.total_gross).sort((a: number, b: number) => a - b);
    expect(totals).toEqual([5, 10]);
  });

  it('returns an empty list when no event is configured', async () => {
    const app = await getTestApp();
    await pool.query(`DELETE FROM event`);
    const response = await app.inject({
      method: 'GET', url: '/api/admin/reports/invoices',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().invoices).toEqual([]);
  });
});

describe('GET /api/admin/reports/cash-balance', () => {
  it('counts cash receipts but not card receipts toward the balance', async () => {
    const app = await getTestApp();
    await insertPaidInvoice(1, 10, 19, 'cash');
    await insertPaidInvoice(2, 50, 19, 'card');
    const response = await app.inject({
      method: 'GET', url: `/api/admin/reports/cash-balance?event_id=${eventId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const row = response.json().registers.find((r: { id: string }) => r.id === registerId);
    expect(row.cash_takings).toBe(10);
    expect(row.balance).toBe(10);
  });

  it('ignores cancelled and free items', async () => {
    const app = await getTestApp();
    await insertPaidInvoice(1, 10, 19, 'cash', 'paid');
    await insertPaidInvoice(2, 100, 19, 'cash', 'cancelled');
    await insertPaidInvoice(3, 50, 19, 'cash', 'free');
    const response = await app.inject({
      method: 'GET', url: `/api/admin/reports/cash-balance?event_id=${eventId}`,
      headers: { cookie: adminCookie },
    });
    const row = response.json().registers.find((r: { id: string }) => r.id === registerId);
    expect(row.cash_takings).toBe(10);
  });

  it('includes deposit transactions in the balance', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: true });
    await pool.query(
      `INSERT INTO cash_transaction (register_id, user_id, type, amount, created_at)
       VALUES ($1, $2, 'deposit', 100, now() - interval '1 hour')`,
      [registerId, user.id],
    );
    await pool.query(
      `INSERT INTO cash_transaction (register_id, user_id, type, amount, created_at)
       VALUES ($1, $2, 'withdrawal', 30, now() - interval '30 minutes')`,
      [registerId, user.id],
    );
    await insertPaidInvoice(1, 20, 19, 'cash');
    const response = await app.inject({
      method: 'GET', url: `/api/admin/reports/cash-balance?event_id=${eventId}`,
      headers: { cookie: adminCookie },
    });
    const row = response.json().registers.find((r: { id: string }) => r.id === registerId);
    expect(row.deposits).toBe(100);
    expect(row.withdrawals).toBe(30);
    expect(row.cash_takings).toBe(20);
    expect(row.balance).toBe(90);
  });
});

describe('GET /api/admin/reports/cancellations', () => {
  it('lists cancelled and free items with a per-user summary', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    // Insert two cancelled items
    const reason = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_reason (name, booking_type) VALUES ('X', 'cancellation') RETURNING id`,
    );
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 100, 'sales_receipt', 'cash', now() - interval '1 hour') RETURNING id`,
      [registerId],
    );
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO order_item (
           invoice_id, register_id, article_name, article_category_name,
           tax_rate, price, status, cancellation_reason_id, cancelled_by, cancelled_at, created_at
         ) VALUES ($1, $2, 'X', 'Y', 19, 5, 'cancelled', $3, $4, now() - interval '30 minutes', now() - interval '1 hour')`,
        [inv.rows[0]!.id, registerId, reason.rows[0]!.id, user.id],
      );
    }
    const response = await app.inject({
      method: 'GET', url: `/api/admin/reports/cancellations?event_id=${eventId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBe(2);
    expect(body.summary.length).toBe(1);
    expect(body.summary[0].count).toBe(2);
    expect(body.summary[0].total).toBe(10);
  });
});

describe('GET /api/admin/reports/open-positions', () => {
  it('groups open items by table', async () => {
    const app = await getTestApp();
    await pool.query(`INSERT INTO floor_plan_column (label, col_order) VALUES ('A', 0)`);
    await pool.query(`INSERT INTO floor_plan_row    (label, row_order) VALUES ('1', 0)`);
    const t = await pool.query<{ id: string }>(
      `INSERT INTO dining_table (name, col_label, row_label, status)
       VALUES ('A1', 'A', '1', 'active') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO order_item (
         dining_table_id, register_id, article_name, article_category_name,
         tax_rate, price, status, created_at
       ) VALUES ($1, $2, 'Bier', 'Getränke', 19, 5, 'open', now())`,
      [t.rows[0]!.id, registerId],
    );
    const response = await app.inject({
      method: 'GET', url: '/api/admin/reports/open-positions',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tables.length).toBe(1);
    expect(body.tables[0].positions[0].name).toBe('Bier');
  });
});

describe('Authentication required', () => {
  it('all report endpoints reject unauthenticated requests', async () => {
    const app = await getTestApp();
    for (const url of [
      '/api/admin/reports/invoices',
      '/api/admin/reports/cash-balance',
      '/api/admin/reports/cancellations',
      '/api/admin/reports/open-positions',
      '/api/admin/reports/events',
    ]) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, `expected 401 for ${url}`).toBe(401);
    }
  });
});
