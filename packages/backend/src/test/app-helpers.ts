/**
 * Helpers for integration tests that need to make HTTP requests against the
 * application. Uses Fastify's `inject()` so no real server has to bind a port.
 */

import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { resetAllLockouts } from '../auth/rateLimit.js';

/** Cached app instance — building Fastify takes a few hundred ms, so reuse across tests. */
let cachedApp: FastifyInstance | null = null;

/**
 * Returns a single Fastify instance for the entire test file. The app is
 * built lazily on first call and reused for every subsequent test — the same
 * way the production process boots once.
 *
 * Tests should NOT close the app between tests; use `closeTestApp()` in an
 * `afterAll` hook if you need to release resources.
 *
 * @returns The shared test app instance.
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (!cachedApp) cachedApp = await buildApp();
  return cachedApp;
}

/**
 * Closes the cached app (releases the print-worker pg client, etc.). Call once
 * after all tests in a file have run.
 */
export async function closeTestApp(): Promise<void> {
  if (cachedApp) {
    await cachedApp.close();
    cachedApp = null;
  }
}

/**
 * Logs in as an admin user (Task #90: PIN login, then the "Systemverwaltung"
 * password step-up on the same session) and returns the `Cookie` header
 * value to send on subsequent admin-only requests.
 *
 * @param app - The test Fastify instance.
 * @param pin - The user's plaintext PIN (from `createTestUser`).
 * @param password - The user's plaintext password (from `createTestUser`).
 * @returns The cookie header value (multiple `set-cookie` lines joined with `; `).
 * @throws When the PIN or password is rejected.
 */
export async function loginAsAdmin(app: FastifyInstance, pin: string, password: string): Promise<string> {
  // A legitimate test login should never be blocked by lockout state left
  // over from an earlier test in the same file exercising failed attempts.
  resetAllLockouts();
  const pinResponse = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin } });
  if (pinResponse.statusCode !== 200) {
    throw new Error(`PIN login failed: ${pinResponse.statusCode} ${pinResponse.body}`);
  }
  const cookie = extractSessionCookie(pinResponse.headers['set-cookie']);

  const verifyResponse = await app.inject({
    method: 'POST', url: '/api/auth/admin/verify',
    headers: { cookie }, payload: { password },
  });
  if (verifyResponse.statusCode !== 200) {
    throw new Error(`Admin step-up failed: ${verifyResponse.statusCode} ${verifyResponse.body}`);
  }
  return cookie;
}

/**
 * Logs in via PIN (Task #90) and returns the register-session cookie value
 * for subsequent requests. Works for any active user, admin or not — the
 * admin step-up (see {@link loginAsAdmin}) is a separate, additional step
 * only needed to reach admin-only routes.
 *
 * @param app - The test Fastify instance.
 * @param pin - The user's plaintext PIN (from `createTestUser`).
 * @returns The cookie header value for subsequent register-session requests.
 */
export async function loginAsRegisterUser(app: FastifyInstance, pin: string): Promise<string> {
  resetAllLockouts();
  const response = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin } });
  if (response.statusCode !== 200) {
    throw new Error(`PIN login failed: ${response.statusCode} ${response.body}`);
  }
  return extractSessionCookie(response.headers['set-cookie']);
}

/**
 * Extracts the cookies from a `set-cookie` header value into a single
 * `Cookie` header string suitable for the next request.
 *
 * Fastify hands us either a string or an array depending on whether one or
 * many cookies were set; this helper normalises both shapes.
 *
 * @param setCookie - Raw `set-cookie` header value(s).
 * @returns Combined cookie string in `name=value; name=value` form.
 */
function extractSessionCookie(setCookie: string | string[] | undefined): string {
  if (!setCookie) throw new Error('No Set-Cookie header in response');
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  return headers.map((h) => h.split(';')[0]).join('; ');
}
