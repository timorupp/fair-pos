/**
 * Generic system event log (Task #64) — `system_log` (migration
 * 0009_system_log.sql) is deliberately generic (severity/category/message,
 * no TSE-specific columns) so any future automated check or background job
 * can write here too, not just the TSE health job that first needed it.
 */
import { query } from '../db/client.js';

/** Severity level for a system log entry. */
export type LogSeverity = 'info' | 'warning' | 'error';

/** One row from `system_log`, as returned to the admin log-viewer UI. */
export interface SystemLogEntry {
  id: string;
  createdAt: string;
  severity: LogSeverity;
  category: string;
  message: string;
}

/**
 * Writes one row to the system log.
 *
 * @param severity - `info` for routine/successful events, `warning` for a
 *   recoverable problem, `error` for something that needs attention.
 * @param category - Short machine-readable source tag (e.g. `tse_health`) —
 *   lets the log viewer filter by which check/job produced an entry.
 * @param message - Human-readable description of what happened.
 */
export async function logSystemEvent(
  severity: LogSeverity,
  category: string,
  message: string,
): Promise<void> {
  await query(
    `INSERT INTO system_log (severity, category, message) VALUES ($1, $2, $3)`,
    [severity, category, message],
  );
}
