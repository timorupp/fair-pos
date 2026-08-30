/**
 * Atomic, global, lockless-feeling receipt-number sequence.
 *
 * The numbering is held in a single row of `system_setting` keyed `receipt_counter`.
 * `nextReceiptNumber` runs one `UPDATE … RETURNING` which acquires a row-level lock
 * only for the duration of the statement (microseconds), so parallel checkouts on
 * different registers no longer serialise behind an app-wide advisory lock.
 *
 * Because the increment lives inside the calling transaction, a rollback rolls
 * the counter back too — KassenSichV's "lückenlos" requirement is preserved.
 */

import type pg from 'pg';

/** Settings key holding the last receipt number that was issued (0 if none yet). */
const COUNTER_KEY = 'receipt_counter';

/**
 * Allocates and returns the next sequential receipt number on the given pg client.
 * MUST be called inside the same transaction as the subsequent `INSERT INTO invoice`
 * so that a rollback (e.g. constraint violation downstream) also rolls the counter back.
 *
 * Throws when the counter row is missing — the bootstrap step `ensureReceiptCounter`
 * is responsible for creating it on every server start.
 *
 * @param client - An open transactional pg client.
 * @returns The freshly-allocated receipt number (e.g. 42).
 */
export async function nextReceiptNumber(client: pg.PoolClient | pg.Client): Promise<number> {
  const result = await client.query<{ value: string }>(
    `UPDATE system_setting
        SET value = (value::bigint + 1)::text,
            updated_at = now()
      WHERE key = $1
      RETURNING value`,
    [COUNTER_KEY],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `receipt_counter setting is missing — ensureReceiptCounter() must run at boot`,
    );
  }
  return Number(row.value);
}

/**
 * Creates the `receipt_counter` row if absent. Seeded from `MAX(invoice.receipt_number)`
 * so a database restore (or a long-running server crash) cannot make the counter regress
 * below the highest already-issued number.
 *
 * Idempotent — safe to call on every server start. Uses `ON CONFLICT DO NOTHING` so a
 * concurrent boot cannot create duplicate counter rows.
 *
 * @param client - Either the shared pool query function or an open client.
 */
export async function ensureReceiptCounter(
  client: pg.PoolClient | pg.Client | { query: pg.Client['query'] },
): Promise<void> {
  await client.query(
    `INSERT INTO system_setting (key, value)
     SELECT $1, COALESCE(MAX(receipt_number), 0)::text FROM invoice
     ON CONFLICT (key) DO NOTHING`,
    [COUNTER_KEY],
  );
}

/**
 * Raises the counter so the NEXT issued number is at least `desiredStart`.
 * Used when the admin edits `receipt_counter_start` to bump the sequence forward.
 *
 * Never lowers the counter — KassenSichV forbids regression of an already-issued
 * number sequence. If `desiredStart - 1` is below the current counter, this is a no-op.
 *
 * @param client - Either the shared pool query function or an open client.
 * @param desiredStart - The receipt number the admin wants the next invoice to use.
 */
export async function raiseCounterFloor(
  client: pg.PoolClient | pg.Client | { query: pg.Client['query'] },
  desiredStart: number,
): Promise<void> {
  if (!Number.isFinite(desiredStart) || desiredStart < 1) return;
  await client.query(
    `UPDATE system_setting
        SET value = GREATEST(value::bigint, $2::bigint)::text,
            updated_at = now()
      WHERE key = $1`,
    [COUNTER_KEY, String(desiredStart - 1)],
  );
}
