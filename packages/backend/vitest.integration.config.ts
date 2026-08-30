/**
 * Vitest config for integration tests.
 *
 * Picks up files matching `*.integration.test.ts`, starts a single Postgres
 * container once per run via `globalSetup`, and runs all tests serially in
 * one worker so they share the container's state without race conditions.
 *
 * Plain unit tests stay in `vitest.config.ts` and don't need the container.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/integration-setup.ts'],
    // Single worker so the truncate-per-test strategy is race-free.
    // Vitest 4 dropped `poolOptions.*.singleThread` in favour of file-level `fileParallelism`.
    fileParallelism: false,
    // Container start can take a few seconds on first pull; give each test some breathing room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
