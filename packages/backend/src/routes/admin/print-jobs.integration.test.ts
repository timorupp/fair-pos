/**
 * Integration tests for the print-queue admin endpoints — in particular
 * Task #79: `DELETE /api/admin/print-jobs/:id` now sets `status = 'cancelled'`
 * instead of removing the row, so a cancelled job stays visible via the
 * status filter instead of silently disappearing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestPrinter, createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let printerId: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
  printerId = (await createTestPrinter()).id;
});

/** Inserts a print_job row directly with the given status. */
async function insertJob(status: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO print_job (printer_id, type, content, status) VALUES ($1, 'test_print', 'x', $2) RETURNING id`,
    [printerId, status],
  );
  return result.rows[0]!.id;
}

describe('DELETE /api/admin/print-jobs/:id', () => {
  it('sets status to cancelled instead of removing the row', async () => {
    const jobId = await insertJob('pending');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/print-jobs/${jobId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);

    const row = await pool.query<{ status: string }>(`SELECT status FROM print_job WHERE id = $1`, [jobId]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.status).toBe('cancelled');
  });

  it('refuses to cancel a job currently printing', async () => {
    const jobId = await insertJob('printing');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/print-jobs/${jobId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);

    const row = await pool.query<{ status: string }>(`SELECT status FROM print_job WHERE id = $1`, [jobId]);
    expect(row.rows[0]!.status).toBe('printing');
  });

  it('404s for an unknown job', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/print-jobs/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/admin/print-jobs', () => {
  it('excludes cancelled jobs from the default (non-terminal) view', async () => {
    await insertJob('pending');
    await insertJob('cancelled');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET', url: '/api/admin/print-jobs',
      headers: { cookie: adminCookie },
    });
    const rows = response.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });

  it('returns cancelled jobs when filtered explicitly, newest first', async () => {
    await insertJob('cancelled');
    await insertJob('cancelled');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET', url: '/api/admin/print-jobs?status=cancelled',
      headers: { cookie: adminCookie },
    });
    const rows = response.json();
    expect(rows).toHaveLength(2);
    expect(rows.every((r: { status: string }) => r.status === 'cancelled')).toBe(true);
  });

  it('includes cancelled jobs in the "all" view', async () => {
    await insertJob('pending');
    await insertJob('cancelled');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET', url: '/api/admin/print-jobs?status=all',
      headers: { cookie: adminCookie },
    });
    expect(response.json()).toHaveLength(2);
  });

  it('shows "Drucker gelöscht" instead of dropping a job whose printer was deleted (Task #96)', async () => {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO print_job (printer_id, type, content, status) VALUES (NULL, 'test_print', 'x', 'failed') RETURNING id`,
    );
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET', url: '/api/admin/print-jobs?status=failed',
      headers: { cookie: adminCookie },
    });
    const rows = response.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(result.rows[0]!.id);
    expect(rows[0].printer_name).toBe('Drucker gelöscht');
  });
});

describe('POST /api/admin/print-jobs/:id/retry', () => {
  it('refuses to retry a failed job whose printer was deleted (Task #96)', async () => {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO print_job (printer_id, type, content, status) VALUES (NULL, 'test_print', 'x', 'failed') RETURNING id`,
    );
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${result.rows[0]!.id}/retry`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/Drucker.*gelöscht/);

    const row = await pool.query<{ status: string }>(`SELECT status FROM print_job WHERE id = $1`, [result.rows[0]!.id]);
    expect(row.rows[0]!.status).toBe('failed');
  });

  it('retries a failed job with an intact printer', async () => {
    const jobId = await insertJob('failed');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/retry`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const row = await pool.query<{ status: string }>(`SELECT status FROM print_job WHERE id = $1`, [jobId]);
    expect(row.rows[0]!.status).toBe('pending');
  });
});
