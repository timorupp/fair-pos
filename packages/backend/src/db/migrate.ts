/**
 * Minimal SQL migration runner.
 * Reads all *.sql files from the migrations/ directory in alphabetical order
 * and runs any that have not been recorded in the schema_migrations table.
 * Safe to run on every application startup.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { selectPendingMigrations } from './migrate.helpers.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('Missing required environment variable: DATABASE_URL');

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

/** Ensures the schema_migrations tracking table exists. */
async function ensureMigrationsTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Returns the set of migration filenames that have already been applied. */
async function appliedMigrations(client: pg.Client): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY filename',
  );
  return new Set(result.rows.map((r) => r.filename));
}

/** Runs all pending SQL migration files in order. */
export async function runMigrations(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await appliedMigrations(client);

    const allFiles = await fs.readdir(MIGRATIONS_DIR);
    const pending = selectPendingMigrations(allFiles, applied);

    for (const filename of pending) {
      console.log(`[migrate] applying ${filename}`);
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      console.log(`[migrate] applied  ${filename}`);
    }
  } finally {
    await client.end();
  }
}

// Allow running directly: tsx src/db/migrate.ts
// Guard prevents auto-execution when imported as a module from index.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  });
}
