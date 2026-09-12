/**
 * Periodic TSE health check (Task #64). Polls the cheap `info` command every
 * minute and only runs the far more expensive self-test + time sync
 * (`maintainTse`) when that snapshot actually shows a problem — verified
 * live on hardware (2026-08-26) that `hasValidTime`/`hasPassedSelfTest` do
 * fall back to false after a real TSE connection loss, so this is a
 * reliable signal to poll on. Covers both the original "check once at
 * backend boot" idea (the first tick, started right away — see
 * {@link startTseHealthJob}) and the later-found gap where a TSE that loses
 * its connection mid-operation (USB unplugged/reseated) needs a fresh
 * self-test + time sync before it can sign again, which a boot-only check
 * would never catch.
 *
 * Every result is written to `system_log` (`system/log.ts`) under the
 * `tse_health` category — but only on a state *transition* (healthy →
 * unhealthy, unhealthy → healthy, or an actual maintain attempt), not on
 * every routine tick, so a day of "still fine" polling doesn't flood the
 * log with 1440 identical rows.
 *
 * Never blocks/crashes the backend: a TSE that's unconfigured, unreachable,
 * or failing is logged and left for an admin to notice (via the log
 * viewer or Task #63's future dashboard) or fix with the manual "Zeit
 * synchronisieren" button — signing without a working TSE is an explicitly
 * tolerated operating mode (AEAO zu § 146a AO, Nr. 1.14.3), so this job
 * must never throw out of `tick()`.
 *
 * Task #109/#131: two safeguards against retrying a failing `maintainTse()`
 * (self-test + `worm_tse_updateTime`) too often — both PIN-blocking and the
 * TSE's own lifetime `updateTime` call budget are at stake, see the SDK
 * header (`WormDLL.h`) and D-055 for the full analysis.
 * - `config.tseAutoMaintainEnabled` (Einstellungen -> TSE checkbox) is
 *   flipped off automatically, and persisted, the moment an attempt fails
 *   with a PIN authentication error ({@link isPinAuthError}) — an admin must
 *   re-enable it manually after fixing the PIN.
 * - {@link MAINTAIN_RETRY_COOLDOWN_MS} throttles repeated attempts while the
 *   TSE stays unhealthy for any other reason.
 *
 * Task #132: each tick also independently checks
 * {@link certificateExpiresTodayOrEarlier} — `hasValidTime`/
 * `hasPassedSelfTest` stayed green live on hardware (2026-09-12) while an
 * expired certificate made every real signing attempt fail, so this is a
 * separate signal, not folded into the healthy/unhealthy state machine above.
 *
 * D-072 (2026-09-12): the healthy -> unhealthy transition itself (invalid
 * time / failed self-test) is now always logged the moment it's noticed,
 * even when the disabled-checkbox or retry-cooldown safeguards above then
 * suppress the actual maintain attempt — otherwise the dashboard tile
 * (driven by the newest `tse_health` row) could keep showing a stale
 * "Gesund" from before the TSE became unhealthy, for as long as those
 * safeguards stayed silent.
 */
import { config } from '../config.js';
import { query } from '../db/client.js';
import { logSystemEvent } from '../system/log.js';
import { getTseInfo, maintainTse } from './client.js';
import { describeTseError, isPinAuthError } from './signing.js';

const POLL_INTERVAL_MS = 60_000;
const LOG_CATEGORY = 'tse_health';

/**
 * Minimum time between two consecutive automatic `maintainTse()` attempts
 * while the TSE stays unhealthy for a non-PIN reason (Task #109) — without
 * this, a persistently unhealthy TSE (loose connection, hardware fault)
 * would call `worm_tse_updateTime` once a minute forever, exhausting its
 * documented lifetime budget of 150,000 calls in ~104 days. The very first
 * attempt after a healthy→unhealthy transition always runs immediately
 * (unaffected by this cooldown) so a transient blip still recovers fast.
 */
export const MAINTAIN_RETRY_COOLDOWN_MS = 15 * 60_000;

/** Whether the most recent tick found the TSE healthy — tracked so we only log/act on changes, not every tick. */
let wasHealthy = true;

/** Whether we've already logged the certificate-expiry warning for the current expiry episode — logged once, not every tick (Task #132). */
let certExpiryWarned = false;

