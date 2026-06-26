/**
 * Helpers for integration tests that need to make HTTP requests against the
 * application. Uses Fastify's `inject()` so no real server has to bind a port.
 */

import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

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
 * Performs the admin login flow against the test app and returns the
 * `Cookie` header value to send on subsequent admin-only requests.
 *
 * @param app - The test Fastify instance.
 * @param name - Admin user name.
 * @param password - Admin user plaintext password.
 * @returns The cookie header value (multiple `set-cookie` lines joined with `; `).
 * @throws When the credentials are rejected.
 */
export async function loginAsAdmin(app: FastifyInstance, name: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/admin/login',
    payload: { name, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Admin login failed: ${response.statusCode} ${response.body}`);
  }
  return extractSessionCookie(response.headers['set-cookie']);
}

/**
 * Issues a one-time QR token to the given user and exchanges it for a
 * register-session cookie via the public token-login endpoint.
 *
 * @param app - The test Fastify instance.
 * @param userId - The user the token belongs to.
 * @returns The cookie header value for subsequent register-session requests.
 */
export async function loginAsRegisterUser(app: FastifyInstance, userId: string): Promise<string> {
  const { pool } = await import('../db/client.js');
  const token = `tok-${Math.random().toString(36).slice(2, 16)}`;
  await pool.query(
    `INSERT INTO register_access_token (user_id, token, valid_until)
     VALUES ($1, $2, now() + interval '10 minutes')`,
    [userId, token],
  );
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register/token',
    payload: { token },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Register-token login failed: ${response.statusCode} ${response.body}`);
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
