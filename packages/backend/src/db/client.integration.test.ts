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