/** Timestamp (`Date.now()`) of the last automatic `maintainTse()` attempt, or `null` since the last healthy tick — drives {@link MAINTAIN_RETRY_COOLDOWN_MS}. */
let lastMaintainAttemptAt: number | null = null;

/** Whether we've already logged that automatic maintenance is skipped because `config.tseAutoMaintainEnabled` is off — logged once per disabled episode, not every tick. */
let loggedAutoMaintainDisabled = false;

/** Resets the in-memory health state — test-only, so each test starts from a known state regardless of tick order in earlier tests. */
export function resetTseHealthState(): void {
  wasHealthy = true;
  lastMaintainAttemptAt = null;
  loggedAutoMaintainDisabled = false;
  certExpiryWarned = false;
}

/**
 * Whether a TSE certificate has already expired, or will expire before the
 * end of today (Task #132) — found live 2026-09-12: Self-Test/Zeitsync
 * stayed green while an expired certificate made real signing fail, because
 * neither checks `certificateExpirationDate` at all. Compared at calendar-
 * day granularity (server-local date), not exact-instant: the raw value is
 * a full Unix timestamp with a time-of-day component (`WormDLL.h`:
 * "the timestamp after which the certificate ... will be invalid"), so an
 * exact-instant check would only warn after that precise moment passes —
 * this instead warns from the start of the expiry day, giving same-day
 * lead time before the actual cutoff.
 *
 * @param expirationUnixSeconds - `TseInfo.certificateExpirationDate`.
 * @param now - Injectable for tests; defaults to the real current time.
 * @returns `true` if the certificate's expiry date is today or earlier.
 */
export function certificateExpiresTodayOrEarlier(expirationUnixSeconds: number, now: Date = new Date()): boolean {
  const expiry = new Date(expirationUnixSeconds * 1000);
  const expiryDay = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return expiryDay <= today;
}

/**
 * Persists `tse_auto_maintain_enabled = false` and mirrors it into `config`
 * (Task #109/#131) — called the moment a `maintainTse()` attempt fails
 * specifically due to a PIN authentication error, whether from the periodic
 * health job or the manual "Zeit synchronisieren" button (Task #141,
 * `routes/admin/tse.ts`'s `/maintain` route). Stops the health job from
 * repeating the same failing PIN every minute, which would otherwise
 * permanently block it within 3 attempts (far sooner than the ~104-day
 * `updateTime` frequency limit the cooldown above guards against). An admin
 * must explicitly re-enable this in Einstellungen -> TSE after fixing the PIN.
 */
export async function disableAutoMaintain(): Promise<void> {
  config.tseAutoMaintainEnabled = false;
  await query(
    `INSERT INTO system_setting (key, value) VALUES ('tse_auto_maintain_enabled', 'false')
       ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = now()`,
  );
  await logSystemEvent(
    'error', LOG_CATEGORY,
    'Automatische Zeit-Synchronisation wegen falscher oder gesperrter TimeAdmin-PIN deaktiviert — ' +
    'PIN prüfen/entsperren und danach in Einstellungen -> TSE wieder aktivieren.',
  );
}

/**
 * Runs one health-check tick. Exported (rather than only reachable via the
 * interval) so tests can call it directly without waiting on real timers.
 */
