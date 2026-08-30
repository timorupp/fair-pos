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
 * @param output - Raw stdout from `smartctl -H`.
 * @returns `'ok'`/`'error'` when a recognized healthy/failing phrase is
 *   found, `'unknown'` when neither is (unsupported disk, unexpected
 *   output format).
 */
export function classifySmartOutput(output: string): 'ok' | 'error' | 'unknown' {
  if (/FAILED/i.test(output)) return 'error';
  if (/PASSED|:\s*OK\b/i.test(output)) return 'ok';
  return 'unknown';
}

/** Lists physical disk device names (e.g. `sda`, `nvme0n1`) — excludes partitions and LVM/mapper devices, which `smartctl` can't query directly. */
async function listPhysicalDisks(): Promise<string[]> {
  const { stdout } = await execFileAsync(config.lsblkPath, ['-d', '-n', '-o', 'NAME,TYPE']);
  return stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([, type]) => type === 'disk')
    .map(([diskName]) => diskName!);
}

/**
 * Checks the SMART self-assessment health of every physical disk via
 * `smartctl -H` (smartmontools). Requires the `smartmontools` package and a
 * sudoers rule allowing the `fairpos` service user to run `smartctl -H
 * /dev/*` without a password (raw disk access needs root) — see
 * docs/Installationsanleitung.md, "Health-Check: SMART-Datenträgerprüfung".
 * Without either, this reports `warning` (not `error`) — the check is
 * optional infrastructure, not a sign of an actually failing disk.
 */
async function checkSmartHealth(): Promise<HealthCheckResult> {
  const id = 'smart-health';
  const name = 'SMART-Festplattenstatus';

  let disks: string[];
  try {
    disks = await listPhysicalDisks();
  } catch (e) {
    return { id, name, status: 'warning', message: `lsblk nicht verfügbar: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (disks.length === 0) {
    return { id, name, status: 'warning', message: 'Keine physischen Datenträger gefunden.' };
  }

  const perDisk: { disk: string; verdict: ReturnType<typeof classifySmartOutput> }[] = [];
  for (const disk of disks) {
    try {
      const { stdout } = await execFileAsync(config.sudoPath ?? 'sudo', ['smartctl', '-H', `/dev/${disk}`]);
      perDisk.push({ disk, verdict: classifySmartOutput(stdout) });
    } catch (e) {
      // smartctl exits non-zero for a FAILING disk too, not just when it can't run at
      // all — Node still attaches stdout to the rejection in that case, so a genuine
      // failure is distinguished from "smartctl/sudoers not set up" by whether any
      // output came back.
      const stdout = (e as { stdout?: string }).stdout;
      if (stdout) {
        perDisk.push({ disk, verdict: classifySmartOutput(stdout) });
      } else {
        return {
          id, name, status: 'warning',
          message: `smartctl nicht verfügbar (${disk}): ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
  }

  const summary = perDisk
    .map((r) => `${r.disk}: ${r.verdict === 'ok' ? 'OK' : r.verdict === 'error' ? 'FEHLER' : 'unklar'}`)
    .join(', ');
  if (perDisk.some((r) => r.verdict === 'error')) return { id, name, status: 'error', message: `SMART meldet Fehler — ${summary}` };
  if (perDisk.some((r) => r.verdict === 'unknown')) return { id, name, status: 'warning', message: `SMART-Status nicht eindeutig — ${summary}` };
  return { id, name, status: 'ok', message: summary };
}

/** Registered checks, run in this order by {@link runHealthChecks}. */
const HEALTH_CHECKS: HealthCheckDefinition[] = [
  { id: 'disk-space', name: 'Freier Festplattenspeicher', run: checkDiskSpace },
  { id: 'database-integrity', name: 'Datenbank-Integrität', run: checkDatabaseIntegrity },
  { id: 'smart-health', name: 'SMART-Festplattenstatus', run: checkSmartHealth },
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
