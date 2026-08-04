/** Admin routes for checking the configured TSE's live connection status. */

import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';
import { getTseInfo } from '../../tse/client.js';
import type { TseInfo } from '../../tse/types.js';

/** Shape returned by `GET /api/admin/tse/status`. */
interface TseStatusResponse {
  /** Whether `tse_mount_point`/`tse_client_id` are currently set (via the Settings UI). */
  configured: boolean;
  /** Present when `configured` is true and the live `info` call succeeded. */
  info?: TseInfo;
  /** Present when `configured` is true but the live `info` call failed (wrong path, PUK/PIN, unreachable hardware, ...). */
  error?: string;
}

/** Registers /api/admin/tse routes. */
export async function tseAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/tse/status — on-demand connection test for the "TSE testen"
   * button in the Settings UI. Actually calls into the hardware (`worm_init` +
   * `info`), so it's deliberately not part of the cheap `/admin/system/status`
   * endpoint that loads on every settings page visit.
   */
  app.get('/status', async (_req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      const response: TseStatusResponse = { configured: false };
      return reply.send(response);
    }
    try {
      const info = await getTseInfo();
      const response: TseStatusResponse = { configured: true, info };
      return reply.send(response);
    } catch (e) {
      const response: TseStatusResponse = {
        configured: true,
        error: e instanceof Error ? e.message : 'Unbekannter TSE-Fehler',
      };
      return reply.send(response);
    }
  });
}
