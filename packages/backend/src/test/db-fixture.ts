/**
 * Test helpers used inside integration test files.
 *
 * The container itself is started by `global-setup.ts`; this module assumes
 * the shared production pool is already configured (via `integration-setup.ts`
 * having set `DATABASE_URL` before any business import).
 */

import { pool } from '../db/client.js';
import { config } from '../config.js';

/** Cached list of public-schema tables, populated on first call. */
let tableNames: string[] | null = null;

/**
 * Empties every table in the test DB while keeping the schema intact, then
 * re-seeds a default active event (Task #95), since after Task #95's Phase 2
 * migrations, most entities (articles, registers, layouts, floor plan,
 * invoices, ...) require a valid `event_id` to insert at all. Deliberately
 * unconditional here, unlike migration 0019 (which only seeds a dummy
 * "Altbestand" event when pre-existing data needs one, never on a genuinely
 * fresh database) — tests always want *some* active event to attach
 * fixtures to, regardless of that production-only distinction.
 *
 * Use this in `beforeEach` so each test starts from a clean slate. `CASCADE`
 * makes the order of tables irrelevant; `RESTART IDENTITY` resets any sequences.
 * The other system_setting bootstrap rows (`receipt_counter`, `system_serial`)
 * are still wiped without being re-seeded — re-seed them in the test if your
 * code under test reads them.
 *
 * @returns The freshly-seeded default event's id, for tests that need to
 *   reference it explicitly (e.g. to assert data landed in the right event).
 */
export async function truncateAllTables(): Promise<string> {
  if (!tableNames) {
    const result = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        AND tablename <> 'schema_migrations'`,
    );
    tableNames = result.rows.map((r) => r.tablename);
  }
  if (tableNames.length > 0) {
    const quoted = tableNames.map((t) => `"${t}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  }

  const seeded = await pool.query<{ id: string }>(
    `INSERT INTO event (name, start_time, end_time) VALUES ('Testveranstaltung', now() - interval '1 day', now() + interval '1 day') RETURNING id`,
  );
  const eventId = seeded.rows[0]!.id;
  await pool.query(
    `INSERT INTO system_setting (key, value) VALUES ('active_event_id', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [eventId],
  );
  config.activeEventId = eventId;
  return eventId;
}
