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
 */
import { config } from '../config.js';
import { query } from '../db/client.js';
import { logSystemEvent } from '../system/log.js';
import { getTseInfo, maintainTse } from './client.js';
import { describeTseError } from './signing.js';

const POLL_INTERVAL_MS = 60_000;
const LOG_CATEGORY = 'tse_health';

/** Whether the most recent tick found the TSE healthy — tracked so we only log/act on changes, not every tick. */
let wasHealthy = true;

/** Resets the in-memory health state — test-only, so each test starts from a known state regardless of tick order in earlier tests. */
export function resetTseHealthState(): void {
  wasHealthy = true;
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

  if (info.hasValidTime && info.hasPassedSelfTest) {
    if (!wasHealthy) {
      await logSystemEvent('info', LOG_CATEGORY, 'TSE wieder gesund — Zeit synchron, Self-Test bestanden.');
      wasHealthy = true;
    }
    return;
  }

  wasHealthy = false;
  const pinResult = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = 'tse_time_admin_pin'`,
  );
  const timeAdminPin = pinResult.rows[0]?.value;
  if (!timeAdminPin) {
    await logSystemEvent('warning', LOG_CATEGORY, 'TSE braucht Self-Test/Zeitsync, aber keine TimeAdmin-PIN konfiguriert.');
    return;
  }

  try {
    await maintainTse(timeAdminPin);
    await logSystemEvent('info', LOG_CATEGORY, 'Automatischer Self-Test + Zeitsync erfolgreich.');
    wasHealthy = true;
  } catch (e) {
    await logSystemEvent('warning', LOG_CATEGORY, `Automatischer Self-Test + Zeitsync fehlgeschlagen: ${describeTseError(e)}`);
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
