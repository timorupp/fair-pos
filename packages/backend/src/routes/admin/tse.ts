/** Admin routes for checking the configured TSE's live connection status. */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';
import { query } from '../../db/client.js';
import {
  dumpProcessDataTse, exportTar, factoryResetTse, finishTransaction, getTseInfo, maintainTse, setupTse,
  startTransaction, unblockPin,
} from '../../tse/client.js';
import { certificateExpiresTodayOrEarlier } from '../../tse/healthJob.js';
import { detectTse, listTseMountCandidates, type TseMountCandidate } from '../../tse/detect.js';
import { TseError, type TseInfo } from '../../tse/types.js';
import { KASSENBELEG_PROCESS_TYPE, buildAvBelegabbruchProcessData } from '../../tse/processData.js';
import { describeTseError } from '../../tse/signing.js';
import { isValidClientId, isValidPin, isValidPuk } from '../../tse/validation.js';
import { applyTseSettings } from '../../tse/settings.js';
import { logSystemEvent } from '../../system/log.js';

/** Body of `POST /api/admin/tse/setup`. */
interface TseSetupBody {
  clientId: string;
  credentialSeed: string;
  adminPuk: string;
  adminPin: string;
  timeAdminPin: string;
}

/** Body of `POST /api/admin/tse/unblock`. */
interface TseUnblockBody {
  user: 'admin' | 'timeAdmin';
  puk: string;
  newPin: string;
}

/** Shape returned by `GET /api/admin/tse/status`. */
interface TseStatusResponse {
  /** Whether `tse_mount_point`/`tse_client_id` are currently set (via the Settings UI). */
  configured: boolean;
  /** Present when `configured` is true and the live `info` call succeeded. */
  info?: TseInfo;
  /**
   * Present alongside `info` (Task #132 follow-up, 2026-09-12) — whether
   * `info.certificateExpirationDate` is today or earlier, evaluated against
   * **server time**, not the browser's. Computed here rather than in the
   * frontend: a dev-TSE server can deliberately run with its system clock
   * set back (dev TSEs are only valid ~3 months, backdating the clock is
   * normal practice) — an admin's own browser would then show the "correct"
   * real-world date and disagree with the server's own health-check
   * (`tse/healthJob.ts`, which necessarily uses server time), which is
   * confusing and wrong: FairPOS must treat server time as the single
   * authoritative "now" everywhere, never the viewing browser's clock.
   */
  certificateExpiresTodayOrEarlier?: boolean;
  /** Present when `configured` is true but the live `info` call failed (wrong path, PUK/PIN, unreachable hardware, ...). */
  error?: string;
}

/**
 * Shape returned by `POST /api/admin/tse/test-signature` on success
 * (Task #133) — the full detail of the real, newly-signed transaction, so an
 * admin can visually confirm the TSE genuinely signed something new (a
 * changed `signatureCounter`/`transactionNumber` versus the last known
 * value), not just that the `info` command returned green fields.
 */
