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
import { query, withTransaction } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { nextReceiptNumber } from '../../receipt/sequence.js';
import { generateReceiptToken } from '../../receipt/numbering.js';

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
    const reasonResult = await query<{ booking_type: 'cancellation' | 'free_of_charge'; is_active: boolean }>(
      `SELECT booking_type, is_active FROM cancellation_reason WHERE id = $1`,
      [cancellation_reason_id],
    );
    const reason = reasonResult.rows[0];
    if (!reason) return reply.status(400).send({ error: 'Stornogrund nicht gefunden' });
    if (reason.booking_type !== 'cancellation') {
      return reply.status(400).send({ error: 'Stornogrund ist kein Storno (booking_type ≠ cancellation)' });
    }
    if (!reason.is_active) {
      return reply.status(400).send({ error: 'Stornogrund ist deaktiviert' });
    }

    const regResult = await query(`SELECT id FROM register WHERE id = $1`, [register_id]);
    if (regResult.rows.length === 0) return reply.status(400).send({ error: 'Kasse nicht gefunden' });

    const result = await withTransaction(async (client) => {
      const receiptNumber = await nextReceiptNumber(client);
      const receiptToken = generateReceiptToken();

      const invoiceResult = await client.query<{ id: string }>(
        `INSERT INTO invoice (
           register_id, receipt_number, receipt_type, payment_method,
           cancellation_note, receipt_token
         ) VALUES ($1, $2, 'cancellation', 'cash', $3, $4)
         RETURNING id`,
        [register_id, receiptNumber, note ?? null, receiptToken],
      );
      const invoiceId = invoiceResult.rows[0]!.id;

      // Fetch the articles for snapshot copy onto the order_item rows.
      const articleIds = [...new Set(items.map((i) => i.article_id))];
      const articles = await client.query<{
        id: string; name: string; receipt_text: string | null; price: string;
        deposit_price: string | null;
        category_name: string; tax_rate: string;
      }>(
        `SELECT a.id, a.name, a.receipt_text, a.price, a.deposit_price,
                c.name AS category_name, c.tax_rate
           FROM article a
           JOIN article_category c ON c.id = a.category_id
          WHERE a.id = ANY($1)`,
        [articleIds],
      );
      const byId = new Map(articles.rows.map((a) => [a.id, a]));
      for (const it of items) {
        if (!byId.has(it.article_id)) throw new Error(`Artikel ${it.article_id} nicht gefunden`);
      }

      // One row per cancelled unit, mirroring the sales-receipt convention.
      // status='paid' is intentional — the invoice's `receipt_type='cancellation'`
      // is what gives the rows their negative effect in `computeClosingTotals`.
      for (const it of items) {
        const article = byId.get(it.article_id)!;
        const displayName = article.receipt_text ?? article.name;
        for (let i = 0; i < it.quantity; i++) {
          await client.query(
            `INSERT INTO order_item (
               invoice_id, register_id, article_id,
               article_name, article_category_name, tax_rate, price, deposit_price,
               status, cancellation_reason_id, cancelled_by, cancelled_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, $10, now())`,
            [
              invoiceId, register_id, article.id,
              displayName, article.category_name,
              article.tax_rate, article.price, article.deposit_price,
              cancellation_reason_id, req.adminUser.id,
            ],
          );
        }
      }

      return { invoice_id: invoiceId, receipt_number: receiptNumber, receipt_token: receiptToken };
    });

    return reply.status(201).send(result);
  });
}
