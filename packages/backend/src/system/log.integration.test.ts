/** Integration test for `logSystemEvent` — needs a real Postgres since it's a single-row INSERT. */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';
import { logSystemEvent } from './log.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

beforeEach(async () => { await truncateAllTables(); });

describe('logSystemEvent', () => {
  it('inserts a row with the given severity, category, and message', async () => {
    await logSystemEvent('warning', 'tse_health', 'TSE nicht erreichbar');

    const result = await pool.query(
      `SELECT severity, category, message FROM system_log`,
    );
    expect(result.rows).toEqual([
      { severity: 'warning', category: 'tse_health', message: 'TSE nicht erreichbar' },
    ]);
  });

  it('rejects an invalid severity via the DB check constraint', async () => {
    await expect(
      // @ts-expect-error deliberately passing an invalid severity to exercise the DB-level check constraint
      logSystemEvent('critical', 'tse_health', 'x'),
    ).rejects.toThrow();
  });
});
