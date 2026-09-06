/**
 * Integration tests for the print worker's job-processing logic
 * (DANGER.md T-010) — atomic claim, crash recovery, retry-with-cooldown,
 * terminal failure. Uses a real Postgres plus a real `net.createServer`
 * mock TCP printer (no mocked TCP layer) so the actual `sendToPrinter`
 * code path is exercised end to end.
 *
 * `startPrintWorker()` itself (the LISTEN/NOTIFY + setInterval loop) isn't
 * exercised directly — its individual pieces (`processJob`, `retryPending`,
 * `recoverInFlight`) are exported specifically so tests can call them
 * without needing a live NOTIFY or waiting on the real retry interval.
 */

import net from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';
import { createTestPrinter } from '../test/fixtures.js';
import { enqueuePrintJob } from '../print/enqueue.js';
import { MAX_ATTEMPTS } from '../print/worker.helpers.js';
import { processJob, retryPending, recoverInFlight } from './print-worker.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);
beforeEach(async () => { await truncateAllTables(); });

/** A minimal, valid `PrintBlock[]` — content doesn't matter for these tests, only that a job row exists. */
const BLOCKS = [{ kind: 'text' as const, text: 'test' }];

/** Starts a mock TCP printer on an OS-assigned free port. Collects every connection's full received payload. */
async function startMockPrinter(): Promise<{ port: number; received: Buffer[]; close: () => Promise<void> }> {
  const received: Buffer[] = [];
  const server = net.createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', () => received.push(Buffer.concat(chunks)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function jobRow(id: string) {
  const result = await pool.query<{ status: string; attempts: number; error_message: string | null }>(
    `SELECT status, attempts, error_message FROM print_job WHERE id = $1`, [id],
  );
  return result.rows[0]!;
}

describe('processJob', () => {
  let mockPrinter: Awaited<ReturnType<typeof startMockPrinter>>;
  beforeEach(async () => { mockPrinter = await startMockPrinter(); });
  afterEach(async () => { await mockPrinter.close(); });

  it('sends the job content to the assigned printer and marks it done', async () => {
    const printer = await createTestPrinter({ port: mockPrinter.port });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('hello printer'), BLOCKS);

    await processJob(job.id);

    const row = await jobRow(job.id);
    expect(row.status).toBe('done');
    expect(row.error_message).toBeNull();
    expect(row.attempts).toBe(1);
    expect(mockPrinter.received[0]?.toString()).toBe('hello printer');
  });

  it('leaves an already-claimed (non-pending) job untouched — the second call is a no-op', async () => {
    const printer = await createTestPrinter({ port: mockPrinter.port });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('once'), BLOCKS);

    await processJob(job.id);
    await processJob(job.id); // already 'done' — claimJob's WHERE status='pending' must not match

    expect(mockPrinter.received).toHaveLength(1);
    expect((await jobRow(job.id)).attempts).toBe(1);
  });

  it("claims atomically — two concurrent calls for the same job only send it once", async () => {
    const printer = await createTestPrinter({ port: mockPrinter.port });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('concurrent'), BLOCKS);

    await Promise.all([processJob(job.id), processJob(job.id)]);

    expect(mockPrinter.received).toHaveLength(1);
    const row = await jobRow(job.id);
    expect(row.status).toBe('done');
    expect(row.attempts).toBe(1);
  });

  it('retries (stays pending) on a connection failure while attempts remain', async () => {
    // Nothing listens on this port — sendToPrinter rejects with ECONNREFUSED.
    const printer = await createTestPrinter({ port: 1 });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('x'), BLOCKS);

    await processJob(job.id);

    const row = await jobRow(job.id);
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.error_message).not.toBeNull();
  });

  it('marks a job terminally failed once MAX_ATTEMPTS is reached', async () => {
    const printer = await createTestPrinter({ port: 1 });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('x'), BLOCKS);
    await pool.query(`UPDATE print_job SET attempts = $2 WHERE id = $1`, [job.id, MAX_ATTEMPTS - 1]);

    await processJob(job.id);

    const row = await jobRow(job.id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(MAX_ATTEMPTS);
  });
});

describe('recoverInFlight', () => {
  it('resets printing rows back to pending (crash recovery)', async () => {
    const printer = await createTestPrinter();
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('x'), BLOCKS);
    await pool.query(`UPDATE print_job SET status = 'printing' WHERE id = $1`, [job.id]);

    await recoverInFlight();

    expect((await jobRow(job.id)).status).toBe('pending');
  });

  it('leaves pending/done jobs alone', async () => {
    const printer = await createTestPrinter();
    const pending = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('x'), BLOCKS);
    const done = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('y'), BLOCKS);
    await pool.query(`UPDATE print_job SET status = 'done' WHERE id = $1`, [done.id]);

    await recoverInFlight();

    expect((await jobRow(pending.id)).status).toBe('pending');
    expect((await jobRow(done.id)).status).toBe('done');
  });
});

describe('retryPending', () => {
  let mockPrinter: Awaited<ReturnType<typeof startMockPrinter>>;
  beforeEach(async () => { mockPrinter = await startMockPrinter(); });
  afterEach(async () => { await mockPrinter.close(); });

  it('processes a never-attempted job (last_attempt_at IS NULL)', async () => {
    const printer = await createTestPrinter({ port: mockPrinter.port });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('fresh'), BLOCKS);

    await retryPending();

    expect((await jobRow(job.id)).status).toBe('done');
  });

  it('skips a job whose last attempt is still within the cooldown', async () => {
    const printer = await createTestPrinter({ port: mockPrinter.port });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('recent'), BLOCKS);
    await pool.query(`UPDATE print_job SET last_attempt_at = now() WHERE id = $1`, [job.id]);

    await retryPending();

    expect(mockPrinter.received).toHaveLength(0);
    expect((await jobRow(job.id)).status).toBe('pending');
  });

  it('processes a job whose last attempt is older than the cooldown', async () => {
    const printer = await createTestPrinter({ port: mockPrinter.port });
    const job = await enqueuePrintJob(printer.id, 'test_print', Buffer.from('stale'), BLOCKS);
    await pool.query(
      `UPDATE print_job SET last_attempt_at = now() - interval '1 hour' WHERE id = $1`, [job.id],
    );

    await retryPending();

    expect((await jobRow(job.id)).status).toBe('done');
  });
});
