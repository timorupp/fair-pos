/** Admin routes for system information (serial, timezone, server time) and privileged system actions (manual clock, shutdown). */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { setSystemTime, setSystemTimezone } from '../../system/time.js';
import { shutdownServer } from '../../system/shutdown.js';
import { countActiveLockouts, resetAllLockouts } from '../../auth/rateLimit.js';

/** Shape returned by `GET /api/admin/system/status`. */
interface SystemStatus {
  /** Cash-register-system serial number, e.g. "FairPOS-2026-A3B7K2M9XQ". */
  system_serial: string;
  /** IANA timezone identifier of the server, e.g. "Europe/Berlin". */
  timezone: string;
  /** ISO-8601 timestamp of the current server time at the moment of the request. */
  server_time: string;
  /** Number of IPs currently locked out of PIN login (Task #90) — 0 in the common case. */
  ip_lockout_count: number;
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
      ip_lockout_count: countActiveLockouts(),
    };
    return reply.send(status);
  });

  /**
   * POST /api/admin/system/reset-ip-lockouts — clears every IP's PIN-login
   * lockout (Task #90). Exists so a genuinely locked-out device (e.g. a
   * shared kiosk tablet where several people mistyped a PIN) isn't stuck
   * waiting out the full 15 minutes with no admin recourse.
   */
  app.post('/reset-ip-lockouts', async (_req, reply) => {
    resetAllLockouts();
    return reply.status(204).send();
  });

  /**
   * PUT /api/admin/system/time — manually sets the server's system clock
   * (Task #60). Requires a sudoers rule for the `fairpos` service user, see
   * docs/Installationsanleitung.md Abschnitt 13.1 — without it, this fails
   * with a clear error rather than silently doing nothing.
   */
  app.put('/time', async (req, reply) => {
    const body = req.body as { time?: string };
    if (!body.time) {
      return reply.status(400).send({ error: 'Zeitwert erforderlich' });
    }
    try {
      await setSystemTime(body.time);
      return reply.status(204).send();
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
    }
  });

  /**
   * PUT /api/admin/system/timezone — manually sets the server's system
   * timezone (Task #60 follow-up — full time control via the UI needs both
   * clock and timezone). Same sudoers requirement as `PUT /time`, see
   * docs/Installationsanleitung.md Abschnitt 13.1.
   */
  app.put('/timezone', async (req, reply) => {
    const body = req.body as { timezone?: string };
    if (!body.timezone) {
      return reply.status(400).send({ error: 'Zeitzone erforderlich' });
    }
    try {
      await setSystemTimezone(body.timezone);
      return reply.status(204).send();
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
    }
  });

  /**
   * POST /api/admin/system/shutdown — cleanly shuts the server down (Task
   * #61), so a normal Vereins-Helfer:in never needs shell access for this.
   * Requires a sudoers rule for the `fairpos` service user, see
   * docs/Installationsanleitung.md Abschnitt 13.2 — without it, this fails
   * with a clear error rather than silently doing nothing. The confirmation
   * step lives in the admin UI (this endpoint executes immediately once
   * called).
   */
  app.post('/shutdown', async (_req, reply) => {
    try {
      await shutdownServer();
      return reply.status(204).send();
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
    }
  });
}
