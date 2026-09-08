/**
 * Integration tests for the daily-closing (Z-Bon) endpoints.
 * Covers: per-register closing, per-day filter, sequential Z-numbers, pending-day
 * detection and the close-pending catch-up loop.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
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

/** Formats a `Date` as `YYYY-MM-DD` (server-local calendar day). */
function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's calendar day as `YYYY-MM-DD`, real time — closing behaviour now depends on the actual gap to "today" (Bug A fix), so fixture dates must be relative, not a historical constant. */
const TODAY = fmtDay(new Date());
/** Yesterday's calendar day as `YYYY-MM-DD`. */
const YESTERDAY = fmtDay(new Date(Date.now() - 24 * 3600 * 1000));

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
    await insertPaidInvoice(`${TODAY} 12:00:00`, 10);
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
    await insertPaidInvoice(`${TODAY} 12:00:00`, 10);
    await app.inject({ method: 'POST', url: `/api/admin/registers/${registerId}/closings`, headers: { cookie: adminCookie } });
    await insertPaidInvoice(`${TODAY} 13:00:00`, 5);
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
    const invoiceId = await insertPaidInvoice(`${TODAY} 12:00:00`, 10);
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

  it('also links unassigned service_order/order_cancellation rows of the same day to the new closing (Task #123)', async () => {
    const app = await getTestApp();
    await insertPaidInvoice(`${TODAY} 12:00:00`, 10);
    const serviceOrder = await pool.query<{ id: string }>(
      `INSERT INTO service_order (register_id, created_at) VALUES ($1, $2) RETURNING id`,
      [registerId, `${TODAY} 12:05:00`],
    );
    const reason = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_reason (name, booking_type, event_id) VALUES ('Testgrund', 'cancellation', $1) RETURNING id`,
      [config.activeEventId],
    );
    const cancellation = await pool.query<{ id: string }>(
      `INSERT INTO order_cancellation (register_id, cancellation_reason_id, cancellation_reason_name, created_at)
       VALUES ($1, $2, 'Testgrund', $3) RETURNING id`,
      [registerId, reason.rows[0]!.id, `${TODAY} 12:10:00`],
    );

    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    const closingId = response.json().closings[0].closing_id;

    const so = await pool.query<{ daily_closing_id: string | null }>(
      `SELECT daily_closing_id FROM service_order WHERE id = $1`, [serviceOrder.rows[0]!.id],
    );
    expect(so.rows[0]!.daily_closing_id).toBe(closingId);
    const oc = await pool.query<{ daily_closing_id: string | null }>(
      `SELECT daily_closing_id FROM order_cancellation WHERE id = $1`, [cancellation.rows[0]!.id],
    );
    expect(oc.rows[0]!.daily_closing_id).toBe(closingId);
  });

  it('links service_order/order_cancellation to the day-scoped catch-up closing even on a gap day with zero invoices', async () => {
    const app = await getTestApp();
    // Yesterday: a service_order but no invoice at all — a gap day for
    // invoices, but not for Bedienung activity. Must still be picked up by
    // the day-scoped catch-up closing rather than staying unassigned forever.
    const serviceOrder = await pool.query<{ id: string }>(
      `INSERT INTO service_order (register_id, created_at) VALUES ($1, $2) RETURNING id`,
      [registerId, `${YESTERDAY} 12:00:00`],
    );
    await insertPaidInvoice(`${TODAY} 09:00:00`, 5);

    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    const closings = response.json().closings;
    expect(closings).toHaveLength(2);
    const yesterdayClosing = closings[0];

    const so = await pool.query<{ daily_closing_id: string | null }>(
      `SELECT daily_closing_id FROM service_order WHERE id = $1`, [serviceOrder.rows[0]!.id],
    );
    expect(so.rows[0]!.daily_closing_id).toBe(yesterdayClosing.closing_id);
  });

  it('enqueues a print job when the register has a printer', async () => {
    const app = await getTestApp();
    await insertPaidInvoice(`${TODAY} 12:00:00`, 10);
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
    await insertPaidInvoice(`${YESTERDAY} 12:00:00`, 10); // an old, never-closed day
    await insertPaidInvoice(`${TODAY} 09:00:00`, 5);       // today

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
    // z_number order follows chronological day order: the past-pending
    // catch-up (yesterday) runs before the separate "close today" step.
    expect(stored.rows[0]!.business_date).toBe(YESTERDAY);
    expect(Number(stored.rows[0]!.total_gross)).toBe(10);
    expect(stored.rows[1]!.business_date).toBe(TODAY);
    expect(Number(stored.rows[1]!.total_gross)).toBe(5);
  });

  // Bug A (2026-09-06 Z-Bon live test): a calendar day with genuinely zero
  // invoices ("a gap") could never get a daily_closing row before, since the
  // old day-list came from DISTINCT invoice dates — the gap day stayed
  // "ausstehend" forever no matter how often the register was closed. The
  // day list now comes from findPendingDaysForRegister() instead, which
  // walks every calendar day, so a gap day gets an explicit Nullabschluss.
  it('closes a gap day with zero invoices as an explicit Nullabschluss, not just the days with real turnover', async () => {
    const app = await getTestApp();
    const twoDaysAgo = fmtDay(new Date(Date.now() - 48 * 3600 * 1000));
    // twoDaysAgo has turnover, YESTERDAY has none at all (the gap), TODAY has turnover again.
    await insertPaidInvoice(`${twoDaysAgo} 12:00:00`, 10);
    await insertPaidInvoice(`${TODAY} 09:00:00`, 5);

    const response = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().closings).toHaveLength(3);

    const stored = await pool.query<{ business_date: string; is_zero_closing: boolean }>(
      `SELECT to_char(business_date, 'YYYY-MM-DD') AS business_date, is_zero_closing
         FROM daily_closing WHERE register_id = $1 ORDER BY z_number`,
      [registerId],
    );
    expect(stored.rows.map((r) => r.business_date)).toEqual([twoDaysAgo, YESTERDAY, TODAY]);
    expect(stored.rows[1]!.is_zero_closing).toBe(true); // the gap day

    // The register must actually be unlocked afterwards — the whole point of the fix.
    const pending = await app.inject({
      method: 'GET', url: '/api/admin/closings/pending', headers: { cookie: adminCookie },
    });
    const myReg = pending.json().registers.find((r: { register_id: string }) => r.register_id === registerId);
    expect(myReg.pending_days).toEqual([]);
  });

  // Bug B (2026-09-06 Z-Bon live test): clicking "Tagesabschluss jetzt
  // durchführen" repeatedly on an idle, already-closed register used to
  // mint a fresh Nullabschluss every single time.
  it('does not create a second Nullabschluss when clicked again on an already-closed, still-idle register', async () => {
    const app = await getTestApp();
    const first = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(first.json().closings).toHaveLength(1); // the one-time idle Nullabschluss

    const second = await app.inject({
      method: 'POST', url: `/api/admin/registers/${registerId}/closings`,
      headers: { cookie: adminCookie },
    });
    expect(second.json().closings).toHaveLength(0);

    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM daily_closing WHERE register_id = $1`, [registerId]);
    expect(count.rows[0]!.n).toBe(1);
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

describe('Authentication is required', () => {
  it('all closing endpoints reject requests without an admin_session', async () => {
    const app = await getTestApp();
    for (const url of [
      `/api/admin/registers/${registerId}/closings`,
      `/api/admin/registers/${registerId}/close-pending`,
    ]) {
      const r = await app.inject({ method: 'POST', url });
      expect(r.statusCode, `expected 401 for ${url}`).toBe(401);
    }
  });
  // Suppress unused import warning — the helper is part of the public test contract.
  void assignRegisterToUser; void createTestArticle;
});
