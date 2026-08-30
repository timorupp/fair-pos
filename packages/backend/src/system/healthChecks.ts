/**
 * Manually-triggered system health checks (Task #87) — deliberately not a
 * background job (unlike the TSE health check, Task #64): each check is
 * cheap enough to run on demand from the admin UI, and there's no
 * standing state to poll for. Live-only — results are never written to
 * `system_log`, just returned to the caller for that one request.
 *
 * New checks are added by appending to {@link HEALTH_CHECKS} — the runner
 * and the admin UI both iterate over that list generically, so a new check
 * needs no other wiring.
 */
import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { query } from '../db/client.js';

const execFileAsync = promisify(execFile);

export type HealthCheckStatus = 'ok' | 'warning' | 'error';

/** Result of a single check, as returned to the admin UI. */
export interface HealthCheckResult {
  id: string;
  name: string;
  status: HealthCheckStatus;
  message: string;
}

/** One registered check — `run` must never throw; report failure as a `HealthCheckResult` with `status: 'error'` instead. */
interface HealthCheckDefinition {
  id: string;
  name: string;
  run: () => Promise<HealthCheckResult>;
}

/** Below this much free space, the disk check reports `error` (Nutzervorgabe, 2026-08-30). */
const DISK_ERROR_THRESHOLD_GB = 2;
/** Below this much free space (but above the error threshold), the disk check reports `warning`. */
const DISK_WARNING_THRESHOLD_GB = 10;

/**
 * Checks free space on the filesystem the server itself lives on. Covers
 * the common single-disk deployment (see docs/Installationsanleitung.md) —
 * a setup with the database or TSE mount on a genuinely separate volume
 * would need its own additional entry in {@link HEALTH_CHECKS}. Absolute
 * GB thresholds rather than a free-space percentage — a percentage reads
 * very differently on a 32 GB disk than a 2 TB one, an absolute amount
 * doesn't.
 */
async function checkDiskSpace(): Promise<HealthCheckResult> {
  const id = 'disk-space';
  const name = 'Freier Festplattenspeicher';
  const stats = await statfs('/');
  const freeGb = (stats.bavail * stats.bsize) / 1024 ** 3;
  const freeGbLabel = freeGb.toFixed(1);

  if (freeGb < DISK_ERROR_THRESHOLD_GB) {
    return { id, name, status: 'error', message: `Nur noch ${freeGbLabel} GB frei — dringend Speicherplatz freigeben.` };
  }
  if (freeGb < DISK_WARNING_THRESHOLD_GB) {
    return { id, name, status: 'warning', message: `${freeGbLabel} GB frei — wird knapp.` };
  }
  return { id, name, status: 'ok', message: `${freeGbLabel} GB frei.` };
}

/**
 * Checks that the database is reachable and that no index has been left
 * `invalid` — Postgres marks an index this way when its build (e.g. a
 * `CREATE INDEX CONCURRENTLY`) failed partway through; queries silently
 * stop benefiting from it instead of failing loudly, so it's worth
 * surfacing explicitly rather than waiting for it to show up as an
 * unrelated slowdown.
 */
async function checkDatabaseIntegrity(): Promise<HealthCheckResult> {
  const id = 'database-integrity';
  const name = 'Datenbank-Integrität';
  try {
    await query('SELECT 1');
  } catch (e) {
    return { id, name, status: 'error', message: `Datenbank nicht erreichbar: ${e instanceof Error ? e.message : String(e)}` };
  }

  const invalid = await query<{ name: string }>(
    `SELECT indexrelid::regclass::text AS name FROM pg_index WHERE NOT indisvalid`,
  );
  if (invalid.rows.length > 0) {
    return {
      id, name, status: 'error',
      message: `${invalid.rows.length} ungültige(r) Index/Indizes gefunden: ${invalid.rows.map((r) => r.name).join(', ')}`,
    };
  }

  return { id, name, status: 'ok', message: 'Datenbank erreichbar, keine ungültigen Indizes.' };
}

/**
 * Classifies one disk's `smartctl -H` output. Exported separately so the
 * text-parsing logic is unit-testable without invoking a real subprocess —
 * phrasing differs by disk type ("SMART overall-health self-assessment
 * test result: PASSED" for ATA, "SMART Health Status: OK" for SCSI/NVMe),
 * so this matches loosely rather than one exact string.
 *
 * @param output - Raw stdout from `smartctl -H` or `smartctl -a` (the
 *   health-assessment line is present in both).
 * @returns `'ok'`/`'error'` when a recognized healthy/failing phrase is
 *   found, `'unknown'` when neither is (unsupported disk, unexpected
 *   output format).
 */
