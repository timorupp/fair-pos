/** Admin route for manually-triggered system health checks (Task #87). */

import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { runHealthChecks } from '../../system/healthChecks.js';

/** Registers `/api/admin/health-checks` routes. */
export async function healthChecksAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/health-checks — runs every registered check and returns its result. Read-only, side-effect-free — safe as a GET despite doing live work (same reasoning as GET /api/admin/tse/status). */
  app.get('/', async (_req, reply) => {
    const checks = await runHealthChecks();
    return reply.send({ checks });
  });
}
