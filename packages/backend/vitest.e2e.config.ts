/**
 * Vitest config for end-to-end tests (Task #53) — deterministic, scripted
 * HTTP tests against a REAL, already-running FairPOS instance (e.g. a fresh
 * native installation, see docs/Installationsanleitung.md), not the
 * mocked/containerized environment `vitest.config.ts`/`vitest.integration.config.ts`
 * use. Nothing here starts a server or a database — see src/e2e/README.md.
 *
 * Target instance: E2E_BASE_URL (default http://localhost:3000).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    environment: 'node',
    // Runs against a real server over real HTTP — no artificial time pressure,
    // but also no reason to wait forever if something's actually broken.
    testTimeout: 30_000,
    // Scenarios build on each other within one file (login once, reuse the
    // session) — keep files serial to avoid one flow's side effects (e.g. a
    // Tagesabschluss) confusing another's assumptions about open state.
    fileParallelism: false,
  },
});
