/** Integration tests for the system-log viewer endpoints. */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
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

/** Inserts a system_log row directly, bypassing the HTTP layer — this test file exercises reading, not writing (see system/log.integration.test.ts for that). */
async function insertLog(severity: string, category: string, message: string): Promise<void> {
  await pool.query(
    `INSERT INTO system_log (severity, category, message) VALUES ($1, $2, $3)`,
    [severity, category, message],
  );
}

describe('GET /api/admin/logs', () => {
  it('returns entries newest first', async () => {
    await insertLog('info', 'tse_health', 'first');
    await insertLog('warning', 'tse_health', 'second');

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/logs',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(2);
    expect(body[0].message).toBe('second');
    expect(body[1].message).toBe('first');
  });

  it('filters by severity', async () => {
    await insertLog('info', 'tse_health', 'a');
    await insertLog('warning', 'tse_health', 'b');

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/logs?severity=warning',
      headers: { cookie: adminCookie },
    });
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].message).toBe('b');
  });

  it('filters by category', async () => {
    await insertLog('info', 'tse_health', 'a');
    await insertLog('info', 'other', 'b');

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/logs?category=other',
      headers: { cookie: adminCookie },
    });
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].message).toBe('b');
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/logs' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a Veranstaltungs-Administrator (System-Administrator only, Task #94)', async () => {
    const eventAdmin = await createTestUser({ isEventAdmin: true, password: 'pw' });
    const eventAdminCookie = await loginAsAdmin(await getTestApp(), eventAdmin.pin, eventAdmin.password);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/logs',
      headers: { cookie: eventAdminCookie },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('GET /api/admin/logs/categories', () => {
  it('returns the distinct categories seen so far', async () => {
    await insertLog('info', 'tse_health', 'a');
    await insertLog('info', 'tse_health', 'b');
    await insertLog('info', 'other', 'c');

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/logs/categories',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(['other', 'tse_health']);
  });
});
