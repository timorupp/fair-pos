/** Admin routes for checking the configured TSE's live connection status. */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';
import { query } from '../../db/client.js';
import { exportTar, getTseInfo, maintainTse } from '../../tse/client.js';
import { detectTse, listTseMountCandidates, type TseMountCandidate } from '../../tse/detect.js';
import type { TseInfo } from '../../tse/types.js';
import { describeTseError } from '../../tse/signing.js';
import { logSystemEvent } from '../../system/log.js';

/** Shape returned by `GET /api/admin/tse/status`. */
interface TseStatusResponse {
  /** Whether `tse_mount_point`/`tse_client_id` are currently set (via the Settings UI). */
  configured: boolean;
  /** Present when `configured` is true and the live `info` call succeeded. */
  info?: TseInfo;
  /** Present when `configured` is true but the live `info` call failed (wrong path, PUK/PIN, unreachable hardware, ...). */
  error?: string;
}

/** Shape returned by `GET /api/admin/tse/candidates`. */
interface TseCandidatesResponse {
  candidates: TseMountCandidate[];
}

/** Shape returned by `POST /api/admin/tse/detect`. */
interface TseDetectResponse {
  /** The mount point to fill into the Settings form, or `null` if no candidate turned out to be a real TSE. */
  mountPoint: string | null;
  /** How many removable mount points were probed in total (found + rejected) — shown in the UI even on failure, so "nothing plugged in" reads differently from "something's plugged in but it isn't a TSE". */
  candidatesTried: number;
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

  /**
   * GET /api/admin/tse/candidates — currently-mounted removable filesystems,
   * for the Mount-Pfad dropdown. Purely informational (doesn't check whether
   * any of them is actually a TSE) — see `POST /detect` for that.
   */
  app.get('/candidates', async (_req, reply) => {
    try {
      const candidates = await listTseMountCandidates();
      const response: TseCandidatesResponse = { candidates };
      return reply.send(response);
    } catch (e) {
      return reply.status(500).send({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' });
    }
  });

  /**
   * POST /api/admin/tse/detect — the "Auto-erkennen" button. Probes every
   * currently-mounted removable filesystem via `worm_init`/`info` and
   * returns the first one that's a real TSE. Never blocks on a wrong
   * candidate — `native/tse-cli`'s `info` command itself validates whether a
   * TSE is actually present, so this doesn't need to guess.
   */
  app.post('/detect', async (_req, reply) => {
    const result = await detectTse();
    const response: TseDetectResponse = {
      mountPoint: result.found?.mountPoint ?? null,
      candidatesTried: (result.found ? 1 : 0) + result.triedAndRejected.length,
    };
    return reply.send(response);
  });

  /**
   * POST /api/admin/tse/maintain — manually runs `maintainTse()` (self-test
   * then time sync, see tse/client.ts) for the "Zeit synchronisieren" button
   * in the Settings UI. The periodic health job (tse/healthJob.ts, Task #64)
   * runs the same operation automatically once a problem is detected, but a
   * freshly set-up TSE still needs one successful run before its clock is
   * set — without it, the first real signing attempt fails with a confusing
   * `WORM_ERROR_NO_TIME_SET` (code 4098).
   */
  app.post('/maintain', async (_req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      return reply.status(400).send({ error: 'TSE ist nicht konfiguriert.' });
    }
    const pinResult = await query<{ value: string }>(
      `SELECT value FROM system_setting WHERE key = 'tse_time_admin_pin'`,
    );
    const timeAdminPin = pinResult.rows[0]?.value;
    if (!timeAdminPin) {
      return reply.status(400).send({ error: 'TimeAdmin-PIN ist nicht gesetzt.' });
    }
    try {
      await maintainTse(timeAdminPin);
      await logSystemEvent('info', 'tse_health', 'Manueller Self-Test + Zeitsync erfolgreich (Admin-UI).');
      return reply.send({ ok: true });
    } catch (e) {
      return reply.status(502).send({ error: describeTseError(e) });
    }
  });

  /**
   * GET /api/admin/tse/export — downloads the TSE's complete stored log as a
   * raw TR-03153 TAR archive (Task #103). Always a *full* export — the
   * TSE's own filtered-export functions no longer work on firmware >= 2.0.0
   * (see `docs/TSE-Integration.md` section 11), so there is no date-range
   * parameter to accept here; a caller who needs a subset must filter the
   * downloaded TAR themselves. FairPOS does not interpret the archive's
   * contents in any way — this only makes the CLI's already-existing
   * `exportTar` command reachable from the Admin UI instead of requiring
   * direct server/SSH access. No deletion of TSE-stored data happens here
   * (`worm_export_deleteStoredData` is a separate, destructive SDK call —
   * deliberately not wired up, see Task #103).
   */
  app.get('/export', async (req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      return reply.status(400).send({ error: 'TSE ist nicht konfiguriert.' });
    }
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fairpos-tse-export-'));
    const outputFile = path.join(tmpDir, `${randomUUID()}.tar`);
    try {
      await exportTar(outputFile);
      const tar = await readFile(outputFile);
      const filename = `fairpos_tse_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.tar`;
      await logSystemEvent(
        'info', 'tse_export',
        `TSE-Rohdatenexport heruntergeladen (${req.adminUser.name}).`,
      );
      reply
        .header('Content-Type', 'application/x-tar')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(tar);
    } catch (e) {
      return reply.status(502).send({ error: describeTseError(e) });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
}
