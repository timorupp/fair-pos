import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Admin routes for article and product option management. */
export async function articlesAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/articles — list all articles with their category name. */
  app.get('/', async (_req, reply) => {
    const result = await query(`
      SELECT a.id, a.name, a.price, a.deposit_price, a.print_deposit_receipt,
             a.is_active, a.created_at, a.category_id, ac.name AS category_name, ac.tax_rate,
             a.printer_id
      FROM article a
      JOIN article_category ac ON ac.id = a.category_id
      ORDER BY ac.name, a.name
    `);
    return reply.send(result.rows);
  });

  /** POST /api/admin/articles — create an article. */
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

    const result = await query(
      `INSERT INTO article (name, category_id, price, deposit_price, print_deposit_receipt, printer_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, category_id, price, deposit_price, print_deposit_receipt, printer_id, is_active, created_at`,
      [
        body.name,
        body.category_id,
        body.price,
        body.deposit_price ?? null,
        body.print_deposit_receipt ?? false,
        body.printer_id ?? null,
        body.is_active ?? true,
      ],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/articles/:id — update an article. */
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

    const result = await query(
      `UPDATE article
       SET name                 = COALESCE($1, name),
           category_id          = COALESCE($2, category_id),
           price                = COALESCE($3, price),
           deposit_price        = $4,
           print_deposit_receipt = COALESCE($5, print_deposit_receipt),
           printer_id           = $6,
           is_active            = COALESCE($7, is_active)
       WHERE id = $8
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
      ],
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Artikel nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/articles/:id — delete an article and its options. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await query('DELETE FROM product_option WHERE article_id = $1', [id]);
    const result = await query('DELETE FROM article WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Artikel nicht gefunden' });
    return reply.status(204).send();
  });

  /** GET /api/admin/articles/:id/options — list product options for an article. */
  app.get('/:id/options', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query(
      'SELECT id, name, price_surcharge FROM product_option WHERE article_id = $1 ORDER BY name',
      [id],
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/articles/:id/options — add a product option to an article. */
  app.post('/:id/options', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; price_surcharge?: number };

    if (!body.name) return reply.status(400).send({ error: 'Name erforderlich' });

    const result = await query(
      `INSERT INTO product_option (article_id, name, price_surcharge)
       VALUES ($1, $2, $3)
       RETURNING id, name, price_surcharge`,
      [id, body.name, body.price_surcharge ?? 0],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** DELETE /api/admin/articles/:id/options/:optionId — remove a product option. */
  app.delete('/:id/options/:optionId', async (req, reply) => {
    const { optionId } = req.params as { id: string; optionId: string };
    const result = await query(
      'DELETE FROM product_option WHERE id = $1 RETURNING id',
      [optionId],
    );
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Option nicht gefunden' });
    return reply.status(204).send();
  });
}
