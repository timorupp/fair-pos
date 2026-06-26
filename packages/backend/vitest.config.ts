/**
 * Vitest configuration for the backend package — UNIT tests only.
 *
 * Integration tests live in `*.integration.test.ts` files and are excluded
 * here; they are picked up by `vitest.integration.config.ts` which boots a
 * Postgres container via testcontainers.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    environment: 'node',
  },
});
