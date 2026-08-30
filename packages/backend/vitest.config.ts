/**
 * Vitest configuration for the backend package — UNIT tests only.
 *
 * Integration tests live in `*.integration.test.ts` files and are excluded
 * here; they are picked up by `vitest.integration.config.ts` which boots a
 * Postgres container via testcontainers. End-to-end tests live in
 * `*.e2e.test.ts` files, picked up by `vitest.e2e.config.ts`, which runs
 * against a real, already-running FairPOS instance instead of either of the
 * above.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/*.e2e.test.ts', '**/node_modules/**'],
    environment: 'node',
    // config.ts requires these at import time (fail-fast in production). Unit
    // tests never touch a real DB/session, but any module that transitively
    // imports config.ts (e.g. receipt/qr.ts needs config.tseClientId) would
    // otherwise crash on import unless a test sets them itself first, which
    // is fragile and depends on file/worker ordering (see tse/client.test.ts
    // for that per-test-file workaround, still needed there since it exercises
    // config.tseMountPoint/tseClientId directly).
    env: {
      SESSION_SECRET: 'unit-test-secret-not-used',
      PIN_HASH_SECRET: 'unit-test-pin-secret-not-used',
      DATABASE_URL: 'postgres://unit-test/unused',
    },
  },
});
