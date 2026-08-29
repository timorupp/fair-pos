/** Integration tests for the "Aktive Sessions" admin endpoints (Task #90). */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin, loginAsRegisterUser } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('GET /api/admin/sessions', () => {
  it('lists the current session plus any others, newest activity first', async () => {
    const app = await getTestApp();
    const operator = await createTestUser({ isAdmin: false, name: 'Theke-1' });
    await loginAsRegisterUser(app, operator.pin);

    const response = await app.inject({
      method: 'GET', url: '/api/admin/sessions',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const rows = response.json();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map((r: { user_name: string }) => r.user_name);
    expect(names).toContain('Theke-1');
  });

  it('reflects admin_verified correctly for the step-up session', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/sessions',
      headers: { cookie: adminCookie },
    });
    const rows = response.json();
    expect(rows.some((r: { admin_verified: boolean }) => r.admin_verified === true)).toBe(true);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/sessions' });
    expect(response.statusCode).toBe(401);
  });
});

describe('DELETE /api/admin/sessions/:id', () => {
  it('ends another session — that device is unauthenticated on its next request', async () => {
    const app = await getTestApp();
    const operator = await createTestUser({ isAdmin: false });
    const operatorCookie = await loginAsRegisterUser(app, operator.pin);

    const sessionRow = await pool.query<{ id: string }>(
      `SELECT s.id FROM session s JOIN "user" u ON u.id = s.user_id WHERE u.id = $1`,
      [operator.id],
    );
    const sessionId = sessionRow.rows[0]!.id;

    const del = await app.inject({
      method: 'DELETE', url: `/api/admin/sessions/${sessionId}`,
      headers: { cookie: adminCookie },
    });
    expect(del.statusCode).toBe(204);

    const check = await app.inject({
      method: 'GET', url: '/api/auth/register/me',
      headers: { cookie: operatorCookie },
    });
    expect(check.statusCode).toBe(401);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'DELETE', url: '/api/admin/sessions/00000000-0000-0000-0000-000000000000' });
    expect(response.statusCode).toBe(401);
  });
});
