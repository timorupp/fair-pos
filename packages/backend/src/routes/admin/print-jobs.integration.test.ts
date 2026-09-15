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

/** Inserts a print_job row with a real, minimal block list (Task #105) so `/pdf`/`/reprint` have something to render. */
async function insertJobWithBlocks(
  type: string, printerIdOverride?: string | null,
): Promise<string> {
  const blocks = [{ kind: 'text', text: 'Hallo Welt' }];
  const targetPrinterId = printerIdOverride === undefined ? printerId : printerIdOverride;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO print_job (printer_id, type, content, blocks, status)
     VALUES ($1, $2, 'x', $3, 'done') RETURNING id`,
    [targetPrinterId, type, JSON.stringify(blocks)],
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

describe('GET /api/admin/print-jobs/:id/pdf (Task #105)', () => {
  it.each(['receipt', 'daily_closing', 'order_slip', 'test_print'])(
    'renders a PDF for a %s job from its persisted blocks',
    async (type) => {
      const jobId = await insertJobWithBlocks(type);
      const app = await getTestApp();

      const response = await app.inject({
        method: 'GET', url: `/api/admin/print-jobs/${jobId}/pdf`,
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    },
  );

  it('refuses a PIN-slip job (security — the PIN is never stored anywhere else)', async () => {
    const jobId = await insertJobWithBlocks('pin_slip');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET', url: `/api/admin/print-jobs/${jobId}/pdf`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('404s for an unknown job', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/print-jobs/00000000-0000-0000-0000-000000000000/pdf`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/admin/print-jobs/:id/reprint (Task #105)', () => {
  it('enqueues a new job with the same type/blocks, not the original id', async () => {
    const jobId = await insertJobWithBlocks('order_slip');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/reprint`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const newJobId = response.json().print_job_id;
    expect(newJobId).not.toBe(jobId);

    const row = await pool.query<{ type: string; status: string; printer_id: string }>(
      `SELECT type, status, printer_id FROM print_job WHERE id = $1`, [newJobId],
    );
    expect(row.rows[0]!.type).toBe('order_slip');
    expect(row.rows[0]!.status).toBe('pending');
    expect(row.rows[0]!.printer_id).toBe(printerId);
  });

  it('refuses a PIN-slip job (security)', async () => {
    const jobId = await insertJobWithBlocks('pin_slip');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/reprint`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses when the original printer was deleted (same rule as /retry)', async () => {
    const jobId = await insertJobWithBlocks('test_print', null);
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/reprint`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);
  });

  it('404s for an unknown job', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/00000000-0000-0000-0000-000000000000/reprint`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  // Task #108: printer-selection dialog instead of always the original printer.
  it('reprints to an explicitly chosen printer instead of the original', async () => {
    const otherPrinter = await createTestPrinter({ name: 'Anderer Drucker' });
    const jobId = await insertJobWithBlocks('order_slip');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/reprint`,
      headers: { cookie: adminCookie }, payload: { printer_id: otherPrinter.id },
    });
    expect(response.statusCode).toBe(200);
    const row = await pool.query<{ printer_id: string }>(
      `SELECT printer_id FROM print_job WHERE id = $1`, [response.json().print_job_id],
    );
    expect(row.rows[0]!.printer_id).toBe(otherPrinter.id);
  });

  it('recovers from a deleted original printer when an explicit printer_id is given', async () => {
    const jobId = await insertJobWithBlocks('test_print', null);
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/reprint`,
      headers: { cookie: adminCookie }, payload: { printer_id: printerId },
    });
    expect(response.statusCode).toBe(200);
  });

  it('rejects an unknown printer_id with 400', async () => {
    const jobId = await insertJobWithBlocks('order_slip');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: `/api/admin/print-jobs/${jobId}/reprint`,
      headers: { cookie: adminCookie }, payload: { printer_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/admin/print-jobs/cancel-all (Task #107)', () => {
  it('cancels every pending job, leaving failed/done/cancelled untouched', async () => {
    const pending1 = await insertJob('pending');
    const pending2 = await insertJob('pending');
    const failed = await insertJob('failed');
    const done = await insertJob('done');
    const app = await getTestApp();

    const response = await app.inject({
      method: 'POST', url: '/api/admin/print-jobs/cancel-all',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().cancelled).toBe(2);

    const rows = await pool.query<{ id: string; status: string }>(`SELECT id, status FROM print_job`);
    const statusById = new Map(rows.rows.map((r) => [r.id, r.status]));
    expect(statusById.get(pending1)).toBe('cancelled');
    expect(statusById.get(pending2)).toBe('cancelled');
    expect(statusById.get(failed)).toBe('failed');
    expect(statusById.get(done)).toBe('done');
  });

  it('does not touch a job currently printing', async () => {
    const printing = await insertJob('printing');
    const app = await getTestApp();

    await app.inject({
      method: 'POST', url: '/api/admin/print-jobs/cancel-all',
      headers: { cookie: adminCookie },
    });
    const row = await pool.query<{ status: string }>(`SELECT status FROM print_job WHERE id = $1`, [printing]);
    expect(row.rows[0]!.status).toBe('printing');
  });

  it('returns cancelled: 0 when there is nothing pending', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/print-jobs/cancel-all',
      headers: { cookie: adminCookie },
    });
    expect(response.json().cancelled).toBe(0);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/print-jobs/cancel-all' });
    expect(response.statusCode).toBe(401);
  });
});
