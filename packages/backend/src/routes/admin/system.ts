/** Admin routes for system information (serial, timezone, server time) and privileged system actions (manual clock, shutdown). */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { setSystemTime, setSystemTimezone } from '../../system/time.js';
import { shutdownServer } from '../../system/shutdown.js';
import { countActiveLockouts, resetAllLockouts } from '../../auth/rateLimit.js';
import { getActiveEvent, setActiveEvent, setActiveEventDefaultLayouts } from '../../system/activeEvent.js';

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

  /**
   * GET /api/admin/system/active-event — the currently active event (Task
   * #95). Readable by either admin level — a Veranstaltungs-Administrator
   * needs to see which event is active, just not change it.
   */
  app.get('/active-event', async (_req, reply) => {
    const event = await getActiveEvent();
    return reply.send({ event });
  });

  /**
   * PUT /api/admin/system/active-event — switches the active event (Task
   * #95). System-Administrator only — checked inline rather than via a
   * separate route-scoped middleware, since every other route in this file
   * intentionally allows both admin levels.
   */
  app.put('/active-event', async (req, reply) => {
    if (!req.adminUser.is_admin) {
      return reply.status(403).send({ error: 'Nur ein System-Administrator darf die aktive Veranstaltung wechseln' });
    }
    const body = req.body as { event_id?: string };
    if (!body.event_id) {
      return reply.status(400).send({ error: 'event_id erforderlich' });
    }
    try {
      await setActiveEvent(body.event_id);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
    }
    const event = await getActiveEvent();
    return reply.send({ event });
  });

  /**
   * PUT /api/admin/system/active-event/default-layouts — sets the active
   * event's default register layouts (Task #95). Deliberately reachable by
   * both admin levels (unlike the rest of this file's active-event routes)
   * — a Veranstaltungs-Administrator manages layouts (`layouts.ts`) and
   * needs to be able to pick the active event's default, without needing
   * access to general event editing.
   */
  app.put('/active-event/default-layouts', async (req, reply) => {
    const body = req.body as { receipt_layout_id?: string | null; service_layout_id?: string | null };
    try {
      await setActiveEventDefaultLayouts(body.receipt_layout_id ?? null, body.service_layout_id ?? null);
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
    }
    const event = await getActiveEvent();
    return reply.send({ event });
  });
}
