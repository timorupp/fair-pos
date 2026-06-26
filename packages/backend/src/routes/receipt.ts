/** Public receipt PDF endpoint. The token authorises access — anyone with the URL gets the PDF. */

import type { FastifyInstance } from 'fastify';
import { loadReceiptByToken } from '../receipt/data.js';
import { renderReceiptPdf } from '../receipt/pdf.js';

/** Registers `GET /receipt/:token`. */
export async function receiptRoutes(app: FastifyInstance): Promise<void> {

  /** Public endpoint — the customer scans the QR on the receipt dialog and lands here. */
  app.get<{ Params: { token: string } }>('/receipt/:token', async (req, reply) => {
    const { token } = req.params;
    const data = await loadReceiptByToken(token);
    if (!data) return reply.status(404).send({ error: 'Rechnung nicht gefunden' });

    const pdf = await renderReceiptPdf(data);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${data.receiptNumber}.pdf"`)
      .header('Cache-Control', 'no-store')
      .send(pdf);
  });
}
