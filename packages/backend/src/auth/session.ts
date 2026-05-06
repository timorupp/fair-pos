/**
 * Session cookie helpers.
 * The session is a signed cookie containing only the authenticated user's UUID.
 * Signing is performed by @fastify/cookie using SESSION_SECRET.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

const COOKIE_NAME = 'session';

/** Cookie options shared between set and clear operations. */
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  signed: true,
};

/** Writes a signed session cookie containing the authenticated user's ID. */
export function setSession(reply: FastifyReply, userId: string): void {
  reply.setCookie(COOKIE_NAME, userId, COOKIE_OPTIONS);
}

/** Clears the session cookie, effectively logging the user out. */
export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Reads and verifies the session cookie. Returns the userId or null if absent or invalid. */
export function getSessionUserId(request: FastifyRequest): string | null {
  const raw = request.cookies[COOKIE_NAME];
  if (!raw) return null;
  const result = request.unsignCookie(raw);
  if (!result.valid || !result.value) return null;
  return result.value;
}
