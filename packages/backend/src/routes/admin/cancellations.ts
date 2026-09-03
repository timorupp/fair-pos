/**
 * Admin Bonstorno (cross-receipt cancellation) endpoint.
 *
 * Lets the administrator create a stand-alone cancellation invoice — not
 * referencing one specific original receipt, but recording that a certain
 * number of article-units have been returned at a given Bonkasse. The new
 * invoice carries `receipt_type='cancellation'`; aggregation in
 * `computeClosingTotals` automatically reduces the day's cash balance.
 *
 * The cash-register UIs themselves don't allow negative quantities; the
 * resulting "anti-receipt" therefore only exists through this admin path.
 */

import type { FastifyInstance } from 'fastify';
import type { TaxCategory } from '@fairpos/shared';
import { query, withTransaction } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { nextReceiptNumber } from '../../receipt/sequence.js';
import { generateReceiptToken } from '../../receipt/numbering.js';
import { formatReceiptNumber, readReceiptPrefix } from '../../receipt/format-receipt-number.js';
import { signTseTransaction } from '../../tse/signing.js';
import { buildKassenbelegProcessData, KASSENBELEG_PROCESS_TYPE } from '../../tse/processData.js';
import { loadTaxRates, percentFor } from '../../tax/rates.js';
import { config } from '../../config.js';

/** Body schema for `POST /api/admin/cancellations`. */
interface CreateCancellationBody {
  register_id: string;
  cancellation_reason_id: string;
  /** Optional free-text addition stored on the invoice. */
  note?: string;
  /** One entry per article to cancel, with the per-unit count. */
  items: { article_id: string; quantity: number }[];
}

