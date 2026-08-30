/**
 * Creates a full logical PostgreSQL backup via `pg_dump`, for the manual
 * "Backup herunterladen" admin action. Deliberately no automatic/scheduled
 * backup — see docs/Anforderungen.md "Backup-Konzept" for why (the server
 * isn't up 24/7, so a time-based trigger would routinely be missed).
 */
import { execFile } from 'node:child_process';
import { config } from '../config.js';

/** The pieces `pg_dump` needs, parsed out of `DATABASE_URL`. */
export interface DatabaseConnectionParts {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

/**
 * Parses a `postgresql://user:pass@host:port/db` connection string.
 *
 * @param databaseUrl - The connection string (i.e. `config.databaseUrl`).
 * @returns The individual connection parts.
 */
export function parseDatabaseUrl(databaseUrl: string): DatabaseConnectionParts {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

/**
 * Runs `pg_dump` against the configured database and returns the resulting
 * plain-SQL dump. Restorable with just `psql <db> < backup.sql` — no
 * `pg_restore`/custom-format tooling required, since whoever ends up using
 * this backup during an actual incident may not have that on hand.
 *
 * The password is passed via the `PGPASSWORD` environment variable, not as
 * a `pg_dump` argument — command-line arguments are visible to other local
 * users via `ps`, environment variables of another process are not.
 *
 * @returns The complete SQL dump as a Buffer.
 * @throws When `pg_dump` exits non-zero (bad credentials, binary missing, ...).
 */
export function createDatabaseDump(): Promise<Buffer> {
  const { host, port, user, password, database } = parseDatabaseUrl(config.databaseUrl);
  return new Promise((resolve, reject) => {
    execFile(
      config.pgDumpPath ?? 'pg_dump',
      ['-h', host, '-p', port, '-U', user, database],
      { env: { ...process.env, PGPASSWORD: password }, maxBuffer: 1024 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout, stderr) => {
        if (err) {
          const message = Buffer.isBuffer(stderr) ? stderr.toString('utf-8').trim() : '';
          reject(new Error(`pg_dump fehlgeschlagen: ${message || err.message}`));
          return;
        }
        resolve(stdout as unknown as Buffer);
      },
    );
  });
}
