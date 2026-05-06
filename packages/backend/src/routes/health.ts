import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';

/** GET /api/health — returns 200 if server and database are reachable. */
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    await query('SELECT 1');
    return reply.send({ status: 'ok' });
  });
}
