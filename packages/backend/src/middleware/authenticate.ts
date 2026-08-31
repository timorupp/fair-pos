/**
 * Authentication preHandlers (Task #90, extended by Task #94).
 *
 * Both preHandlers read the **same** single session cookie/table (see
 * `auth/session.ts`) — there is no longer a separate admin vs. register
 * session. The distinction is what each preHandler *requires* of that one
 * session:
 *  - `authenticateRegister` — any valid, active-user session. Everyone who
 *    logged in via PIN can reach the cash-register UI, admins included
 *    (Task #90: an admin cashiers like anyone else, and only needs the
 *    extra "Systemverwaltung" step-up to reach the admin area).
 *  - `authenticateAdmin` — the session's user must additionally be flagged
 *    `is_admin` **or** `is_event_admin` (Task #94 — System-Administrator or
 *    Veranstaltungs-Administrator, either one is enough), AND the session
 *    must have passed the step-up password check (`admin_verified`) at
 *    least once since login. This is the default gate used by every admin
 *    route file that a Veranstaltungs-Administrator may also reach (the
 *    large majority — see `docs/Adminstufen-Matrix.txt`).
 *  - `authenticateSystemAdmin` — like `authenticateAdmin`, but requires
 *    `is_admin` strictly (System-Administrator only). Used only by the
 *    handful of route files reserved for the System-Administrator
 *    (`events.ts`, `backup.ts` — see the matrix). `logs.ts` was originally
 *    on this list too but was opened up to both levels (2026-08-31) once
 *    the Dashboard's TSE-Zustand tile — visible to both — turned out to
 *    depend on it, and system_log currently only ever carries the
 *    `tse_health` category in practice.
 *
 * A logged-in admin (either level) who hasn't stepped up yet gets a
 * distinguishable 403 (`needs_admin_verification: true`) so the frontend
 * can show the password prompt instead of treating it as a hard permission
 * denial.
 *
 * Both re-load the user on every request (not just once at login), so
 * deactivating a user (Task #56, `is_active`) takes effect immediately on
 * their very next request.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSessionToken, loadSession, touchSession, type SessionWithUser } from '../auth/session.js';
import type { User } from '@fairpos/shared';

/**
 * Fastify preHandler: requires any valid, non-expired session belonging to
 * an active user. Attaches the user to `request.registerUser` and extends
 * the session's inactivity window.
 *
 * @param request - Incoming Fastify request.
 * @param reply - Outgoing Fastify reply (used to short-circuit with 401).
 */
export async function authenticateRegister(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = getSessionToken(request);
  if (!token) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }

  const session = await loadSession(token);
  if (!session || !session.isActive) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }

  await touchSession(session.sessionId);
  request.sessionId = session.sessionId;
  request.registerUser = {
    id: session.userId, name: session.name, is_admin: session.isAdmin, is_event_admin: session.isEventAdmin,
  } as unknown as User;
}

/** Loads the active session for a request, or sends a 401 and returns null. Does not check admin level or step-up — callers decide that order. */
async function loadActiveSession(request: FastifyRequest, reply: FastifyReply): Promise<SessionWithUser | null> {
  const token = getSessionToken(request);
  if (!token) {
    reply.status(401).send({ error: 'Nicht angemeldet' });
    return null;
  }

  const session = await loadSession(token);
  if (!session || !session.isActive) {
    reply.status(401).send({ error: 'Nicht angemeldet' });
    return null;
  }
  return session;
}

/**
 * Checks the step-up password flag and, if set, attaches `request.adminUser`
 * and extends the session. Must only be called after the caller has already
 * confirmed the session holds the required admin level — checking
 * `adminVerified` first would otherwise prompt a plain, non-admin user for
 * the step-up password instead of a plain "keine Berechtigung".
 */
async function finishAdminAuth(request: FastifyRequest, reply: FastifyReply, session: SessionWithUser): Promise<void> {
  if (!session.adminVerified) {
    reply.status(403).send({ error: 'Admin-Verifizierung erforderlich', needs_admin_verification: true });
    return;
  }

  await touchSession(session.sessionId);
  request.sessionId = session.sessionId;
  request.adminUser = {
    id: session.userId, name: session.name, is_admin: session.isAdmin, is_event_admin: session.isEventAdmin,
  } as unknown as User;
}

/**
 * Fastify preHandler: requires a valid session for an active user flagged
 * `is_admin` **or** `is_event_admin` (Task #94) that has also completed the
 * "Systemverwaltung" step-up password check this session. Attaches the user
 * to `request.adminUser`. This is the default admin gate — use
 * {@link authenticateSystemAdmin} instead for the handful of routes
 * reserved strictly for the System-Administrator.
 *
 * @param request - Incoming Fastify request.
 * @param reply - Outgoing Fastify reply (used to short-circuit with 401/403).
 */
export async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await loadActiveSession(request, reply);
  if (!session) return;
  if (!session.isAdmin && !session.isEventAdmin) {
    return reply.status(403).send({ error: 'Keine Berechtigung' });
  }
  await finishAdminAuth(request, reply, session);
}

/**
 * Fastify preHandler: like {@link authenticateAdmin}, but requires
 * `is_admin` strictly — the System-Administrator only, `is_event_admin`
 * alone is not enough. Use for routes that must stay unreachable for a
 * Veranstaltungs-Administrator (SSL/DNS config, backup, system log, event
 * management — see `docs/Adminstufen-Matrix.txt`).
 *
 * @param request - Incoming Fastify request.
 * @param reply - Outgoing Fastify reply (used to short-circuit with 401/403).
 */
export async function authenticateSystemAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await loadActiveSession(request, reply);
  if (!session) return;
  if (!session.isAdmin) {
    return reply.status(403).send({ error: 'Keine Berechtigung' });
  }
  await finishAdminAuth(request, reply, session);
}
