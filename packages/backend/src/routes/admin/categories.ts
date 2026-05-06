import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Admin routes for article category management. */
export async function categoriesAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/categories — list all categories ordered by name. */
  app.get('/', async (_req, reply) => {
    const result = await query(
      'SELECT id, name, tax_rate, created_at FROM article_category ORDER BY name',
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/categories — create a category. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; tax_rate?: number };
    if (!body.name || body.tax_rate === undefined) {
      return reply.status(400).send({ error: 'Name und Steuersatz erforderlich' });
    }

    try {
      const result = await query(
        `INSERT INTO article_category (name, tax_rate)
         VALUES ($1, $2)
         RETURNING id, name, tax_rate, created_at`,
        [body.name, body.tax_rate],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Kategoriename „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /** PUT /api/admin/categories/:id — update a category. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; tax_rate?: number };

    try {
      const result = await query(
        `UPDATE article_category
         SET name = COALESCE($1, name), tax_rate = COALESCE($2, tax_rate)
         WHERE id = $3
         RETURNING id, name, tax_rate, created_at`,
        [body.name ?? null, body.tax_rate ?? null, id],
      );
      if (result.rows.length === 0) return reply.status(404).send({ error: 'Kategorie nicht gefunden' });
      return reply.send(result.rows[0]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Kategoriename „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /** DELETE /api/admin/categories/:id — delete a category (fails if articles reference it). */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const inUse = await query(
      'SELECT 1 FROM article WHERE category_id = $1 LIMIT 1',
      [id],
    );
    if ((inUse.rowCount ?? 0) > 0) {
      return reply.status(409).send({ error: 'Kategorie wird von Artikeln verwendet' });
    }

    const result = await query(
      'DELETE FROM article_category WHERE id = $1 RETURNING id',
      [id],
    );
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Kategorie nicht gefunden' });
    return reply.status(204).send();
  });
}
