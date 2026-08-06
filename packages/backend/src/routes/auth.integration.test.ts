/**
 * Integration tests for the authentication routes — covers admin login,
 * register-session token exchange, logout and `me` endpoints. Verifies the
 * separation of the two session cookies.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { closeTestApp, getTestApp } from '../test/app-helpers.js';
import { createTestUser } from '../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);
beforeEach(truncateAllTables);

describe('POST /api/auth/admin/login', () => {
  it('accepts correct credentials of an admin and sets admin_session cookie', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: true, password: 'secret123' });
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/login',
      payload: { name: user.name, password: 'secret123' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(user.id);
    expect(body.is_admin).toBe(true);

    const setCookie = response.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(cookieStr).toContain('admin_session=');
    expect(cookieStr).not.toContain('register_session=');
  });

  it('rejects a non-admin user with the same generic 401 as a wrong password', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false, password: 'secret123' });
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/login',
      payload: { name: user.name, password: 'secret123' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('Ungültige Anmeldedaten');
  });

  it('rejects wrong password with 401', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: true, password: 'right' });
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/login',
      payload: { name: user.name, password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects unknown username with the same generic 401 (no user enumeration)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/login',
      payload: { name: 'does-not-exist', password: 'x' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('Ungültige Anmeldedaten');
  });

  it('rejects missing fields with 400', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/login', payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a deactivated admin with the same generic 401 (Task #56)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: true, password: 'secret123', isActive: false });
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/login',
      payload: { name: user.name, password: 'secret123' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('Ungültige Anmeldedaten');
  });
});

describe('POST /api/auth/register/token', () => {
  it('exchanges a valid token for a register_session cookie and deletes the token', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    await pool.query(
      `INSERT INTO register_access_token (user_id, token, valid_until)
       VALUES ($1, 'valid-token', now() + interval '10 minutes')`,
      [user.id],
    );

    const response = await app.inject({
      method: 'POST', url: '/api/auth/register/token',
      payload: { token: 'valid-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(user.id);

    const setCookie = response.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(cookieStr).toContain('register_session=');

    // Token must be deleted (one-shot)
    const remaining = await pool.query(`SELECT 1 FROM register_access_token WHERE token = 'valid-token'`);
    expect(remaining.rowCount).toBe(0);
  });

  it('rejects a valid token belonging to a deactivated user with 401 (Task #56)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false, isActive: false });
    await pool.query(
      `INSERT INTO register_access_token (user_id, token, valid_until)
       VALUES ($1, 'deactivated-user-token', now() + interval '10 minutes')`,
      [user.id],
    );
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register/token',
      payload: { token: 'deactivated-user-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an unknown token with 401', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register/token',
      payload: { token: 'no-such-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an expired token with 401', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    await pool.query(
      `INSERT INTO register_access_token (user_id, token, valid_until)
       VALUES ($1, 'expired', now() - interval '1 minute')`,
      [user.id],
    );
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register/token',
      payload: { token: 'expired' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a reused token with 401 (token is consumed on first use)', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    await pool.query(
      `INSERT INTO register_access_token (user_id, token, valid_until)
       VALUES ($1, 'one-shot', now() + interval '10 minutes')`,
      [user.id],
    );
    const first = await app.inject({
      method: 'POST', url: '/api/auth/register/token', payload: { token: 'one-shot' },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST', url: '/api/auth/register/token', payload: { token: 'one-shot' },
    });
    expect(second.statusCode).toBe(401);
  });
});

describe('Session separation', () => {
  it('admin_session does not give access to /api/auth/register/me', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: true, password: 'pw' });
    const login = await app.inject({
      method: 'POST', url: '/api/auth/admin/login',
      payload: { name: user.name, password: 'pw' },
    });
    const cookies = (login.headers['set-cookie'] as string[] | string).toString();
    const cookieHeader = (Array.isArray(login.headers['set-cookie'])
      ? (login.headers['set-cookie'] as string[]).map((c) => c.split(';')[0]).join('; ')
      : cookies.split(';')[0]) ?? '';

    const response = await app.inject({
      method: 'GET', url: '/api/auth/register/me',
      headers: { cookie: cookieHeader },
    });
    expect(response.statusCode).toBe(401);
  });

  it('register_session does not give access to /api/auth/admin/me', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    await pool.query(
      `INSERT INTO register_access_token (user_id, token, valid_until)
       VALUES ($1, 'tok', now() + interval '10 minutes')`,
      [user.id],
    );
    const login = await app.inject({
      method: 'POST', url: '/api/auth/register/token', payload: { token: 'tok' },
    });
    const cookieHeader = (Array.isArray(login.headers['set-cookie'])
      ? (login.headers['set-cookie'] as string[]).map((c) => c.split(';')[0]).join('; ')
      : (login.headers['set-cookie'] ?? '').toString().split(';')[0]) ?? '';

    const response = await app.inject({
      method: 'GET', url: '/api/auth/admin/me',
      headers: { cookie: cookieHeader },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/auth/admin/logout', () => {
  it('clears the admin_session cookie', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/admin/logout' });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    // Clear-cookie emits `admin_session=` with an Expires far in the past.
    expect(cookieStr).toMatch(/admin_session=;\s*Path=\//);
    expect(cookieStr).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
