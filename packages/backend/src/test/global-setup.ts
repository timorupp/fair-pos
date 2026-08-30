/**
 * Vitest globalSetup for integration tests.
 *
 * Runs ONCE per `vitest run` invocation (before any worker starts). Boots a
 * single Postgres container, applies the production migrations against it, and
 * exposes the connection URL to workers via the `provide` mechanism. The
 * returned teardown function stops the container when the entire test run ends.
 *
 * Each worker pulls the URL out via `inject('databaseUrl')` in
 * `integration-setup.ts` and sets `DATABASE_URL` BEFORE any business module
 * is imported.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Path to the production migrations directory. */
const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
);

declare module 'vitest' {
  // Augment the provided context with our injected keys.
  interface ProvidedContext {
    /** Postgres connection URI handed to worker processes. */
    databaseUrl: string;
  }
}

/** GlobalSetup function signature: receives a `provide` callback, returns teardown. */
type SetupContext = { provide: (key: 'databaseUrl', value: string) => void };

let container: StartedPostgreSqlContainer | null = null;

/**
 * Starts the test container, runs migrations, and provides the URL to workers.
 *
 * @param ctx - Vitest setup context with the `provide` helper.
 * @returns Async teardown function that stops the container.
 */
export default async function setup(ctx: SetupContext): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('fairpos_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();

  // Apply migrations once so every test sees the production schema.
  const adminClient = new pg.Client({ connectionString: url });
  await adminClient.connect();
  try {
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await adminClient.query(sql);
    }
  } finally {
    await adminClient.end();
  }

  ctx.provide('databaseUrl', url);

  return async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  };
}
