/** Admin routes for read-only system information (serial, timezone, server time, TSE status placeholder). */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Shape returned by `GET /api/admin/system/status`. */
interface SystemStatus {
  /** Cash-register-system serial number, e.g. "FairPOS-2026-A3B7K2M9XQ". */
  system_serial: string;
  /** IANA timezone identifier of the server, e.g. "Europe/Berlin". */
  timezone: string;
  /** ISO-8601 timestamp of the current server time at the moment of the request. */
  server_time: string;
  /** TSE status — `null` until task #4 implements the integration. */
  tse: null;
}

/** Registers /api/admin/system routes. */
export async function systemAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/system/status — current system metadata for the System settings page. */
  app.get('/status', async (_req, reply) => {
    const result = await query<{ value: string }>(
      `SELECT value FROM system_setting WHERE key = 'system_serial'`,
    );

    const status: SystemStatus = {
      system_serial: result.rows[0]?.value ?? '(noch nicht initialisiert)',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      server_time: new Date().toISOString(),
      tse: null,
    };
    return reply.send(status);
  });
}
