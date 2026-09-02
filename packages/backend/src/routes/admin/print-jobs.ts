/** Admin endpoints for the system-wide print-queue page. */

import type { FastifyInstance } from 'fastify';
import type { PrintJobType } from '@fairpos/shared';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { enqueuePrintJob } from '../../print/enqueue.js';
import { renderBlocksToEscPos, renderBlocksToPdf, type PrintBlock } from '../../print/blocks.js';

/** German label per job type, used for the PDF preview's filename/title. */
const TYPE_LABELS: Record<PrintJobType, string> = {
  receipt: 'Rechnung',
  daily_closing: 'Z-Bon',
  order_slip: 'Bestellzettel',
  test_print: 'Testdruck',
  pin_slip: 'PIN-Zettel',
};

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
   * job, for every job type EXCEPT `pin_slip` (Task #105 — previously only
   * `receipt`/`daily_closing`, re-rendered from their own structured source
   * row; `order_slip`/`test_print`/`pin_slip` returned 404, "no structured
   * source exists"). Now works generically off the job's own persisted
   * `blocks` (the neutral document description it was originally built
   * from) via the shared renderer — no per-type source reload needed, so no
   * per-type gap either.
   *
   * `pin_slip` is deliberately excluded (Nutzerentscheidung 2026-09-01,
   * security): it's the only document type carrying a live credential (the
   * PIN itself) that exists nowhere else in the system in plaintext — a
   * generic "view any past print job as PDF" feature must not become a way
   * to read out a user's PIN after the fact.
   */
  app.get<{ Params: { id: string } }>('/:id/pdf', async (req, reply) => {
    const row = await query<{ type: PrintJobType; blocks: PrintBlock[] }>(
      `SELECT type, blocks FROM print_job WHERE id = $1`, [req.params.id],
    );
    if (row.rows.length === 0) return reply.status(404).send({ error: 'Druckauftrag nicht gefunden' });
    const job = row.rows[0]!;
    if (job.type === 'pin_slip') {
      return reply.status(403).send({ error: 'PDF-Vorschau für PIN-Zettel ist aus Sicherheitsgründen nicht verfügbar.' });
    }
    const label = TYPE_LABELS[job.type];
    const pdf = await renderBlocksToPdf(job.blocks, label);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${label}-${req.params.id}.pdf"`)
      .header('Cache-Control', 'no-store')
      .send(pdf);
  });

  /**
   * POST /api/admin/print-jobs/:id/reprint — re-queues a brand-new print job
   * with the exact same content as an existing one, for every job type
   * EXCEPT `pin_slip` (Task #105). Generic for the same reason as `/:id/pdf`
   * above — works from the persisted `blocks`, not from reloading each
   * type's own source data, which isn't even possible for every type (a PIN
   * slip's PIN is never stored anywhere else, only in the blocks/content of
   * the original job — precisely why it's excluded here too, see `/:id/pdf`
   * for the full reasoning).
   *
   * Reprints to the job's *original* printer — refuses (409) if that printer
   * was since deleted, same rule as `/:id/retry` above, rather than silently
   * guessing a different one.
   */
  app.post<{ Params: { id: string } }>('/:id/reprint', async (req, reply) => {
    const row = await query<{
      type: PrintJobType; printer_id: string | null; blocks: PrintBlock[]; reference_id: string | null;
    }>(
      `SELECT type, printer_id, blocks, reference_id FROM print_job WHERE id = $1`, [req.params.id],
    );
    if (row.rows.length === 0) return reply.status(404).send({ error: 'Druckauftrag nicht gefunden' });
    const job = row.rows[0]!;
    if (job.type === 'pin_slip') {
      return reply.status(403).send({ error: 'Erneutes Drucken von PIN-Zetteln ist aus Sicherheitsgründen nicht verfügbar.' });
    }
    if (!job.printer_id) {
      return reply.status(409).send({ error: 'Der Drucker dieses Auftrags wurde gelöscht — kann nicht erneut gedruckt werden.' });
    }
    const bytes = renderBlocksToEscPos(job.blocks);
    const newJob = await enqueuePrintJob(job.printer_id, job.type, bytes, job.blocks, job.reference_id);
    return reply.send({ print_job_id: newJob.id });
  });
}
