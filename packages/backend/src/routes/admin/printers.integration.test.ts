/**
 * Integration tests for the printers admin routes — DELETE (Task #57/#96),
 * plus the status-probe and test-print endpoints (T-011).
 */
import net from 'node:net';
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

describe('GET /api/admin/printers/:id/status', () => {
  it('reports online when the printer accepts a TCP connection', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    try {
      const printer = await createTestPrinter({ port });
      const app = await getTestApp();
      const response = await app.inject({
        method: 'GET', url: `/api/admin/printers/${printer.id}/status`,
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ online: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reports offline when the printer refuses the connection', async () => {
    const printer = await createTestPrinter({ port: 1 }); // nothing listens on port 1
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/printers/${printer.id}/status`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ online: false });
  });

  it('returns 404 for a printer that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/printers/00000000-0000-0000-0000-000000000000/status',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/admin/printers/:id/test-print', () => {
  it('enqueues a test_print job for the given printer and returns its id', async () => {
    const printer = await createTestPrinter();
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/admin/printers/${printer.id}/test-print`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const { print_job_id } = response.json();
    expect(print_job_id).toMatch(/^[0-9a-f-]{36}$/);

    const job = await pool.query<{ type: string; status: string; printer_id: string }>(
      'SELECT type, status, printer_id FROM print_job WHERE id = $1', [print_job_id],
    );
    expect(job.rows[0]).toMatchObject({ type: 'test_print', status: 'pending', printer_id: printer.id });
  });

  it('returns 404 for a printer that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/printers/00000000-0000-0000-0000-000000000000/test-print',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
