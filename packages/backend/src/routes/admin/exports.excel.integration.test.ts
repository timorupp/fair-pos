/**
 * Integration tests for the Excel "Veranstaltungsexport" — verifies it is
 * scoped to the currently active event (Task #95), not a manually-selected
 * one (the old `event_id` query param / EventSelector mechanism was removed).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestRegister, createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('GET /api/admin/exports/excel/event', () => {
  it('returns 404 when the active event has no invoices yet', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/excel/event',
      headers: { cookie: adminCookie },
    });
    // No invoices in the freshly-seeded active event — the workbook still
    // renders (an empty sheet), so this asserts 200, not 404.
    expect(response.statusCode).toBe(200);
  });

  it('includes only invoices of the active event, not a different one', async () => {
    const otherEvent = await pool.query<{ id: string }>(
      `INSERT INTO event (name, start_time, end_time) VALUES ('Anderes Fest', now() - interval '30 days', now() - interval '20 days') RETURNING id`,
    );
    const foreignRegister = await createTestRegister({ name: 'Fremd', eventId: otherEvent.rows[0]!.id });
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', now() - interval '25 days')`,
      [foreignRegister.id],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_name, article_category_name, tax_rate, price, status, created_at)
       SELECT id, register_id, 'Bier', 'Getränke', 19, 5, 'paid', created_at FROM invoice WHERE register_id = $1`,
      [foreignRegister.id],
    );

    const ownRegister = await createTestRegister({ name: 'Eigen', eventId: config.activeEventId });
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 2, 'sales_receipt', 'cash', now())`,
      [ownRegister.id],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_name, article_category_name, tax_rate, price, status, created_at)
       SELECT id, register_id, 'Wein', 'Getränke', 19, 7, 'paid', created_at FROM invoice WHERE register_id = $1`,
      [ownRegister.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/excel/event',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(response.rawPayload as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    const articleNames: unknown[] = [];
    for (let row = 4; row <= sheet.rowCount; row++) {
      const value = sheet.getCell(row, 7).value;
      if (value !== null && value !== undefined) articleNames.push(value);
    }
    expect(articleNames).toEqual(['Wein']);
  });

  it('includes an invoice booked on the active event\'s register even when its created_at falls outside the event\'s own start/end window', async () => {
    // Task #95: the event's start_time/end_time are informational display
    // fields only — scoping must go by register.event_id alone. Regression
    // test for a bug where the export still additionally filtered by that
    // date range, silently dropping invoices outside it (e.g. anything
    // booked after the auto-created "Altbestand" event's frozen end_time).
    const ownRegister = await createTestRegister({ name: 'Eigen', eventId: config.activeEventId });
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', now() - interval '90 days')`,
      [ownRegister.id],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_name, article_category_name, tax_rate, price, status, created_at)
       SELECT id, register_id, 'Radler', 'Getränke', 19, 4, 'paid', created_at FROM invoice WHERE register_id = $1`,
      [ownRegister.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/excel/event',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(response.rawPayload as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getCell(4, 7).value).toBe('Radler');
  });

  it('rejects the request without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/exports/excel/event' });
    expect(response.statusCode).toBe(401);
  });
});