export function classifySmartOutput(output: string): 'ok' | 'error' | 'unknown' {
  // \b word boundaries are required here (found live, 2026-08-30): switching
  // smart-check.sh from `-H` to `-a` (Task #87, SSD-wear check) pulled in the
  // full attribute table, whose "WHEN_FAILED" column header contains "FAILED"
  // as a bare substring — a plain /FAILED/ match misclassified every healthy
  // disk as failing the moment `-a` output was used. "_" counts as a word
  // character in regex, so \bFAILED\b does not match inside "WHEN_FAILED".
  if (/\bFAILED\b/i.test(output)) return 'error';
  if (/\bPASSED\b|:\s*OK\b/i.test(output)) return 'ok';
  return 'unknown';
}

/**
 * Fixed, no-argument path of the privileged SMART-check script — same
 * reasoning as `system/tlsCert.ts`'s install script: `sudo` on this
 * project's target Ubuntu versions rejects a wildcard directly in a
 * sudoers command argument ("wildcards are not allowed in command
 * arguments", found live, 2026-08-30, trying `smartctl -H /dev/*"`
 * as the rule instead of wrapping it in a script) — a fixed script path
 * needs no wildcard at all, since the script itself enumerates disks
 * (excluding USB-attached ones) internally. Runs `smartctl -a` per disk
 * (not just `-H`) so the same output serves both the health check below
 * and the wear check further down. See docs/Installationsanleitung.md,
 * "Health-Check: SMART-Datenträgerprüfung", for its exact content and
 * sudoers rule.
 */
const SMART_CHECK_SCRIPT_PATH = '/opt/fairpos/scripts/smart-check.sh';

/**
 * Splits `smart-check.sh`'s combined output into one block of raw
 * `smartctl -a` text per disk, keyed by device name — the shared building
 * block behind both {@link parseSmartCheckOutput} (health) and
 * {@link parseSsdWearPercent} (wear), since both read from the same script
 * invocation's output.
 */
function splitSmartCheckBlocks(output: string): { disk: string; text: string }[] {
  const parts = output.split(/^=== \/dev\/(\S+) ===$/m);
  const result: { disk: string; text: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    result.push({ disk: parts[i]!, text: parts[i + 1] ?? '' });
  }
  return result;
}

/**
 * Parses `smart-check.sh`'s output into a health verdict per disk. Exported
 * separately so this is unit-testable without a real subprocess.
 *
 * @param output - Combined stdout from `smart-check.sh`.
 * @returns One verdict per disk found, in the order they appeared.
 */
export function parseSmartCheckOutput(output: string): { disk: string; verdict: ReturnType<typeof classifySmartOutput> }[] {
  return splitSmartCheckBlocks(output).map(({ disk, text }) => ({ disk, verdict: classifySmartOutput(text) }));
}

/**
 * SATA/ATA SMART attribute names used by different SSD vendors for
 * remaining-life/wear-leveling — not standardized across manufacturers
 * (unlike NVMe's "Percentage Used"), so this tries each known name in
 * turn. Verified live (2026-08-30) against an ADATA SU800NS38, which uses
 * ID 177 `Wear_Leveling_Count`.
 */
const WEAR_ATTRIBUTE_NAMES = ['Wear_Leveling_Count', 'Media_Wearout_Indicator', 'SSD_Life_Left', 'Percent_Lifetime_Remain'];

/**
 * Extracts "percent of rated life remaining" from one disk's `smartctl -a`
 * text, or `null` if no known wear indicator is present (plain HDD, or an
 * SSD using an attribute name not in {@link WEAR_ATTRIBUTE_NAMES}).
 *
 * @param output - Raw `smartctl -a` text for one disk.
 * @returns 0–100 (100 = fully fresh), or `null` if not determinable.
 */
export function parseSsdWearPercent(output: string): number | null {
  // NVMe: standardized "Percentage Used: X%" — 0% = new, 100% = end of
  // rated life, so invert it to match the SATA "remaining" convention below.
  const nvme = output.match(/Percentage Used:\s*(\d+)%/i);
  if (nvme) return 100 - Number(nvme[1]);

  // SATA/ATA attribute table row: "ID# ATTRIBUTE_NAME FLAG VALUE WORST THRESH ...".
  // VALUE already reads as "life remaining" by SMART convention (100 = new,
  // decreasing toward THRESH = end of rated life) for these wear attributes.
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*\d+\s+(\S+)\s+0x[0-9A-Fa-f]+\s+(\d+)\s+\d+\s+\d+/);
    if (match && WEAR_ATTRIBUTE_NAMES.some((n) => n.toLowerCase() === match[1]!.toLowerCase())) {
      return Number(match[2]);
    }
  }
  return null;
}

/**
 * Checks the SMART self-assessment health of every physical disk, via the
 * privileged `smart-check.sh` script (smartmontools). Requires the
 * `smartmontools` package and a sudoers rule allowing the `fairpos`
 * service user to run that one fixed script without a password (raw disk
 * access needs root) — see docs/Installationsanleitung.md, "Health-Check:
 * SMART-Datenträgerprüfung". Without either, this reports `warning` (not
 * `error`) — the check is optional infrastructure, not a sign of an
 * actually failing disk.
 */
