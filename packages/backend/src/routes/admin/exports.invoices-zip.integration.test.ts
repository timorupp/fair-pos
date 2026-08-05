/**
 * Integration tests for the "Rechnungs-PDFs (ZIP)" batch export — verifies
 * the DB-load -> per-invoice-PDF -> ZIP wiring end to end for both scoping
 * modes (day / event). PDF rendering itself is already covered by
 * receipt/pdf.test.ts; this only checks the route produces a well-formed ZIP
 * with the expected entries for a realistic set of invoices.
 */
import unzipper from 'unzipper';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestRegister, createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let registerId: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.name, 'pw');
  const register = await createTestRegister({ type: 'receipt_register' });
  registerId = register.id;
});

/** Extracts the set of file names contained in a ZIP buffer. */
async function zipEntryNames(buf: Buffer): Promise<string[]> {
  const directory = await unzipper.Open.buffer(buf);
  return directory.files.map((f) => f.path);
}

describe('GET /api/admin/exports/invoices/day', () => {
  it('returns 400 without a date, and 400 for a malformed one', async () => {
    const app = await getTestApp();
    const missing = await app.inject({ method: 'GET', url: '/api/admin/exports/invoices/day', headers: { cookie: adminCookie } });
    expect(missing.statusCode).toBe(400);
    const malformed = await app.inject({ method: 'GET', url: '/api/admin/exports/invoices/day?date=not-a-date', headers: { cookie: adminCookie } });
    expect(malformed.statusCode).toBe(400);
  });

  it('returns 404 when no invoice exists on that day', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/invoices/day?date=2026-01-01',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('bundles one PDF per invoice on the requested day, one entry per receipt number, and skips a different day', async () => {
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', 'tok-1', '2026-08-05 10:00:00'),
              ($1, 2, 'cancellation', 'cash', 'tok-2', '2026-08-05 11:00:00'),
              ($1, 3, 'sales_receipt', 'cash', 'tok-3', '2026-08-06 10:00:00')`,
      [registerId],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/invoices/day?date=2026-08-05',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');

    const names = await zipEntryNames(response.rawPayload);
    expect(names).toHaveLength(2);
    for (const name of names) {
      expect(name).toMatch(/\.pdf$/);
    }
  });
});

describe('GET /api/admin/exports/invoices/event', () => {
  it('returns 404 when no event exists', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/invoices/event',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('bundles every invoice within the event window, including a training receipt', async () => {
    const event = await pool.query<{ id: string }>(
      `INSERT INTO event (name, start_time, end_time)
       VALUES ('Sommerfest', '2026-08-05 00:00:00', '2026-08-07 00:00:00') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', 'tok-1', '2026-08-05 10:00:00'),
              ($1, 2, 'training', 'cash', 'tok-2', '2026-08-06 10:00:00'),
              ($1, 3, 'sales_receipt', 'cash', 'tok-3', '2026-08-10 10:00:00')`,
      [registerId],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/invoices/event?event_id=${event.rows[0]!.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const names = await zipEntryNames(response.rawPayload);
    expect(names).toHaveLength(2); // the 2026-08-10 invoice is outside the event window
  });

  it('rejects the request without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/exports/invoices/day?date=2026-08-05' });
    expect(response.statusCode).toBe(401);
  });
});
