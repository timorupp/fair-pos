/**
 * Manual database backup. No automatic/scheduled backup — see
 * docs/Anforderungen.md "Backup-Konzept": the server isn't up 24/7, so a
 * time-based trigger would routinely be missed. The admin downloads a fresh
 * backup on demand instead (e.g. right after a Tagesabschluss, or before an
 * update — see docs/Organisatorische-Anleitung.md for the recommended
 * "externen Datenträger mitnehmen" workflow this supports).
 */
import type { FastifyInstance } from 'fastify';
import { authenticateSystemAdmin } from '../../middleware/authenticate.js';
import { createDatabaseDump } from '../../backup/dump.js';
import { buildBackupZip } from '../../backup/zip.js';

/** Registers `/api/admin/backup` routes. */
export async function backupAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateSystemAdmin);

  /**
   * GET /api/admin/backup — runs `pg_dump` and returns the result as a ZIP
   * download. Can take a few seconds on a large database; that's expected
   * for an explicit, infrequent admin action, not a hot-path endpoint.
   */
  app.get('/', async (_req, reply) => {
    let dump: Buffer;
    try {
      dump = await createDatabaseDump();
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Backup fehlgeschlagen' });
    }

    const now = new Date();
    const zip = await buildBackupZip(dump, now);
    const filename = `fairpos_backup_${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(zip);
  });
}
