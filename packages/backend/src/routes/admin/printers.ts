import type { FastifyInstance } from 'fastify';
import { query, withTransaction } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Admin routes for printer management. */
export async function printersAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/printers — list all printers. */
  app.get('/', async (_req, reply) => {
    const result = await query(
      'SELECT id, name, ip_address, port, is_default, created_at FROM printer ORDER BY name',
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/printers — create a printer. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; ip_address?: string; port?: number; is_default?: boolean };
    if (!body.name || !body.ip_address) {
      return reply.status(400).send({ error: 'Name und IP-Adresse erforderlich' });
    }

    const result = await withTransaction(async (client) => {
      if (body.is_default) {
        await client.query('UPDATE printer SET is_default = false');
      }
      return client.query(
        `INSERT INTO printer (name, ip_address, port, is_default)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, ip_address, port, is_default, created_at`,
        [body.name, body.ip_address, body.port ?? 9100, body.is_default ?? false],
      );
    });
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/printers/:id — update a printer. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; ip_address?: string; port?: number; is_default?: boolean };

    const result = await withTransaction(async (client) => {
      if (body.is_default) {
        await client.query('UPDATE printer SET is_default = false WHERE id <> $1', [id]);
      }
      return client.query(
        `UPDATE printer
         SET name       = COALESCE($1, name),
             ip_address = COALESCE($2, ip_address),
             port       = COALESCE($3, port),
             is_default = COALESCE($4, is_default)
         WHERE id = $5
         RETURNING id, name, ip_address, port, is_default, created_at`,
        [body.name ?? null, body.ip_address ?? null, body.port ?? null, body.is_default ?? null, id],
      );
    });

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/printers/:id — delete a printer. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query('DELETE FROM printer WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
    return reply.status(204).send();
  });
}