export async function tick(): Promise<void> {
  if (!config.tseMountPoint || !config.tseClientId) return; // not configured — nothing to check

  let info;
  try {
    info = await getTseInfo();
  } catch (e) {
    if (wasHealthy) {
      await logSystemEvent('warning', LOG_CATEGORY, `TSE nicht erreichbar: ${describeTseError(e)}`);
      wasHealthy = false;
    }
    return;
  }

  // Independent of hasValidTime/hasPassedSelfTest below (Task #132) — both
  // can stay green while an expired certificate makes real signing fail.
  if (certificateExpiresTodayOrEarlier(info.certificateExpirationDate)) {
    if (!certExpiryWarned) {
      const expiry = new Date(info.certificateExpirationDate * 1000).toLocaleString('de-DE');
      await logSystemEvent(
        'warning', LOG_CATEGORY,
        `TSE-Zertifikat läuft heute ab oder ist bereits abgelaufen (gültig bis ${expiry}) — Signaturen können jederzeit fehlschlagen, auch wenn Self-Test/Zeitsync weiterhin bestehen. Zertifikatsverlängerung/TSE-Austausch veranlassen.`,
      );
      certExpiryWarned = true;
    }
  } else {
    certExpiryWarned = false;
  }

  if (info.hasValidTime && info.hasPassedSelfTest) {
    if (!wasHealthy) {
      await logSystemEvent('info', LOG_CATEGORY, 'TSE wieder gesund — Zeit synchron, Self-Test bestanden.');
      wasHealthy = true;
    }
    lastMaintainAttemptAt = null;
    loggedAutoMaintainDisabled = false;
    return;
  }

  const wasAlreadyUnhealthy = !wasHealthy;
  wasHealthy = false;

  // Log the healthy -> unhealthy transition itself (D-072, 2026-09-12) — the
  // "TSE nicht erreichbar" branch above already did this on its own
  // transition, but this branch previously only logged the *outcome* of an
  // actual maintain attempt (success/failure) or the disabled-checkbox
  // notice. If neither of those fires this tick (checkbox disabled with its
  // one-time notice already logged earlier, or the retry cooldown below
  // skips silently), the dashboard tile — which only shows the newest
  // `tse_health` log row — kept showing a stale "Gesund" from before this
  // episode started, potentially indefinitely.
  if (!wasAlreadyUnhealthy) {
    await logSystemEvent(
      'warning', LOG_CATEGORY,
      'TSE ungesund — Uhrzeit nicht synchron oder Self-Test nicht bestanden.',
    );
  }

  if (!config.tseAutoMaintainEnabled) {
    if (!loggedAutoMaintainDisabled) {
      await logSystemEvent(
        'warning', LOG_CATEGORY,
        'TSE ungesund, aber automatische Zeit-Synchronisation ist deaktiviert — kein automatischer Versuch, bis ein Admin sie in Einstellungen -> TSE wieder aktiviert.',
      );
      loggedAutoMaintainDisabled = true;
    }
    return;
  }

  // Task #109: don't hammer worm_tse_updateTime every single tick while the
  // TSE stays unhealthy for a non-PIN reason — see MAINTAIN_RETRY_COOLDOWN_MS.
  if (
    wasAlreadyUnhealthy && lastMaintainAttemptAt !== null &&
    Date.now() - lastMaintainAttemptAt < MAINTAIN_RETRY_COOLDOWN_MS
  ) {
    return;
  }

  const pinResult = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = 'tse_time_admin_pin'`,
  );
  const timeAdminPin = pinResult.rows[0]?.value;
  if (!timeAdminPin) {
    await logSystemEvent('warning', LOG_CATEGORY, 'TSE braucht Self-Test/Zeitsync, aber keine TimeAdmin-PIN konfiguriert.');
    return;
  }

  lastMaintainAttemptAt = Date.now();
  try {
    await maintainTse(timeAdminPin);
    await logSystemEvent('info', LOG_CATEGORY, 'Selbsttest erfolgreich');
    wasHealthy = true;
  } catch (e) {
    if (isPinAuthError(e)) {
      await logSystemEvent('warning', LOG_CATEGORY, `Automatischer Self-Test + Zeitsync fehlgeschlagen: ${describeTseError(e)}`);
      await disableAutoMaintain();
    } else {
      // D-072 follow-up (2026-09-12, Nutzerfeedback): the retry-cooldown
      // itself must stay transparent — the next tick(s) within
      // MAINTAIN_RETRY_COOLDOWN_MS return silently (see above) to avoid
      // flooding the log, so this single entry states explicitly when the
      // next automatic attempt will happen, instead of leaving an admin
      // guessing whether the job is still working on it or stuck.
      const retryAt = new Date(Date.now() + MAINTAIN_RETRY_COOLDOWN_MS).toLocaleString('de-DE');
      await logSystemEvent(
        'warning', LOG_CATEGORY,
        `Automatischer Self-Test + Zeitsync fehlgeschlagen: ${describeTseError(e)} — nächster automatischer Versuch nicht vor ${retryAt}.`,
      );
    }
  }
}

/**
 * Starts the periodic health-check job — call once at backend boot, after
 * TSE settings have been loaded from the database (see `app.ts`'s
 * `loadTseSettingsFromDb()`). Runs one tick immediately (covers the
 * original "check at startup" requirement) and then every
 * {@link POLL_INTERVAL_MS}.
 */
export function startTseHealthJob(): void {
  const run = () => { tick().catch((e) => { console.error('[tse-health] unexpected error:', e); }); };
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
