/** Admin actions on existing invoices (reprint, PDF preview). */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { loadReceiptById, loadReceiptByToken } from '../../receipt/data.js';
import { buildReceiptEscPos } from '../../receipt/escpos-receipt.js';
import { renderReceiptPdf } from '../../receipt/pdf.js';
import { enqueuePrintJob } from '../../print/enqueue.js';
import { resolvePrinterForRegister } from '../../print/resolve-printer.js';

/**
 * Registers `/api/admin/invoices/*` routes for ops on already-issued invoices.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function invoicesAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * POST /api/admin/invoices/:id/reprint — re-queues a print job for an already
   * existing invoice. Used when the operator missed the original print (offline
   * printer, accidental "scanned" click, customer wants a paper copy after all).
   *
   * Returns 400 when the register that produced the invoice has no assigned
   * printer — there is nowhere to send it.
   */
  app.post<{ Params: { id: string } }>('/:id/reprint', async (req, reply) => {
    const { id } = req.params;
    const invResult = await query<{ register_id: string; receipt_token: string | null }>(
      `SELECT register_id, receipt_token FROM invoice WHERE id = $1`, [id],
    );
    const inv = invResult.rows[0];
    if (!inv) return reply.status(404).send({ error: 'Rechnung nicht gefunden' });
    if (!inv.receipt_token) return reply.status(500).send({ error: 'Rechnung ohne Token' });

    const printerId = await resolvePrinterForRegister(inv.register_id);
    if (!printerId) {
      return reply.status(400).send({
        error: 'Kein Drucker verfügbar — der Kasse ist keiner zugeordnet und es ist kein Standarddrucker konfiguriert.',
      });
    }

    const data = await loadReceiptByToken(inv.receipt_token);
    if (!data) return reply.status(404).send({ error: 'Rechnungsdaten nicht ladbar' });

    const bytes = buildReceiptEscPos(data);
    const job = await enqueuePrintJob(printerId, 'receipt', bytes, id);
    return reply.send({ print_job_id: job.id });
  });

  /**
   * GET /api/admin/invoices/:id/pdf — renders the receipt as PDF for the admin
   * UI (reports table, print-queue preview). Independent from the public
   * `/receipt/:token` endpoint, which exists for customers (QR-code link,
   * possibly served through an external reverse proxy) and which authorises
   * via the unguessable token. Here we use the invoice id and rely on the
   * admin session for access control.
   */
  app.get<{ Params: { id: string } }>('/:id/pdf', async (req, reply) => {
    const data = await loadReceiptById(req.params.id);
    if (!data) return reply.status(404).send({ error: 'Rechnung nicht gefunden' });
    const pdf = await renderReceiptPdf(data);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${data.receiptNumber}.pdf"`)
      .header('Cache-Control', 'no-store')
      .send(pdf);
  });
}
