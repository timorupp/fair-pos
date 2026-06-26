/** Generic admin-only QR-code renderer. Reused by any UI that needs a QR image. */

import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { renderQrPng } from '../../receipt/qr.js';

/**
 * Registers `/api/admin/qr.png` — a thin wrapper around the `qrcode` library
 * that returns a PNG so frontends don't need their own QR-rendering dependency.
 *
 * @param app - The Fastify scope under which to register the route.
 */
export async function qrAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/qr.png?data=<urlencoded>&size=<px> — renders the supplied
   * text as a QR-code PNG. `size` is clamped to a sensible range so the
   * endpoint cannot be abused to allocate huge images.
   */
  app.get<{ Querystring: { data?: string; size?: string } }>('/qr.png', async (req, reply) => {
    const data = req.query.data;
    if (!data) return reply.status(400).send({ error: 'Parameter "data" erforderlich' });
    const size = req.query.size ? Math.max(64, Math.min(800, Number(req.query.size) || 256)) : 256;
    const png = await renderQrPng(data, size);
    reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'no-store')
      .send(png);
  });
}
