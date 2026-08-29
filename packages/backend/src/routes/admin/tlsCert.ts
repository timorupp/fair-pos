/** Admin routes for the nginx reverse-proxy's TLS certificate (Task #66). */

import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { installCert, readInstalledCertInfo, validateCertKeyPair } from '../../system/tlsCert.js';

/** PEM text fields are tiny — this is generous headroom, not a real-world size. */
const MAX_PEM_LENGTH = 64 * 1024;

/** Registers `/api/admin/tls-cert` routes. */
export async function tlsCertAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/tls-cert — currently installed certificate's subject/validity, or `null` if none. */
  app.get('/', async (_req, reply) => {
    const installed = await readInstalledCertInfo();
    return reply.send({ installed });
  });

  /**
   * POST /api/admin/tls-cert — validates and installs a new certificate/key
   * pair. Validation (format, key/certificate match, not expired) happens
   * entirely before any file is written or `sudo` is invoked — see
   * `system/tlsCert.ts`.
   */
  app.post('/', async (req, reply) => {
    const body = req.body as { cert?: string; key?: string };
    if (!body.cert || !body.key) {
      return reply.status(400).send({ error: 'Zertifikat und privater Schlüssel erforderlich' });
    }
    if (body.cert.length > MAX_PEM_LENGTH || body.key.length > MAX_PEM_LENGTH) {
      return reply.status(413).send({ error: 'Datei zu groß' });
    }

    let info;
    try {
      info = validateCertKeyPair(body.cert, body.key);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : 'Ungültiges Zertifikat' });
    }

    try {
      await installCert(body.cert, body.key);
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Installation fehlgeschlagen' });
    }

    return reply.send({ installed: info });
  });
}
