/**
 * Per-worker setup for integration tests.
 *
 * Reads the database URL the globalSetup made available via `inject`, then
 * sets `process.env.DATABASE_URL` BEFORE any business module is loaded. Module
 * caching means the production `db/client.ts` will create its shared pool
 * against this URL when it is first imported in a test.
 *
 * Must be the very first setup file in `vitest.integration.config.ts` so it
 * runs before any test imports application code.
 */

import { inject } from 'vitest';

process.env['DATABASE_URL'] = inject('databaseUrl');
process.env['SESSION_SECRET'] = process.env['SESSION_SECRET'] ?? 'test-secret-not-used-by-integration-tests';
process.env['PIN_HASH_SECRET'] = process.env['PIN_HASH_SECRET'] ?? 'test-pin-secret-not-used-by-integration-tests';
