/**
 * Authentication preHandlers.
 *
 * Two completely separate session types are supported (see `auth/session.ts`).
 * Each preHandler reads its own cookie, looks the user up in the DB, and
 * attaches the result to a dedicated request field:
 *  - `authenticateAdmin`     → reads `admin_session`,    sets `request.adminUser`.
 *  - `authenticateRegister`  → reads `register_session`, sets `request.registerUser`.
 *
 * A route guarded by one preHandler cannot see the other session's user —
 * crossing the boundary requires an explicit second login. This matches the
 * Anforderungen rule that "von der Kassen-UI gibt es keinen Zugang zur
 * Administrationsoberfläche und umgekehrt."
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAdminUserId, getRegisterUserId } from '../auth/session.js';
import { query } from '../db/client.js';
import type { User } from '@fairpos/shared';

/** Minimal user row returned by the session lookup query. */
interface UserRow {
  id: string;
  name: string;
  is_admin: boolean;
  created_at: string;
}

/**
 * Fastify preHandler: validates the **admin** session cookie and attaches the user
 * to `request.adminUser`. Sends 401 if no admin session, 403 if the user is not
 * actually flagged as admin (defence in depth — should never happen).
 *
 * @param request - Incoming Fastify request.
 * @param reply - Outgoing Fastify reply (used to short-circuit with 401/403).
 */
export async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = getAdminUserId(request);
  if (!userId) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }

  const result = await query<UserRow>(
    'SELECT id, name, is_admin, created_at FROM "user" WHERE id = $1',
    [userId],
  );

  const user = result.rows[0];
  if (!user) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }
  if (!user.is_admin) {
    return reply.status(403).send({ error: 'Keine Berechtigung' });
  }

  request.adminUser = user as User;
}

/**
 * Fastify preHandler: validates the **register** session cookie and attaches the user
 * to `request.registerUser`. Sends 401 if no register session is active.
 *
 * The user need NOT be flagged as admin — operators with no admin rights are the
 * common case.
 *
 * @param request - Incoming Fastify request.
 * @param reply - Outgoing Fastify reply (used to short-circuit with 401).
 */
export async function authenticateRegister(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = getRegisterUserId(request);
  if (!userId) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }

  const result = await query<UserRow>(
    'SELECT id, name, is_admin, created_at FROM "user" WHERE id = $1',
    [userId],
  );

  if (result.rows.length === 0) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }

  request.registerUser = result.rows[0] as User;
}
