/**
 * Session cookie helpers.
 *
 * Two completely separate sessions are supported per the Anforderungen:
 *  - **admin_session** — set by username/password login, drives the admin UI.
 *  - **register_session** — set by QR-token login, drives the cash-register UI.
 *
 * Both can be active at the same time (e.g. in different browser tabs) and they
 * never overlap: setting one does not touch the other, and clearing one leaves
 * the other intact. Each cookie is signed by `@fastify/cookie` using `SESSION_SECRET`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Name of the cookie storing the admin user's session. */
const ADMIN_COOKIE = 'admin_session';
/** Name of the cookie storing the cash-register operator's session. */
const REGISTER_COOKIE = 'register_session';

/** Cookie options shared by both sessions. `httpOnly` + signed + `sameSite=lax`. */
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  signed: true,
};

/**
 * Writes the signed admin-session cookie containing the admin user's UUID.
 *
 * @param reply - Outgoing Fastify reply onto which the cookie is set.
 * @param userId - UUID of the authenticated admin user.
 */
export function setAdminSession(reply: FastifyReply, userId: string): void {
  reply.setCookie(ADMIN_COOKIE, userId, COOKIE_OPTIONS);
}

/**
 * Clears only the admin-session cookie. The register session, if any, is left intact.
 *
 * @param reply - Outgoing Fastify reply.
 */
export function clearAdminSession(reply: FastifyReply): void {
  reply.clearCookie(ADMIN_COOKIE, { path: '/' });
}

/**
 * Reads and verifies the admin-session cookie.
 *
 * @param request - Incoming Fastify request.
 * @returns The admin user's UUID, or `null` when the cookie is absent / invalid.
 */
export function getAdminUserId(request: FastifyRequest): string | null {
  return readSignedCookie(request, ADMIN_COOKIE);
}

/**
 * Writes the signed register-session cookie containing the operator's user UUID.
 *
 * @param reply - Outgoing Fastify reply onto which the cookie is set.
 * @param userId - UUID of the user the QR token belonged to.
 */
export function setRegisterSession(reply: FastifyReply, userId: string): void {
  reply.setCookie(REGISTER_COOKIE, userId, COOKIE_OPTIONS);
}

/**
 * Clears only the register-session cookie. The admin session, if any, is left intact.
 *
 * @param reply - Outgoing Fastify reply.
 */
export function clearRegisterSession(reply: FastifyReply): void {
  reply.clearCookie(REGISTER_COOKIE, { path: '/' });
}

/**
 * Reads and verifies the register-session cookie.
 *
 * @param request - Incoming Fastify request.
 * @returns The operator's UUID, or `null` when the cookie is absent / invalid.
 */
export function getRegisterUserId(request: FastifyRequest): string | null {
  return readSignedCookie(request, REGISTER_COOKIE);
}

/**
 * Reads a signed cookie by name and returns its verified value or `null`.
 * Shared internal helper for the two session readers above.
 *
 * @param request - The incoming request carrying the cookie jar.
 * @param name - Cookie name to look up.
 * @returns The verified cookie value, or `null` when missing / tampered.
 */
function readSignedCookie(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name];
  if (!raw) return null;
  const result = request.unsignCookie(raw);
  if (!result.valid || !result.value) return null;
  return result.value;
}