/**
 * Registers `/api/admin/cancellations` routes.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function cancellationsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * POST /api/admin/cancellations — creates a cross-receipt cancellation
   * invoice on the chosen Bonkasse. Body validation:
   *  - `register_id` must exist
   *  - `cancellation_reason_id` must exist and be of booking_type 'cancellation'
   *  - `items` must be non-empty, every quantity > 0
   *  - each `article_id` must exist
   */
  app.post<{ Body: CreateCancellationBody }>('/', async (req, reply) => {
    const { register_id, cancellation_reason_id, note, items } = req.body;
    if (!register_id) return reply.status(400).send({ error: 'Kasse erforderlich' });
    if (!cancellation_reason_id) return reply.status(400).send({ error: 'Stornogrund erforderlich' });
    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'Mindestens eine Position erforderlich' });
    }
    for (const it of items) {
      if (!it.article_id || !Number.isInteger(it.quantity) || it.quantity <= 0) {
        return reply.status(400).send({ error: 'Jede Position braucht article_id und positive ganzzahlige Menge' });
      }
    }

    // Validate the reason: must exist and be a cancellation (not a free-of-charge entry).
    const reasonResult = await query<{ name: string; booking_type: 'cancellation' | 'free_of_charge'; is_active: boolean }>(
      `SELECT name, booking_type, is_active FROM cancellation_reason WHERE id = $1 AND event_id = $2`,
      [cancellation_reason_id, config.activeEventId],
    );
    const reason = reasonResult.rows[0];
    if (!reason) return reply.status(400).send({ error: 'Stornogrund nicht gefunden' });
    if (reason.booking_type !== 'cancellation') {
      return reply.status(400).send({ error: 'Stornogrund ist kein Storno (booking_type ≠ cancellation)' });
    }
    if (!reason.is_active) {
      return reply.status(400).send({ error: 'Stornogrund ist deaktiviert' });
    }

    const regResult = await query(
      `SELECT id FROM register WHERE id = $1 AND event_id = $2`,
      [register_id, config.activeEventId],
    );
    if (regResult.rows.length === 0) return reply.status(400).send({ error: 'Kasse nicht gefunden' });

    // Articles fetched once, up front — reused for the TSE snapshot and the order_item inserts.
    const articleIds = [...new Set(items.map((i) => i.article_id))];
    const articlesResult = await query<{
      id: string; name: string; price: string;
      deposit_price: string | null;
      category_name: string; tax_category: TaxCategory;
    }>(
      `SELECT a.id, a.name, a.price, a.deposit_price,
              c.name AS category_name, c.tax_category
         FROM article a
         JOIN article_category c ON c.id = a.category_id
        WHERE a.id = ANY($1) AND a.event_id = $2`,
      [articleIds, config.activeEventId],
    );
    const articleById = new Map(articlesResult.rows.map((a) => [a.id, a]));
    for (const it of items) {
      if (!articleById.has(it.article_id)) {
        return reply.status(400).send({ error: `Artikel ${it.article_id} nicht gefunden` });
      }
    }
    const taxRates = await loadTaxRates();

    // Bonstorno is signed as Kassenbeleg-V1 (receipt_type='cancellation'), like
    // any other completed receipt — see docs/Anforderungen.md → "Zu signierende
    // Vorgänge in FairPOS". Never blocks the cancellation — docs/TSE-Integration.md
    // → "TSE-Ausfall".
    const kassenbelegSnapshot = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'cancellation',
      positions: items.map((it) => {
        const article = articleById.get(it.article_id)!;
        return {
          quantity: it.quantity,
          unitPriceEuros: Number(article.price),
          depositPriceEuros: article.deposit_price === null ? null : Number(article.deposit_price),
          taxCategory: article.tax_category,
        };
      }),
    });
    const { signature: tse, warning: tseWarning } = await signTseTransaction(KASSENBELEG_PROCESS_TYPE, kassenbelegSnapshot);

    const result = await withTransaction(async (client) => {
      const receiptNumber = await nextReceiptNumber(client);
      const receiptToken = generateReceiptToken();

      const invoiceResult = await client.query<{ id: string }>(
        `INSERT INTO invoice (
           register_id, receipt_number, receipt_type, payment_method,
           cancellation_note, receipt_token,
           tse_transaction_number, tse_start_time, tse_end_time,
           tse_signature, tse_signature_counter, tse_serial_number
         ) VALUES ($1, $2, 'cancellation', 'cash', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          register_id, receiptNumber, note ?? null, receiptToken,
          tse?.transactionNumber ?? null, tse?.startTime ?? null, tse?.endTime ?? null,
          tse?.signature ?? null, tse?.signatureCounter ?? null, tse?.serialNumber ?? null,
        ],
      );
      const invoiceId = invoiceResult.rows[0]!.id;

      // One row per cancelled unit, mirroring the sales-receipt convention.
      // status='paid' is intentional — the invoice's `receipt_type='cancellation'`
      // is what gives the rows their negative effect in `computeClosingTotals`.
      for (const it of items) {
        const article = articleById.get(it.article_id)!;
        const displayName = article.name;
        const articleTaxRate = percentFor(article.tax_category, taxRates);
        const depositRaw = article.deposit_price === null ? 0 : Number(article.deposit_price);
        const depositTaxRate = depositRaw !== 0 ? taxRates.standard : null;
        for (let i = 0; i < it.quantity; i++) {
          await client.query(
            `INSERT INTO order_item (
               invoice_id, register_id, article_id,
               article_name, article_category_name, tax_rate, tax_category, price, deposit_price, deposit_tax_rate,
               status, cancellation_reason_id, cancellation_reason_name, cancelled_by_name, cancelled_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'paid', $11, $12, $13, now())`,
            [
              invoiceId, register_id, article.id,
              displayName, article.category_name,
              articleTaxRate, article.tax_category, article.price, article.deposit_price, depositTaxRate,
              cancellation_reason_id, reason.name, req.adminUser.name,
            ],
          );
        }
      }

      return { invoice_id: invoiceId, receipt_number: receiptNumber, receipt_token: receiptToken };
    });

    const prefix = await readReceiptPrefix();
    return reply.status(201).send({
      ...result,
      receipt_number_formatted: formatReceiptNumber(result.receipt_number, prefix),
      tse_warning: tseWarning,
    });
  });
}
