/**
 * Test helpers used inside integration test files.
 *
 * The container itself is started by `global-setup.ts`; this module assumes
 * the shared production pool is already configured (via `integration-setup.ts`
 * having set `DATABASE_URL` before any business import).
 */

import { pool } from '../db/client.js';

/** Cached list of public-schema tables, populated on first call. */
let tableNames: string[] | null = null;

/**
 * Empties every table in the test DB while keeping the schema intact.
 *
 * Use this in `beforeEach` so each test starts from a clean slate. `CASCADE`
 * makes the order of tables irrelevant; `RESTART IDENTITY` resets any sequences.
 * The system_setting bootstrap rows (`receipt_counter`, `system_serial`) are
 * also wiped — re-seed them in the test if your code under test reads them.
 */
export async function truncateAllTables(): Promise<void> {
  if (!tableNames) {
    const result = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        AND tablename <> 'schema_migrations'`,
    );
    tableNames = result.rows.map((r) => r.tablename);
  }
  if (tableNames.length === 0) return;
  const quoted = tableNames.map((t) => `"${t}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}
