import type { FastifyInstance } from 'fastify';
import { query, withTransaction } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Admin routes for register layout management. */
export async function layoutsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/layouts — list all layouts with slot count. */
  app.get('/', async (_req, reply) => {
    const result = await query(`
      SELECT rl.id, rl.name, rl.grid_cols, rl.grid_rows, rl.created_at,
             COUNT(rls.id)::int AS slot_count
      FROM register_layout rl
      LEFT JOIN register_layout_slot rls ON rls.register_layout_id = rl.id
      GROUP BY rl.id ORDER BY rl.name
    `);
    return reply.send(result.rows);
  });

  /** GET /api/admin/layouts/:id — get a layout with all its slots including article name. */
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const layout = await query(
      'SELECT id, name, grid_cols, grid_rows, created_at FROM register_layout WHERE id = $1', [id],
    );
    if (layout.rows.length === 0) return reply.status(404).send({ error: 'Layout nicht gefunden' });

    const slots = await query(`
      SELECT rls.id, rls.register_layout_id, rls.article_id, a.name AS article_name,
             rls.grid_row, rls.grid_col, rls.color
      FROM register_layout_slot rls
      JOIN article a ON a.id = rls.article_id
      WHERE rls.register_layout_id = $1
    `, [id]);

    return reply.send({ ...layout.rows[0], slots: slots.rows });
  });

  /** POST /api/admin/layouts — create a new empty layout. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; grid_cols?: number; grid_rows?: number };
    if (!body.name) return reply.status(400).send({ error: 'Name erforderlich' });

    const result = await query(
      `INSERT INTO register_layout (name, grid_cols, grid_rows)
       VALUES ($1, $2, $3)
       RETURNING id, name, grid_cols, grid_rows, created_at`,
      [body.name, body.grid_cols ?? 4, body.grid_rows ?? 4],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/layouts/:id — update name or grid size; slots outside the new grid go back to drawer. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; grid_cols?: number; grid_rows?: number };

    await withTransaction(async (client) => {
      if (body.grid_cols !== undefined || body.grid_rows !== undefined) {
        await client.query(
          `DELETE FROM register_layout_slot
           WHERE register_layout_id = $1
             AND (grid_col >= $2 OR grid_row >= $3)`,
          [id, body.grid_cols ?? 9999, body.grid_rows ?? 9999],
        );
      }
      await client.query(
        `UPDATE register_layout
         SET name = COALESCE($1, name),
             grid_cols = COALESCE($2, grid_cols),
             grid_rows = COALESCE($3, grid_rows)
         WHERE id = $4`,
        [body.name ?? null, body.grid_cols ?? null, body.grid_rows ?? null, id],
      );
    });

    const result = await query(
      'SELECT id, name, grid_cols, grid_rows, created_at FROM register_layout WHERE id = $1', [id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Layout nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/layouts/:id — delete layout if no register references it. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inUse = await query('SELECT 1 FROM register WHERE layout_id = $1 LIMIT 1', [id]);
    if ((inUse.rowCount ?? 0) > 0) {
      return reply.status(409).send({ error: 'Layout wird von einer Kasse verwendet' });
    }
    await query('DELETE FROM register_layout_slot WHERE register_layout_id = $1', [id]);
    const result = await query('DELETE FROM register_layout WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Layout nicht gefunden' });
    return reply.status(204).send();
  });

  /** POST /api/admin/layouts/:id/duplicate — create a copy with all slots. */
  app.post('/:id/duplicate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const original = await query(
      'SELECT name, grid_cols, grid_rows FROM register_layout WHERE id = $1', [id],
    );
    if (original.rows.length === 0) return reply.status(404).send({ error: 'Layout nicht gefunden' });

    const { name, grid_cols, grid_rows } = original.rows[0] as { name: string; grid_cols: number; grid_rows: number };

    let newId: string;
    await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO register_layout (name, grid_cols, grid_rows)
         VALUES ($1, $2, $3) RETURNING id`,
        [`${name} (Kopie)`, grid_cols, grid_rows],
      );
      newId = (created.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO register_layout_slot (register_layout_id, article_id, grid_row, grid_col, color)
         SELECT $1, article_id, grid_row, grid_col, color
         FROM register_layout_slot WHERE register_layout_id = $2`,
        [newId, id],
      );
    });

    const result = await query(
      'SELECT id, name, grid_cols, grid_rows, created_at FROM register_layout WHERE id = $1', [newId!],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/layouts/:id/slots — replace all slots with the submitted list. */
  app.put('/:id/slots', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { slots: { article_id: string; grid_row: number; grid_col: number; color: string }[] };

    await withTransaction(async (client) => {
      await client.query('DELETE FROM register_layout_slot WHERE register_layout_id = $1', [id]);
      for (const s of body.slots ?? []) {
        await client.query(
          `INSERT INTO register_layout_slot (register_layout_id, article_id, grid_row, grid_col, color)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, s.article_id, s.grid_row, s.grid_col, s.color],
        );
      }
    });
    return reply.status(204).send();
  });
}