async function checkSmartHealth(): Promise<HealthCheckResult> {
  const id = 'smart-health';
  const name = 'SMART-Festplattenstatus';

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(config.sudoPath ?? 'sudo', [SMART_CHECK_SCRIPT_PATH]));
  } catch (e) {
    // The script uses `|| true` per disk internally, so a genuinely failing
    // disk still exits 0 with output — a caught error here means the
    // script/sudoers rule itself isn't set up, not a failing disk.
    return {
      id, name, status: 'warning',
      message: `SMART-Prüfung nicht verfügbar: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const perDisk = parseSmartCheckOutput(stdout);
  if (perDisk.length === 0) {
    return { id, name, status: 'warning', message: 'Keine physischen Datenträger gefunden.' };
  }

  const summary = perDisk
    .map((r) => `${r.disk}: ${r.verdict === 'ok' ? 'OK' : r.verdict === 'error' ? 'FEHLER' : 'unklar'}`)
    .join(', ');
  if (perDisk.some((r) => r.verdict === 'error')) return { id, name, status: 'error', message: `SMART meldet Fehler — ${summary}` };
  if (perDisk.some((r) => r.verdict === 'unknown')) return { id, name, status: 'warning', message: `SMART-Status nicht eindeutig — ${summary}` };
  return { id, name, status: 'ok', message: summary };
}

/** Below this much rated life remaining, the wear check reports `error`. */
const WEAR_ERROR_THRESHOLD_PERCENT = 10;
/** Below this much rated life remaining (but above the error threshold), the wear check reports `warning`. */
const WEAR_WARNING_THRESHOLD_PERCENT = 20;

/**
 * Checks SSD wear/remaining-life across every physical disk that exposes a
 * recognized wear indicator (see {@link parseSsdWearPercent}) — reuses the
 * same privileged `smart-check.sh` script and sudoers rule as
 * {@link checkSmartHealth} (the script runs `smartctl -a`, which includes
 * both the health self-assessment and the full attribute table). A plain
 * HDD, or an SSD using an attribute name outside the known list, simply
 * has nothing to report here — `ok`, not a failure — since wear tracking
 * is inherently SSD-specific, opt-in infrastructure.
 */
async function checkSsdWear(): Promise<HealthCheckResult> {
  const id = 'ssd-wear';
  const name = 'SSD-Abnutzung';

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(config.sudoPath ?? 'sudo', [SMART_CHECK_SCRIPT_PATH]));
  } catch (e) {
    return {
      id, name, status: 'warning',
      message: `SMART-Prüfung nicht verfügbar: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const wear = splitSmartCheckBlocks(stdout)
    .map(({ disk, text }) => ({ disk, percent: parseSsdWearPercent(text) }))
    .filter((r): r is { disk: string; percent: number } => r.percent !== null);

  if (wear.length === 0) {
    return { id, name, status: 'ok', message: 'Keine SSD-Abnutzungsdaten verfügbar (keine SSD erkannt, oder Hersteller-Attribut nicht in der bekannten Liste).' };
  }

  const summary = wear.map((r) => `${r.disk}: ${r.percent}% verbleibend`).join(', ');
  const worst = Math.min(...wear.map((r) => r.percent));
  if (worst < WEAR_ERROR_THRESHOLD_PERCENT) return { id, name, status: 'error', message: `Kritisch wenig Lebensdauer verbleibend — ${summary}` };
  if (worst < WEAR_WARNING_THRESHOLD_PERCENT) return { id, name, status: 'warning', message: `Lebensdauer wird knapp — ${summary}` };
  return { id, name, status: 'ok', message: summary };
}

/** Registered checks, run in this order by {@link runHealthChecks}. */
const HEALTH_CHECKS: HealthCheckDefinition[] = [
  { id: 'disk-space', name: 'Freier Festplattenspeicher', run: checkDiskSpace },
  { id: 'database-integrity', name: 'Datenbank-Integrität', run: checkDatabaseIntegrity },
  { id: 'smart-health', name: 'SMART-Festplattenstatus', run: checkSmartHealth },
  { id: 'ssd-wear', name: 'SSD-Abnutzung', run: checkSsdWear },
];

/**
 * Runs every registered check. A check that throws unexpectedly is
 * reported as its own `error` result instead of aborting the whole run —
 * one broken check should never hide the others' results.
 *
 * @returns One result per registered check, in registration order.
 */
export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.all(
    HEALTH_CHECKS.map(async (check) => {
      try {
        return await check.run();
      } catch (e) {
        return {
          id: check.id,
          name: check.name,
          status: 'error' as const,
          message: `Prüfung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }),
  );
}
