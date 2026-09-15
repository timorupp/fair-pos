/**
 * Integration tests for the authentication routes (Task #90) — PIN login
 * (identifies and authenticates in one step, no separate username), the
 * admin "Systemverwaltung" password step-up, logout, and the two `me`
 * endpoints.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, getTestApp } from '../test/app-helpers.js';
import { createTestUser } from '../test/fixtures.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { resetAllLockouts } from '../auth/rateLimit.js';
import { config } from '../config.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);
beforeEach(async () => {
  await truncateAllTables();
  resetAllLockouts();
});

/** Extracts a `Cookie` header value from an inject() response's `set-cookie`. */
function cookieFrom(setCookie: string | string[] | undefined): string {
  if (!setCookie) return '';
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  return headers.map((h) => h.split(';')[0]).join('; ');
}

describe('POST /api/auth/pin', () => {
  it('accepts a correct PIN and sets the session cookie', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(user.id);
    expect(body.is_admin).toBe(false);
    expect(cookieFrom(response.headers['set-cookie'])).toContain('session=');
  });

  it('sets the session cookie\'s Secure flag to match config.isDev (D-077 — previously always unset)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    const setCookie = response.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
    expect(/;\s*Secure/i.test(raw)).toBe(!config.isDev);
  });

  it('accepts the PIN with or without hyphens, case-insensitively', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false, pin: 'ABCDEFGHJ' });
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'abc-def-ghj' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(user.id);
  });

  it('rejects an unknown PIN with a generic 401', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'ZZZZZZZZZ' } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('PIN ungültig');
  });

  it('rejects a malformed PIN (wrong length) with 401', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'ABC' } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a deactivated user\'s PIN with the same generic 401 (Task #56)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isActive: false });
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    expect(response.statusCode).toBe(401);
  });

  it('locks out the source IP after 3 failed attempts, even for a correct PIN afterwards', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    for (let i = 0; i < 3; i++) {
      const fail = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'ZZZZZZZZZ' } });
      expect(fail.statusCode).toBe(401);
    }
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    expect(response.statusCode).toBe(429);
  });

  it('resetAllLockouts clears an active lockout', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'ZZZZZZZZZ' } });
    }
    resetAllLockouts();
    const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    expect(response.statusCode).toBe(200);
  });

  it('locks out X-Forwarded-For claims independently when the connection is from the trusted proxy (D-077 — previously one shared, global lockout bucket for every visitor)', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    // trustProxy is scoped to '127.0.0.1' (app.ts) — light-my-request's
    // default MockSocket remoteAddress is already '127.0.0.1', simulating
    // exactly nginx's own loopback connection per docs/Installationsanleitung.md.
    for (let i = 0; i < 3; i++) {
      const fail = await app.inject({
        method: 'POST', url: '/api/auth/pin', payload: { pin: 'ZZZZZZZZZ' },
        headers: { 'x-forwarded-for': '203.0.113.1' },
      });
      expect(fail.statusCode).toBe(401);
    }
    const lockedOut = await app.inject({
      method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin },
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    expect(lockedOut.statusCode).toBe(429);

    // A different claimed client IP must be completely unaffected.
    const otherClient = await app.inject({
      method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin },
      headers: { 'x-forwarded-for': '203.0.113.2' },
    });
    expect(otherClient.statusCode).toBe(200);
  });

  it('ignores a spoofed X-Forwarded-For from a peer other than the trusted proxy (D-077)', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    // remoteAddress simulates a connection that did NOT come through nginx
    // (e.g. the backend port reached directly) — trustProxy is scoped to
    // '127.0.0.1' only, so this X-Forwarded-For must be ignored and the raw
    // peer address used instead, exactly like an unspoofed client.
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST', url: '/api/auth/pin', payload: { pin: 'ZZZZZZZZZ' },
        remoteAddress: '198.51.100.9',
        headers: { 'x-forwarded-for': '203.0.113.50' },
      });
    }
    // Same real peer, a freshly "spoofed" claimed IP — must still be locked
    // out, proving the header alone can't evade the limiter.
    const stillLockedOut = await app.inject({
      method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin },
      remoteAddress: '198.51.100.9',
      headers: { 'x-forwarded-for': '203.0.113.99' },
    });
    expect(stillLockedOut.statusCode).toBe(429);
  });
});

describe('POST /api/auth/admin/verify', () => {
  it('rejects without an existing session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/admin/verify', payload: { password: 'x' } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a non-admin session with 403', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    const cookie = cookieFrom(login.headers['set-cookie']);
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/verify',
      headers: { cookie }, payload: { password: 'anything' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a wrong password for an admin session with 401', async () => {
    const app = await getTestApp();
    const admin = await createTestUser({ isAdmin: true, password: 'right' });
    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: admin.pin } });
    const cookie = cookieFrom(login.headers['set-cookie']);
    const response = await app.inject({
      method: 'POST', url: '/api/auth/admin/verify',
      headers: { cookie }, payload: { password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts the correct password and unlocks /api/auth/admin/me for the rest of the session', async () => {
    const app = await getTestApp();
    const admin = await createTestUser({ isAdmin: true, password: 'right' });
    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: admin.pin } });
    const cookie = cookieFrom(login.headers['set-cookie']);

    const before = await app.inject({ method: 'GET', url: '/api/auth/admin/me', headers: { cookie } });
    expect(before.statusCode).toBe(403);
    expect(before.json().needs_admin_verification).toBe(true);

    const verify = await app.inject({
      method: 'POST', url: '/api/auth/admin/verify',
      headers: { cookie }, payload: { password: 'right' },
    });
    expect(verify.statusCode).toBe(200);

    // Two separate later requests, same session — the step-up is not re-asked.
    const after1 = await app.inject({ method: 'GET', url: '/api/auth/admin/me', headers: { cookie } });
    expect(after1.statusCode).toBe(200);
    const after2 = await app.inject({ method: 'GET', url: '/api/auth/admin/me', headers: { cookie } });
    expect(after2.statusCode).toBe(200);
  });
});

describe('GET /api/auth/register/me', () => {
  it('works for any valid session, admin or not', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    const cookie = cookieFrom(login.headers['set-cookie']);
    const response = await app.inject({ method: 'GET', url: '/api/auth/register/me', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(user.id);
  });

  it('rejects without a session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/auth/register/me' });
    expect(response.statusCode).toBe(401);
  });

  it('includes the app version (Task #148)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    const cookie = cookieFrom(login.headers['set-cookie']);
    const response = await app.inject({ method: 'GET', url: '/api/auth/register/me', headers: { cookie } });
    expect(typeof response.json().version).toBe('string');
    expect(response.json().version.length).toBeGreaterThan(0);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session — a subsequent request with the same cookie is unauthenticated', async () => {
    const app = await getTestApp();
    const user = await createTestUser();
    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: user.pin } });
    const cookie = cookieFrom(login.headers['set-cookie']);

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);

    const response = await app.inject({ method: 'GET', url: '/api/auth/register/me', headers: { cookie } });
    expect(response.statusCode).toBe(401);
  });

  it('clears the session cookie even without an active session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(response.statusCode).toBe(200);
    // Full header, not `cookieFrom()` — that helper deliberately strips
    // attributes (Path/Expires) when building a `Cookie:` header for a
    // *next* request, which would strip away exactly what's asserted here.
    const setCookie = response.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join('\n') : (setCookie ?? '');
    expect(raw).toMatch(/session=;\s*Path=\//);
    expect(raw).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
