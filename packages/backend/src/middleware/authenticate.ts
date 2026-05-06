import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSessionUserId } from '../auth/session.js';
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
 * Fastify preHandler: validates the session cookie and attaches the user to the request.
 * Sends 401 if the session is missing or the user no longer exists.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = getSessionUserId(request);
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

  request.user = result.rows[0] as User;
}

/**
 * Fastify preHandler: like authenticate, but additionally requires the user to be an admin.
 * Sends 403 if the authenticated user lacks admin privileges.
 */
export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (!request.user.is_admin) {
    return reply.status(403).send({ error: 'Keine Berechtigung' });
  }
}
