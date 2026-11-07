/**
 * Integration tests for `withTransaction` — needs a real Postgres, since
 * this is specifically about actual COMMIT/ROLLBACK behaviour (T-002).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool, withTransaction } from './client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

beforeEach(async () => { await truncateAllTables(); });

/** Counts rows currently in `system_log` — a simple, FK-free table to exercise commit/rollback against. */
async function countLogRows(): Promise<number> {
  const result = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM system_log`);
  return Number(result.rows[0]!.count);
}

describe('withTransaction', () => {
  it('commits changes made inside the callback on success', async () => {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO system_log (severity, category, message) VALUES ('info', 'test', 'committed')`,
      );
    });
    expect(await countLogRows()).toBe(1);
  });

  it('rolls back changes made inside the callback when it throws', async () => {
    await expect(
      withTransaction(async (client) => {
        await client.query(
          `INSERT INTO system_log (severity, category, message) VALUES ('info', 'test', 'rolled back')`,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await countLogRows()).toBe(0);
  });

  it('re-throws the original error unchanged', async () => {
    class CustomError extends Error {}
    await expect(
      withTransaction(async () => {
        throw new CustomError('specific failure');
      }),
    ).rejects.toBeInstanceOf(CustomError);
  });

  it('releases the client back to the pool after an error, so a later call still works', async () => {
    await withTransaction(async () => {
      throw new Error('first call fails');
    }).catch(() => { /* expected */ });

    // If the failed call's client were never released, this would hang until
    // the pool's connection-acquire timeout instead of completing normally.
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO system_log (severity, category, message) VALUES ('info', 'test', 'after failure')`,
      );
    });
    expect(await countLogRows()).toBe(1);
  });

  it('returns the callback result forwarded on success, but only on success', async () => {
    const result = await withTransaction(async () => 'ok');
    expect(result).toBe('ok');
  });
});

describe('session timezone (D-076)', () => {
  it('pins every new connection\'s session timezone to Node\'s own resolved timezone', async () => {
    // Runs the check on several connections pulled from the pool, not just
    // one — the fix is a `pool.on('connect', ...)` handler, so it must hold
    // for every physical connection the pool opens, not merely the first.
    const nodeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (let i = 0; i < 3; i++) {
      const result = await pool.query<{ tz: string }>(`SELECT current_setting('timezone') AS tz`);
      expect(result.rows[0]!.tz).toBe(nodeTz);
    }
  });

  it('makes a Postgres-side ::date cast agree with Node-side local-date bucketing for the same instant', async () => {
    // The actual D-076 scenario: a single instant, bucketed by two
    // previously-independent clocks, must now agree.
    const now = new Date();
    const nodeSideDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const result = await pool.query<{ day: string }>(
      `SELECT to_char($1::timestamptz::date, 'YYYY-MM-DD') AS day`, [now.toISOString()],
    );
    expect(result.rows[0]!.day).toBe(nodeSideDay);
  });
});
