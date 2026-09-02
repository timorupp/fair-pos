import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';

/**
 * Confirms a category id belongs to the active event, so an article can
 * never end up referencing a category from a different event (Task #95 —
 * application-level check, no DB constraint, same reasoning as the
 * register_layout_slot/article consistency check in layouts.ts).
 *
 * @param categoryId - The category id to verify.
 * @returns Whether the category exists in the active event.
 */
async function categoryBelongsToActiveEvent(categoryId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM article_category WHERE id = $1 AND event_id = $2',
    [categoryId, config.activeEventId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Admin routes for article and product option management. Scoped to the active event (Task #95). */
export async function articlesAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/articles — list articles of the active event with their category name. */
  app.get('/', async (_req, reply) => {
    const result = await query(`
      SELECT a.id, a.name, a.price, a.deposit_price, a.print_deposit_receipt,
             a.is_active, a.created_at, a.category_id, ac.name AS category_name, ac.tax_rate,
             a.printer_id
      FROM article a
      JOIN article_category ac ON ac.id = a.category_id
      WHERE a.event_id = $1
      ORDER BY ac.name, a.name
    `, [config.activeEventId]);
    return reply.send(result.rows);
  });

  /** POST /api/admin/articles — create an article in the active event. */
  app.post('/', async (req, reply) => {
    const body = req.body as {
      name?: string;
      category_id?: string;
      price?: number;
      deposit_price?: number | null;
      print_deposit_receipt?: boolean;
      printer_id?: string | null;
      is_active?: boolean;
    };

    if (!body.name || !body.category_id || body.price === undefined) {
      return reply.status(400).send({ error: 'Name, Artikelgruppe und Preis erforderlich' });
    }
    if (!(await categoryBelongsToActiveEvent(body.category_id))) {
      return reply.status(400).send({ error: 'Artikelgruppe gehört nicht zur aktiven Veranstaltung' });
    }

    const result = await query(
      `INSERT INTO article (name, category_id, price, deposit_price, print_deposit_receipt, printer_id, is_active, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, category_id, price, deposit_price, print_deposit_receipt, printer_id, is_active, created_at`,
      [
        body.name,
        body.category_id,
        body.price,
        body.deposit_price ?? null,
        body.print_deposit_receipt ?? false,
        body.printer_id ?? null,
        body.is_active ?? true,
        config.activeEventId,
      ],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/articles/:id — update an article of the active event. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      category_id?: string;
      price?: number;
      deposit_price?: number | null;
      print_deposit_receipt?: boolean;
      printer_id?: string | null;
      is_active?: boolean;
    };

    if (body.category_id && !(await categoryBelongsToActiveEvent(body.category_id))) {
      return reply.status(400).send({ error: 'Artikelgruppe gehört nicht zur aktiven Veranstaltung' });
    }

    const result = await query(
      `UPDATE article
       SET name                 = COALESCE($1, name),
           category_id          = COALESCE($2, category_id),
           price                = COALESCE($3, price),
           deposit_price        = $4,
           print_deposit_receipt = COALESCE($5, print_deposit_receipt),
           printer_id           = $6,
           is_active            = COALESCE($7, is_active)
       WHERE id = $8 AND event_id = $9
       RETURNING id, name, category_id, price, deposit_price, print_deposit_receipt, printer_id, is_active, created_at`,
      [
        body.name ?? null,
        body.category_id ?? null,
        body.price ?? null,
        body.deposit_price !== undefined ? body.deposit_price : null,
        body.print_deposit_receipt !== undefined ? body.print_deposit_receipt : null,
        body.printer_id !== undefined ? body.printer_id : null,
        body.is_active !== undefined ? body.is_active : null,
        id,
        config.activeEventId,
      ],
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Artikel nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /**
   * DELETE /api/admin/articles/:id — delete an article (of the active event)
   * and its options.
   *
   * Blocked by Postgres (23503, foreign key violation) once the article has
   * any order_item rows — those reference article(id) without ON DELETE
   * CASCADE by design (a sold article must stay identifiable on past
   * receipts). Caught here to surface a clear message pointing at the
   * "Aktiv"-checkbox instead of a raw 500 (Task #84). The article delete
   * runs before the product_option cleanup so a blocked delete doesn't
   * leave the article's options gone while the article itself survives.
   */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await query(
        'DELETE FROM article WHERE id = $1 AND event_id = $2 RETURNING id',
        [id, config.activeEventId],
      );
      if (result.rowCount === 0) return reply.status(404).send({ error: 'Artikel nicht gefunden' });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23503') {
        return reply.status(409).send({
          error: 'Artikel wurde bereits verkauft und kann nicht gelöscht werden — stattdessen über die "Aktiv"-Checkbox deaktivieren.',
        });
      }
      throw e;
    }
    await query('DELETE FROM product_option WHERE article_id = $1', [id]);
    return reply.status(204).send();
  });

  /** GET /api/admin/articles/:id/options — list product options for an article of the active event. */
  app.get('/:id/options', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query(
      `SELECT po.id, po.name, po.price_surcharge
         FROM product_option po
         JOIN article a ON a.id = po.article_id
        WHERE po.article_id = $1 AND a.event_id = $2
        ORDER BY po.name`,
      [id, config.activeEventId],
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/articles/:id/options — add a product option to an article of the active event. */
  app.post('/:id/options', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; price_surcharge?: number };

    if (!body.name) return reply.status(400).send({ error: 'Name erforderlich' });

    const article = await query('SELECT 1 FROM article WHERE id = $1 AND event_id = $2', [id, config.activeEventId]);
    if ((article.rowCount ?? 0) === 0) return reply.status(404).send({ error: 'Artikel nicht gefunden' });

    const result = await query(
      `INSERT INTO product_option (article_id, name, price_surcharge)
       VALUES ($1, $2, $3)
       RETURNING id, name, price_surcharge`,
      [id, body.name, body.price_surcharge ?? 0],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** DELETE /api/admin/articles/:id/options/:optionId — remove a product option of an article in the active event. */
  app.delete('/:id/options/:optionId', async (req, reply) => {
    const { optionId } = req.params as { id: string; optionId: string };
    const result = await query(
      `DELETE FROM product_option po
        USING article a
        WHERE po.id = $1 AND po.article_id = a.id AND a.event_id = $2
        RETURNING po.id`,
      [optionId, config.activeEventId],
    );
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Option nicht gefunden' });
    return reply.status(204).send();
  });
}
