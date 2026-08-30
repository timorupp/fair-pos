/** Integration tests for the manually-triggered system health checks (Task #87). */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('GET /api/admin/health-checks', () => {
  it('runs every registered check and returns one result each', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/health-checks',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const { checks } = response.json();
    const ids = checks.map((c: { id: string }) => c.id);
    expect(ids).toEqual(['disk-space', 'database-integrity', 'smart-health']);
    for (const check of checks) {
      expect(['ok', 'warning', 'error']).toContain(check.status);
      expect(typeof check.message).toBe('string');
      expect(check.message.length).toBeGreaterThan(0);
    }
    // Real DB, real filesystem — expected healthy in the test environment.
    const byId = Object.fromEntries(checks.map((c: { id: string; status: string }) => [c.id, c.status]));
    expect(byId['database-integrity']).toBe('ok');
  });

  it('requires authentication', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/health-checks' });
    expect(response.statusCode).toBe(401);
  });
});
