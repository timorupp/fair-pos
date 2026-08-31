/**
 * Server-side session store (Task #90) — replaces the previous two
 * stateless, non-expiring signed cookies (`admin_session` holding the admin
 * user's UUID directly, `register_session` holding the operator's) with a
 * single cookie holding an opaque, random session token, looked up against
 * the `session` table on every request.
 *
 * This is what makes three things possible that a bare signed cookie
 * couldn't: a 4h-inactivity sliding expiry (`last_activity_at`, touched on
 * every authenticated request), an admin-visible list of active sessions,
 * and terminating one specific session on demand (Task #90).
 *
 * Everyone — admin or not — logs in the same way (PIN, see `auth/pin.ts`)
 * and gets the same kind of session row. `admin_verified` is a separate,
 * one-way-settable flag on that same row for the "Systemverwaltung"
 * step-up password (set once per session, not re-asked on every visit) —
 * an admin-flagged user still starts with `admin_verified = false` until
 * they actually enter their password.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../db/client.js';

/** Name of the single session cookie. */
const SESSION_COOKIE = 'session';
/** Sliding inactivity timeout — a session with no activity for this long is treated as expired. */
export const SESSION_INACTIVITY_INTERVAL = '4 hours';

/** Cookie options — `httpOnly` + signed + `sameSite=lax`, matching the previous two cookies. */
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  signed: true,
};

/** A session row as loaded by {@link loadSession}, joined with its user. */
export interface SessionWithUser {
  sessionId: string;
  userId: string;
  adminVerified: boolean;
  name: string;
  isAdmin: boolean;
  /** Veranstaltungs-Administrator (Task #94) — independent of isAdmin. */
  isEventAdmin: boolean;
  isActive: boolean;
}

/**
 * Creates a new session row for the given user and sets the session cookie.
 * Also opportunistically deletes every already-expired session row (Task
 * #97) — `loadSession` only ever treats them as invalid via a timestamp
 * comparison, nothing else ever removes them, so without this they'd
 * accumulate in the table forever. Piggybacking on login (a frequent,
 * already-write-heavy path) avoids needing a separate scheduled job.
 *
 * @param reply - Outgoing Fastify reply onto which the cookie is set.
 * @param userId - UUID of the user who just authenticated via PIN.
 * @param userAgent - `User-Agent` header of the logging-in request, stored for the admin sessions list.
 */
export async function createSession(reply: FastifyReply, userId: string, userAgent: string | undefined): Promise<void> {
  await query(`DELETE FROM session WHERE last_activity_at <= now() - interval '${SESSION_INACTIVITY_INTERVAL}'`);

  const token = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO session (user_id, token, user_agent) VALUES ($1, $2, $3)`,
    [userId, token, userAgent ?? null],
  );
  reply.setCookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

/** Clears the session cookie (does not delete the DB row — call {@link deleteSessionByToken} first). */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Reads and verifies the session cookie.
 *
 * @param request - Incoming Fastify request.
 * @returns The session token, or `null` when the cookie is absent / invalid.
 */
export function getSessionToken(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const result = request.unsignCookie(raw);
  if (!result.valid || !result.value) return null;
  return result.value;
}

/**
 * Loads a session (and its user) by token, provided it hasn't exceeded the
 * inactivity timeout. Does **not** check `is_active` — callers decide
 * whether that should be a 401 (unauthenticated) or something else.
 *
 * @param token - Session token from {@link getSessionToken}.
 * @returns The session+user, or `null` if the token is unknown/expired.
 */
export async function loadSession(token: string): Promise<SessionWithUser | null> {
  const result = await query<{
    session_id: string; user_id: string; admin_verified: boolean;
    name: string; is_admin: boolean; is_event_admin: boolean; is_active: boolean;
  }>(
    `SELECT s.id AS session_id, s.user_id, s.admin_verified,
            u.name, u.is_admin, u.is_event_admin, u.is_active
       FROM session s
       JOIN "user" u ON u.id = s.user_id
      WHERE s.token = $1
        AND s.last_activity_at > now() - interval '${SESSION_INACTIVITY_INTERVAL}'`,
    [token],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id, userId: row.user_id, adminVerified: row.admin_verified,
    name: row.name, isAdmin: row.is_admin, isEventAdmin: row.is_event_admin, isActive: row.is_active,
  };
}

/**
 * Extends a session's inactivity window — called on every authenticated
 * request so an actively-used session never expires mid-shift, only after
 * genuinely sitting idle.
 *
 * @param sessionId - The session's primary key (from {@link loadSession}).
 */
export async function touchSession(sessionId: string): Promise<void> {
  await query(`UPDATE session SET last_activity_at = now() WHERE id = $1`, [sessionId]);
}

/**
 * Marks a session as having passed the admin step-up password check —
 * one-way for the lifetime of the session (never reset back to `false`
 * except by the session expiring/ending).
 *
 * @param sessionId - The session's primary key.
 */
export async function setAdminVerified(sessionId: string): Promise<void> {
  await query(`UPDATE session SET admin_verified = true WHERE id = $1`, [sessionId]);
}

/**
 * Deletes a session by its token — normal logout.
 *
 * @param token - Session token from {@link getSessionToken}.
 */
export async function deleteSessionByToken(token: string): Promise<void> {
  await query(`DELETE FROM session WHERE token = $1`, [token]);
}

/**
 * Deletes a session by its primary key — used by the admin "aktive Sessions"
 * page to forcibly end someone else's session.
 *
 * @param sessionId - The session's primary key.
 */
export async function deleteSessionById(sessionId: string): Promise<void> {
  await query(`DELETE FROM session WHERE id = $1`, [sessionId]);
}
