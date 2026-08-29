/**
 * Authentication preHandlers (Task #90).
 *
 * Both preHandlers now read the **same** single session cookie/table (see
 * `auth/session.ts`) — there is no longer a separate admin vs. register
 * session. The distinction is what each preHandler *requires* of that one
 * session:
 *  - `authenticateRegister` — any valid, active-user session. Everyone who
 *    logged in via PIN can reach the cash-register UI, admins included
 *    (Task #90: an admin cashiers like anyone else, and only needs the
 *    extra "Systemverwaltung" step-up to reach the admin area).
 *  - `authenticateAdmin` — the session's user must additionally be flagged
 *    `is_admin`, AND the session must have passed the step-up password
 *    check (`admin_verified`) at least once since login. A logged-in admin
 *    who hasn't stepped up yet gets a distinguishable 403
 *    (`needs_admin_verification: true`) so the frontend can show the
 *    password prompt instead of treating it as a hard permission denial.
 *
 * Both re-load the user on every request (not just once at login), so
 * deactivating a user (Task #56, `is_active`) takes effect immediately on
 * their very next request.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSessionToken, loadSession, touchSession } from '../auth/session.js';
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
    id: session.userId, name: session.name, is_admin: session.isAdmin,
  } as User;
}

/**
 * Fastify preHandler: requires a valid session for an active, `is_admin`
 * user that has also completed the "Systemverwaltung" step-up password
 * check this session. Attaches the user to `request.adminUser`.
 *
 * @param request - Incoming Fastify request.
 * @param reply - Outgoing Fastify reply (used to short-circuit with 401/403).
 */
export async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = getSessionToken(request);
  if (!token) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }

  const session = await loadSession(token);
  if (!session || !session.isActive) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }
  if (!session.isAdmin) {
    return reply.status(403).send({ error: 'Keine Berechtigung' });
  }
  if (!session.adminVerified) {
    return reply.status(403).send({ error: 'Admin-Verifizierung erforderlich', needs_admin_verification: true });
  }

  await touchSession(session.sessionId);
  request.sessionId = session.sessionId;
  request.adminUser = {
    id: session.userId, name: session.name, is_admin: session.isAdmin,
  } as User;
}
