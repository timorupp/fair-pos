import type { FastifyInstance } from 'fastify';
import type { TaxCategory } from '@fairpos/shared';
import { query, isPgErrorCode } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';

/** The only valid `tax_category` values (Task #110) — free-text `tax_rate` was replaced by this fixed set so an admin can never enter a rate the rest of the system doesn't recognise. */
const TAX_CATEGORIES: readonly TaxCategory[] = ['zero', 'reduced', 'standard'];

/** Admin routes for article category management. Scoped to the active event (Task #95). */
export async function categoriesAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/categories — list categories of the active event, ordered by name. */
  app.get('/', async (_req, reply) => {
    const result = await query(
      'SELECT id, name, tax_category, created_at FROM article_category WHERE event_id = $1 ORDER BY name',
      [config.activeEventId],
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/categories — create a category in the active event. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; tax_category?: TaxCategory };
    if (!body.name || body.tax_category === undefined) {
      return reply.status(400).send({ error: 'Name und Steuersatz erforderlich' });
    }
    if (!TAX_CATEGORIES.includes(body.tax_category)) {
      return reply.status(400).send({ error: 'Ungültige Steuerkategorie' });
    }

    try {
      const result = await query(
        `INSERT INTO article_category (name, tax_category, event_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, tax_category, created_at`,
        [body.name, body.tax_category, config.activeEventId],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (e: unknown) {
      if (isPgErrorCode(e, '23505')) {
        return reply.status(409).send({ error: `Artikelgruppenname „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /** PUT /api/admin/categories/:id — update a category of the active event. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; tax_category?: TaxCategory };
    if (body.tax_category !== undefined && !TAX_CATEGORIES.includes(body.tax_category)) {
      return reply.status(400).send({ error: 'Ungültige Steuerkategorie' });
    }

    try {
      const result = await query(
        `UPDATE article_category
         SET name = COALESCE($1, name), tax_category = COALESCE($2, tax_category)
         WHERE id = $3 AND event_id = $4
         RETURNING id, name, tax_category, created_at`,
        [body.name ?? null, body.tax_category ?? null, id, config.activeEventId],
      );
      if (result.rows.length === 0) return reply.status(404).send({ error: 'Artikelgruppe nicht gefunden' });
      return reply.send(result.rows[0]);
    } catch (e: unknown) {
      if (isPgErrorCode(e, '23505')) {
        return reply.status(409).send({ error: `Artikelgruppenname „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /** DELETE /api/admin/categories/:id — delete a category of the active event (fails if articles reference it). */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const inUse = await query(
      'SELECT 1 FROM article WHERE category_id = $1 LIMIT 1',
      [id],
    );
    if ((inUse.rowCount ?? 0) > 0) {
      return reply.status(409).send({ error: 'Artikelgruppe wird von Artikeln verwendet' });
    }

    const result = await query(
      'DELETE FROM article_category WHERE id = $1 AND event_id = $2 RETURNING id',
      [id, config.activeEventId],
    );
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Artikelgruppe nicht gefunden' });
    return reply.status(204).send();
  });
}