interface TseTestSignatureResponse {
  transactionNumber: number;
  signatureCounter: number;
  /** Hex-encoded, as returned by the TSE — not decoded/verified here, this is a raw diagnostic dump for the admin. */
  signature: string;
  serialNumber: string;
  startTime: string;
  endTime: string;
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

/**
 * Registers /api/admin/tse routes.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
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
      const response: TseStatusResponse = {
        configured: true, info,
        certificateExpiresTodayOrEarlier: certificateExpiresTodayOrEarlier(info.certificateExpirationDate),
      };
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
   * POST /api/admin/tse/test-signature — Task #133: runs one real, complete
   * `start`/`finish` cycle against the TSE, for the "Signatur testen" button
   * in the Settings UI. Unlike `GET /status` (which only reads the passive
   * `info` snapshot — `hasPassedSelfTest`/`hasValidTime` can both stay green
   * while a real signature still fails, see Task #132's expired-certificate
   * finding), this is the only way to directly confirm the TSE can actually
   * still produce a signature right now, regardless of the underlying cause
   * of a failure.
   *
   * Deliberately reuses the exact `AVBelegabbruch` processData Anhang I's
   * own worked example gives for a Kassenbeleg-V1 transaction that must be
   * closed out without any real content (`tse/signing.ts` already uses this
   * identical pattern to clean up a stranded transaction after a failed
   * `finish`) — `start` gets empty processType/processData per Anhang I,
   * `finish` gets `Kassenbeleg-V1` + zero-amount `AVBelegabbruch` content.
   * This creates **no** `invoice`/`service_order`/`order_cancellation` row
   * at all, so — unlike the two candidates discussed for Task #133 — it is
   * *by construction*, not just by convention, impossible for this test
   * transaction to ever appear in a DSFinV-K export or a Kassenabschluss:
   * both are built exclusively from those three tables (see
   * `exports/dsfinvk/load.ts`), which this route never touches.
   *
   * Deliberately NOT wrapped in `tse/signing.ts`'s `signTseTransaction()` —
   * that helper never throws and only ever reports its own generic,
   * customer-facing `TSE_UNAVAILABLE_WARNING`; here, as an admin diagnostic
   * tool, the real `describeTseError()` detail (including the numeric SDK
   * code) is exactly what's needed instead.
   *
   * Manual, admin-triggered action only (like every other TSE-Tools
   * button) — never called automatically/periodically, since it consumes a
   * real slot in the TSE's limited transaction counter.
   */
  app.post('/test-signature', async (_req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      return reply.status(400).send({ error: 'TSE ist nicht konfiguriert.' });
    }
    try {
      // Anhang I: "Für alle Vorgangstypen gilt, dass processType und
      // processData für die StartTransaction-Operation immer leer sind."
      const start = await startTransaction('', Buffer.alloc(0));
      const finish = await finishTransaction(
        start.transactionNumber, KASSENBELEG_PROCESS_TYPE, buildAvBelegabbruchProcessData(),
      );
      await logSystemEvent(
        'info', 'tse_health',
        `Manueller Signaturtest erfolgreich (Admin-UI) — Transaktion ${finish.transactionNumber}, Signaturzähler ${finish.signatureCounter}.`,
      );
      const response: TseTestSignatureResponse = {
        transactionNumber: finish.transactionNumber,
        signatureCounter: finish.signatureCounter,
        signature: finish.signature,
        serialNumber: finish.serialNumber,
        startTime: new Date(start.logTime * 1000).toISOString(),
        endTime: new Date(finish.logTime * 1000).toISOString(),
      };
      return reply.send(response);
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

  /**
   * POST /api/admin/tse/setup — one-time provisioning of a fresh TSE (Task
   * #131 "TSE-Tools", moves what used to be CLI-only into the Admin UI).
   * Only `config.tseMountPoint` (set via the "TSE-Verbindung" panel) needs
   * to already be configured — `clientId` is a field in this dialog itself,
   * deliberately independent from the Client-ID saved on that panel, since
   * `setup` is exactly the operation that can register a *different*
   * Client-ID (a second TSE, or a fresh one that hasn't been saved
   * anywhere yet). On success, `clientId` is persisted as the new
   * `tse_client_id` setting so every subsequent TSE call (transactions,
   * `maintain`, ...) uses the client just registered. Validates format
   * (Client-ID charset/length, PUK/PIN length and digit-only) *before* ever
   * calling `tseCli`, since a malformed value reaching the TSE itself risks
   * counting toward the 3-attempt lockout (`docs/TSE-CLI-Referenz.md`).
   * `credentialSeed` isn't format-checked beyond non-empty — there's no
   * fixed length/charset to validate against (Task #129).
   */
  app.post<{ Body: Partial<TseSetupBody> }>('/setup', async (req, reply) => {
    if (!config.tseMountPoint) {
      return reply.status(400).send({
        error: 'TSE ist nicht konfiguriert — zuerst den Mount-Pfad oben eintragen.',
      });
    }
    const { clientId, credentialSeed, adminPuk, adminPin, timeAdminPin } = req.body ?? {};
    if (!clientId || !isValidClientId(clientId)) {
      return reply.status(400).send({ error: 'Client-ID darf nur Buchstaben, Ziffern, "-" und "_" enthalten (max. 30 Zeichen).' });
    }
    if (!credentialSeed) {
      return reply.status(400).send({ error: 'CredentialSeed fehlt.' });
    }
    if (!adminPuk || !isValidPuk(adminPuk)) {
      return reply.status(400).send({ error: 'Admin-PUK muss genau 6-stellig sein und darf nur Ziffern enthalten.' });
    }
    if (!adminPin || !isValidPin(adminPin)) {
      return reply.status(400).send({ error: 'Admin-PIN muss genau 5-stellig sein und darf nur Ziffern enthalten.' });
    }
    if (!timeAdminPin || !isValidPin(timeAdminPin)) {
      return reply.status(400).send({ error: 'TimeAdmin-PIN muss genau 5-stellig sein und darf nur Ziffern enthalten.' });
    }
    try {
      await setupTse({ clientId, credentialSeed, adminPuk, adminPin, timeAdminPin });
      await query(
        `INSERT INTO system_setting (key, value) VALUES ('tse_client_id', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [clientId],
      );
      applyTseSettings({ tse_client_id: clientId });
      await logSystemEvent('info', 'tse_setup', `TSE initialisiert (Client-ID "${clientId}", Admin-UI, ${req.adminUser.name}).`);
      return reply.send({ ok: true, clientId });
    } catch (e) {
      return reply.status(502).send({ error: describeTseError(e) });
    }
  });

  /**
   * POST /api/admin/tse/unblock — resets a blocked Admin or TimeAdmin PIN
   * (Task #109/#131). Requires the current PUK for that user; see
   * `tse/client.ts`'s `unblockPin` doc comment for which PUK applies on
   * which firmware version. On a failed attempt (wrong PUK), the response
   * includes `remainingRetries` when the SDK reported one, so the UI can
   * warn before the PUK itself gets blocked.
   */
  app.post<{ Body: Partial<TseUnblockBody> }>('/unblock', async (req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      return reply.status(400).send({ error: 'TSE ist nicht konfiguriert.' });
    }
    const { user, puk, newPin } = req.body ?? {};
    if (user !== 'admin' && user !== 'timeAdmin') {
      return reply.status(400).send({ error: 'Ungültiger Benutzer — muss "admin" oder "timeAdmin" sein.' });
    }
    if (!puk || !isValidPuk(puk)) {
      return reply.status(400).send({ error: 'PUK muss genau 6-stellig sein und darf nur Ziffern enthalten.' });
    }
    if (!newPin || !isValidPin(newPin)) {
      return reply.status(400).send({ error: 'Neue PIN muss genau 5-stellig sein und darf nur Ziffern enthalten.' });
    }
    try {
      await unblockPin(user, puk, newPin);
      await logSystemEvent(
        'info', 'tse_setup',
        `${user === 'admin' ? 'Admin' : 'TimeAdmin'}-PIN entsperrt (Admin-UI, ${req.adminUser.name}).`,
      );
      return reply.send({ ok: true });
    } catch (e) {
      const remainingRetries = e instanceof TseError ? e.remainingRetries : undefined;
      return reply.status(502).send({ error: describeTseError(e), remainingRetries });
    }
  });

  /**
   * POST /api/admin/tse/factory-reset — resets a *development-firmware* TSE
   * to factory default (Task #131). `worm_tse_factoryReset` only works on
   * development hardware by design and simply fails on real/production
   * firmware, so there is no separate safety check here beyond requiring
   * the TSE to be configured — see `docs/TSE-CLI-Referenz.md` section 4.1.
   */
  app.post('/factory-reset', async (req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      return reply.status(400).send({ error: 'TSE ist nicht konfiguriert.' });
    }
    try {
      await factoryResetTse();
      await logSystemEvent(
        'warning', 'tse_setup',
        `TSE auf Werkseinstellung zurückgesetzt (Admin-UI, ${req.adminUser.name}).`,
      );
      return reply.send({ ok: true });
    } catch (e) {
      return reply.status(502).send({ error: describeTseError(e) });
    }
  });

  /**
   * GET /api/admin/tse/dump-process-data — downloads a tab-separated dump
   * of every process-data entry currently stored on the TSE (Task #102,
   * moved into "TSE-Tools" by Task #131) — a diagnostic tool for comparing
   * what the TSE actually recorded against FairPOS's own database.
   */
  app.get('/dump-process-data', async (req, reply) => {
    if (!config.tseMountPoint || !config.tseClientId) {
      return reply.status(400).send({ error: 'TSE ist nicht konfiguriert.' });
    }
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fairpos-tse-dump-'));
    const outputFile = path.join(tmpDir, `${randomUUID()}.txt`);
    try {
      await dumpProcessDataTse(outputFile);
      const dump = await readFile(outputFile);
      const filename = `fairpos_tse_process_data_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
      await logSystemEvent(
        'info', 'tse_export',
        `TSE-Process-Data-Dump heruntergeladen (${req.adminUser.name}).`,
      );
      reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(dump);
    } catch (e) {
      return reply.status(502).send({ error: describeTseError(e) });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
}
