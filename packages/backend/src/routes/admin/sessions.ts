/** Admin endpoints for the "Aktive Sessions" page (Task #90). */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { deleteSessionById, SESSION_INACTIVITY_INTERVAL } from '../../auth/session.js';

/** One row as shown in the active-sessions list. */
interface SessionListRow {
  id: string;
  user_name: string;
  is_admin: boolean;
  admin_verified: boolean;
  created_at: string;
  last_activity_at: string;
  user_agent: string | null;
}

/** Registers `/api/admin/sessions` routes. */
export async function sessionsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/sessions — every currently active (not yet expired by the
   * 4h inactivity window) session, newest activity first.
   */
  app.get('/', async (_req, reply) => {
    const result = await query<SessionListRow>(
      `SELECT s.id, u.name AS user_name, u.is_admin, s.admin_verified,
              s.created_at, s.last_activity_at, s.user_agent
         FROM session s
         JOIN "user" u ON u.id = s.user_id
        WHERE s.last_activity_at > now() - interval '${SESSION_INACTIVITY_INTERVAL}'
        ORDER BY s.last_activity_at DESC`,
    );
    return reply.send(result.rows);
  });

  /**
   * DELETE /api/admin/sessions/:id — forcibly ends one session (its cookie
   * becomes invalid on that device's next request).
   */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteSessionById(id);
    return reply.status(204).send();
  });
}
