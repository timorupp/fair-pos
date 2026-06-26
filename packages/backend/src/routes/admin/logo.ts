/** Admin endpoints for managing the company logo (upload / delete / preview). */

import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import {
  deleteCompanyLogo, loadCompanyLogo, storeCompanyLogo,
} from '../../logo/logo.js';

/** Max accepted upload size for the raw logo file (2 MiB). */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Registers `/api/admin/logo/*` routes.
 *
 * Multipart-parsing is provided by `@fastify/multipart`; the parent registration
 * is responsible for installing the plugin once on the Fastify scope.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function logoAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * POST /api/admin/logo — accepts a single `file` field via multipart/form-data
   * and stores the two pre-rendered variants. Rejects empty / oversized uploads.
   */
  app.post('/', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ error: 'Datei fehlt' });
    const buf = await file.toBuffer();
    if (buf.length === 0) return reply.status(400).send({ error: 'Datei ist leer' });
    if (buf.length > MAX_UPLOAD_BYTES) {
      return reply.status(413).send({ error: 'Datei zu groß (max 2 MB)' });
    }
    try {
      await storeCompanyLogo(buf);
    } catch {
      return reply.status(400).send({ error: 'Bild konnte nicht verarbeitet werden (PNG/JPG?)' });
    }
    return reply.status(204).send();
  });

  /** DELETE /api/admin/logo — removes the stored logo (no-op if none set). */
  app.delete('/', async (_req, reply) => {
    await deleteCompanyLogo();
    return reply.status(204).send();
  });

  /**
   * GET /api/admin/logo/preview.png — returns the stored PDF-variant PNG so
   * the settings UI can show a preview. 404 when no logo is configured.
   */
  app.get('/preview.png', async (_req, reply) => {
    const logo = await loadCompanyLogo();
    if (!logo) return reply.status(404).send({ error: 'Kein Logo hinterlegt' });
    return reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'no-store')
      .send(logo.pdfPng);
  });
}
