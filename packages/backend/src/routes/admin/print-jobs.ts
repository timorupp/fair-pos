/** Admin endpoints for the system-wide print-queue page. */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { loadReceiptById } from '../../receipt/data.js';
import { renderReceiptPdf } from '../../receipt/pdf.js';
import { loadClosingById } from '../../closing/load.js';
import { renderZBonPdf } from '../../closing/pdf.js';

/**
 * Registers `/api/admin/print-jobs/*` routes for the print-queue overview UI.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function printJobsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/print-jobs — print jobs across ALL printers with the joined
   * printer name. Drives the print-queue overview page. `printer_name` reads
   * "Drucker gelöscht" for a job whose printer was deleted since (Task #96,
   * `print_job.printer_id` is `ON DELETE SET NULL`) — a plain `JOIN` would
   * silently drop that job from the list instead.
   *
   * Query param `status` accepts:
   *   - `pending | printing | failed | done | cancelled` → exact-match filter
   *   - `all` → returns every job including already-completed/cancelled ones
   *   - omitted → returns the three non-terminal statuses (default for the queue view)
   *
   * To keep the table from growing without bound when "all" is selected the
   * response is hard-capped at 500 most-recent rows.
   */
  app.get<{ Querystring: { status?: 'pending' | 'printing' | 'failed' | 'done' | 'cancelled' | 'all' } }>(
    '/',
    async (req, reply) => {
      const filterStatus = req.query.status;
      const allStatuses = ['pending', 'printing', 'failed', 'done', 'cancelled'];
      const statusList =
        filterStatus === 'all' || !filterStatus
          ? (filterStatus === 'all' ? allStatuses : ['pending', 'printing', 'failed'])
          : [filterStatus];

      const result = await query(
        `SELECT j.id, j.printer_id, COALESCE(p.name, 'Drucker gelöscht') AS printer_name,
                j.type, j.status, j.attempts, j.reference_id,
                j.created_at, j.last_attempt_at, j.error_message
           FROM print_job j
           LEFT JOIN printer p ON p.id = j.printer_id
          WHERE j.status = ANY($1)
          ORDER BY j.created_at DESC
          LIMIT 500`,
        [statusList],
      );
      // Newest-first for "all"/terminal statuses makes more sense; for
      // non-terminal the operator still wants oldest-first (FIFO of pending work).
      const rows = filterStatus === 'all' || filterStatus === 'done' || filterStatus === 'cancelled'
        ? result.rows
        : [...result.rows].reverse();
      return reply.send(rows);
    },
  );

  /**
   * DELETE /api/admin/print-jobs/:id — cancels a queued or terminally-failed
   * job by setting its status to `cancelled` (Task #79). Refuses a job
   * currently being printed. Previously deleted the row outright — now kept
   * so the queue's status filter still shows what was cancelled instead of
   * it silently disappearing.
   *
   * @param id - The print_job id to cancel.
   */
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = await query<{ status: string }>(
      'SELECT status FROM print_job WHERE id = $1', [id],
    );
    if (existing.rows.length === 0) return reply.status(404).send({ error: 'Druckauftrag nicht gefunden' });
    if (existing.rows[0]!.status === 'printing') {
      return reply.status(409).send({ error: 'Druckauftrag wird gerade ausgeführt und kann nicht abgebrochen werden.' });
    }
    await query(`UPDATE print_job SET status = 'cancelled' WHERE id = $1`, [id]);
    return reply.status(204).send();
  });

  /**
   * POST /api/admin/print-jobs/:id/retry — resets a failed job to `pending` so
   * the worker picks it up again. Useful when the operator wants to retry after
   * fixing the printer rather than re-issuing the source document.
   *
   * @param id - The print_job id to retry.
   */
  app.post<{ Params: { id: string } }>('/:id/retry', async (req, reply) => {
    const { id } = req.params;
    const result = await query<{ status: string }>(
      `UPDATE print_job
          SET status = 'pending', last_attempt_at = NULL, error_message = NULL
        WHERE id = $1 AND status = 'failed' AND printer_id IS NOT NULL
        RETURNING status`,
      [id],
    );
    if (result.rows.length === 0) {
      // Distinguish "wrong status" from "printer was deleted" (Task #96) for
      // a clearer message — retrying with a NULL printer_id would just leave
      // the job stuck as 'pending' forever, since the print worker's claim
      // query can never match a NULL printer_id.
      const current = await query<{ printer_id: string | null }>(
        `SELECT printer_id FROM print_job WHERE id = $1 AND status = 'failed'`, [id],
      );
      if (current.rows[0] && current.rows[0].printer_id === null) {
        return reply.status(409).send({ error: 'Der Drucker dieses Auftrags wurde gelöscht — kann nicht erneut gestartet werden.' });
      }
      return reply.status(409).send({ error: 'Druckauftrag ist nicht im Status "Fehlgeschlagen" und kann nicht erneut gestartet werden.' });
    }
    return reply.send({ ok: true });
  });

  /**
   * GET /api/admin/print-jobs/:id/pdf — PDF preview for a queued/done print
   * job. Resolved per job-type:
   *  - `receipt`        → re-renders the source invoice via `renderReceiptPdf`.
   *  - `daily_closing`  → re-renders the persisted Z-Bon via `renderZBonPdf`.
   *  - `order_slip`     → no structured source exists, 404.
   *  - `test_print`     → no source data, 404.
   *
   * The job's `content` column holds raw ESC/POS bytes (Init / Cut / Bold /
   * Mode selects) — that is *not* a document format and cannot be turned into
   * a PDF generically. Each renderable type therefore has its own renderer
   * working from the structured source row.
   */
  app.get<{ Params: { id: string } }>('/:id/pdf', async (req, reply) => {
    const row = await query<{ type: string; reference_id: string | null }>(
      `SELECT type, reference_id FROM print_job WHERE id = $1`, [req.params.id],
    );
    if (row.rows.length === 0) return reply.status(404).send({ error: 'Druckauftrag nicht gefunden' });
    const job = row.rows[0]!;
    if (!job.reference_id) {
      return reply.status(404).send({ error: 'PDF-Vorschau für diesen Druckauftrag nicht verfügbar' });
    }
    if (job.type === 'receipt') {
      const data = await loadReceiptById(job.reference_id);
      if (!data) return reply.status(404).send({ error: 'Rechnungsdaten nicht ladbar' });
      const pdf = await renderReceiptPdf(data);
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${data.receiptNumber}.pdf"`)
        .header('Cache-Control', 'no-store')
        .send(pdf);
    }
    if (job.type === 'daily_closing') {
      const stored = await loadClosingById(job.reference_id);
      if (!stored) return reply.status(404).send({ error: 'Z-Bon-Daten nicht ladbar' });
      const pdf = await renderZBonPdf(stored.ctx, stored.totals, stored.business_date, stored.logo);
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="z-bon-${stored.ctx.z_number}.pdf"`)
        .header('Cache-Control', 'no-store')
        .send(pdf);
    }
    return reply.status(404).send({ error: 'PDF-Vorschau für diesen Druckauftragstyp nicht verfügbar' });
  });
}
