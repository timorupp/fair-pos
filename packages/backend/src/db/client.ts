import pg from 'pg';
import { config } from '../config.js';

/**
 * Shared PostgreSQL connection pool.
 * One pool instance is reused across the entire application lifetime.
 */
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/**
 * Executes a single SQL query against the shared pool.
 * Use this for simple queries that don't need an explicit transaction.
 */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

/**
 * Runs a callback inside a database transaction.
 * Automatically commits on success or rolls back on error.
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
