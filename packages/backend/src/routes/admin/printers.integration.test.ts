/** Integration tests for DELETE /api/admin/printers/:id — see Task #57 and Task #96. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestArticle, createTestPrinter, createTestRegister, createTestUser } from '../../test/fixtures.js';
import { MAX_ATTEMPTS } from '../../print/worker.helpers.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('DELETE /api/admin/printers/:id', () => {
  it('deletes an unused printer', async () => {
    const printer = await createTestPrinter();
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/printers/${printer.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
  });

  it('returns 404 for a printer that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: '/api/admin/printers/00000000-0000-0000-0000-000000000000',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('deletes a printer still referenced by a register, clearing the reference instead of blocking (Task #96)', async () => {
    const printer = await createTestPrinter();
    const register = await createTestRegister({ printerId: printer.id });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/printers/${printer.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);

    const gone = await pool.query('SELECT id FROM printer WHERE id = $1', [printer.id]);
    expect(gone.rowCount).toBe(0);
    const registerRow = await pool.query<{ printer_id: string | null }>(
      'SELECT printer_id FROM register WHERE id = $1', [register.id],
    );
    expect(registerRow.rows[0]!.printer_id).toBeNull();
  });

  it('deletes a printer still referenced by an article, clearing the reference (Task #96)', async () => {
    const printer = await createTestPrinter();
    const article = await createTestArticle({ printerId: printer.id });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/printers/${printer.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);

    const articleRow = await pool.query<{ printer_id: string | null }>(
      'SELECT printer_id FROM article WHERE id = $1', [article.id],
    );
    expect(articleRow.rows[0]!.printer_id).toBeNull();
  });

  it('terminally fails pending/printing jobs for the deleted printer instead of leaving them stuck (Task #96)', async () => {
    const printer = await createTestPrinter();
    const pendingJob = await pool.query<{ id: string }>(
      `INSERT INTO print_job (printer_id, type, content, status)
       VALUES ($1, 'test_print', 'AA==', 'pending') RETURNING id`,
      [printer.id],
    );
    const printingJob = await pool.query<{ id: string }>(
      `INSERT INTO print_job (printer_id, type, content, status)
       VALUES ($1, 'test_print', 'AA==', 'printing') RETURNING id`,
      [printer.id],
    );
    const doneJob = await pool.query<{ id: string }>(
      `INSERT INTO print_job (printer_id, type, content, status)
       VALUES ($1, 'test_print', 'AA==', 'done') RETURNING id`,
      [printer.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/printers/${printer.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);

    const jobs = await pool.query<{ id: string; status: string; attempts: number; error_message: string | null; printer_id: string | null }>(
      'SELECT id, status, attempts, error_message, printer_id FROM print_job ORDER BY id',
    );
    const byId = new Map(jobs.rows.map((r) => [r.id, r]));
    expect(byId.get(pendingJob.rows[0]!.id)).toMatchObject({
      status: 'failed', attempts: MAX_ATTEMPTS, error_message: 'Drucker wurde gelöscht', printer_id: null,
    });
    expect(byId.get(printingJob.rows[0]!.id)).toMatchObject({
      status: 'failed', attempts: MAX_ATTEMPTS, error_message: 'Drucker wurde gelöscht', printer_id: null,
    });
    // Already-terminal jobs are left alone (status untouched), only printer_id is cleared.
    expect(byId.get(doneJob.rows[0]!.id)).toMatchObject({ status: 'done', printer_id: null });
  });
});
