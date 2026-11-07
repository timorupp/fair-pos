import pg from 'pg';
import { config } from '../config.js';

/**
 * Node's own resolved timezone (IANA name, e.g. `Europe/Berlin`, or `UTC`) —
 * applied to every new pool connection below (D-076). Without this,
 * Postgres-side calendar-day bucketing (`created_at::date` casts,
 * `current_date` defaults) follows Postgres' own session timezone, which
 * could silently diverge from the Node-side bucketing every closing/pending
 * calculation otherwise uses (`closing/pending.ts`'s `localDateString()`,
 * built from `Date`'s local getters) — e.g. a booking near midnight could
 * land on a different calendar day depending on which side computed it.
 */
const NODE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Shared PostgreSQL connection pool.
 * One pool instance is reused across the entire application lifetime.
 *
 * `options: '-c timezone=...'` (D-076) sets the session timezone as part of
 * the connection's own startup handshake — a libpq/Postgres startup
 * parameter, not a follow-up query. A first attempt ran `SET timezone = ...`
 * from a `pool.on('connect', ...)` handler instead; that raced the pool's
 * own next query on the same freshly-opened client (pg's "client.query()
 * when the client is already executing a query" deprecation warning, found
 * live) — this way there is no second query to race in the first place.
 * IANA zone names never contain characters `-c NAME=VALUE` can't carry
 * (no spaces, no `=`), so no escaping is needed here.
 */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  options: `-c timezone=${NODE_TIMEZONE}`,
});

/**
 * Executes a single SQL query against the shared pool. Use this for simple
 * queries that don't need an explicit transaction.
 *
 * @param sql - Parameterised SQL string; use `$1`, `$2`… for placeholders.
 * @param params - Optional positional parameters matching the placeholders.
 * @returns The pg query result; the row type is the generic parameter.
 */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

/**
 * Checks whether a caught error is a Postgres error with the given SQLSTATE
 * code (e.g. `23503` foreign-key violation, `23505` unique violation) — the
 * `pg` driver attaches `code` to the thrown error but doesn't type it, so
 * every route that wants to turn a specific constraint violation into a
 * clean 409 instead of a raw 500 needs this same cast.
 *
 * @param e - The caught value (from a `catch` block, hence `unknown`).
 * @param code - The Postgres SQLSTATE code to check for.
 * @returns `true` if `e` is a Postgres error with exactly this code.
 */
export function isPgErrorCode(e: unknown, code: string): boolean {
  return (e as { code?: string }).code === code;
}

/**
 * Runs a callback inside a database transaction. Automatically `COMMIT`s on
 * success or `ROLLBACK`s if the callback throws. The pooled client is always
 * released back to the pool, even on error.
 *
 * @param fn - Callback that performs queries using the given client.
 * @returns Whatever `fn` returned (forwarded only on success).
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
