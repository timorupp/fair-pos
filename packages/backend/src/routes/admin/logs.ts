/**
 * Admin endpoint for the generic system-log viewer (Task #64).
 *
 * V+S accessible (Task #94 revision, 2026-08-31) — originally
 * System-Administrator-exclusive like events.ts/backup.ts, but the
 * Dashboard's "TSE-Zustand" tile (visible to both admin levels) reads its
 * data from here (`category=tse_health`), and system_log currently only
 * ever receives that one category in practice (see system/log.ts and every
 * `logSystemEvent` call site) — nothing sensitive to a specific rented
 * event/tenant. Revisit this if a future feature starts logging something
 * more sensitive under a new category; `authenticateSystemAdmin` is a
 * one-line change back if so.
 */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import type { LogSeverity, SystemLogEntry } from '../../system/log.js';

/** Hard cap on rows returned per request — the log grows unbounded over time, so the viewer always shows the most recent slice, not the whole table. */
const MAX_ROWS = 500;

/** Registers `/api/admin/logs` routes. */
export async function logsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/logs — most recent system log entries, newest first.
   *
   * Query params (both optional, combinable):
   *   - `severity` — exact match on `info | warning | error`
   *   - `category` — exact match on the log's source tag (e.g. `tse_health`)
   */
  app.get<{ Querystring: { severity?: LogSeverity; category?: string } }>('/', async (req, reply) => {
    const { severity, category } = req.query;
    const conditions: string[] = [];
    const params: string[] = [];
    if (severity) {
      params.push(severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query<{
      id: string; created_at: string; severity: LogSeverity; category: string; message: string;
    }>(
      `SELECT id, created_at, severity, category, message
         FROM system_log
         ${where}
        ORDER BY created_at DESC
        LIMIT ${MAX_ROWS}`,
      params,
    );

    const entries: SystemLogEntry[] = result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      severity: row.severity,
      category: row.category,
      message: row.message,
    }));
    return reply.send(entries);
  });

  /** GET /api/admin/logs/categories — distinct categories seen so far, for the filter dropdown. */
  app.get('/categories', async (_req, reply) => {
    const result = await query<{ category: string }>(
      `SELECT DISTINCT category FROM system_log ORDER BY category`,
    );
    return reply.send(result.rows.map((r) => r.category));
  });
}
