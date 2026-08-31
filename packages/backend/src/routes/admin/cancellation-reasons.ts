import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';

/** Admin routes for cancellation reason management. Scoped to the active event (Task #95). */
export async function cancellationReasonsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/cancellation-reasons — list reasons of the active event ordered by name. */
  app.get('/', async (_req, reply) => {
    const result = await query(
      'SELECT id, name, booking_type, is_active FROM cancellation_reason WHERE event_id = $1 ORDER BY name',
      [config.activeEventId],
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/cancellation-reasons — create a reason in the active event. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; booking_type?: string; is_active?: boolean };
    if (!body.name || !body.booking_type) {
      return reply.status(400).send({ error: 'Name und Buchungsart erforderlich' });
    }
    if (!['cancellation', 'free_of_charge'].includes(body.booking_type)) {
      return reply.status(400).send({ error: 'Ungültige Buchungsart' });
    }

    const result = await query(
      `INSERT INTO cancellation_reason (name, booking_type, is_active, event_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, booking_type, is_active`,
      [body.name, body.booking_type, body.is_active ?? true, config.activeEventId],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/cancellation-reasons/:id — update a reason of the active event. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; booking_type?: string; is_active?: boolean };

    if (body.booking_type && !['cancellation', 'free_of_charge'].includes(body.booking_type)) {
      return reply.status(400).send({ error: 'Ungültige Buchungsart' });
    }

    const result = await query(
      `UPDATE cancellation_reason
       SET name = COALESCE($1, name),
           booking_type = COALESCE($2, booking_type),
           is_active = COALESCE($3, is_active)
       WHERE id = $4 AND event_id = $5
       RETURNING id, name, booking_type, is_active`,
      [body.name ?? null, body.booking_type ?? null, body.is_active ?? null, id, config.activeEventId],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Stornogrund nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/cancellation-reasons/:id — delete a reason of the active event if not referenced by order items. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const inUse = await query(
      'SELECT 1 FROM order_item WHERE cancellation_reason_id = $1 LIMIT 1', [id],
    );
    if ((inUse.rowCount ?? 0) > 0) {
      return reply.status(409).send({ error: 'Stornogrund wird von Buchungen verwendet' });
    }
    const result = await query(
      'DELETE FROM cancellation_reason WHERE id = $1 AND event_id = $2 RETURNING id',
      [id, config.activeEventId],
    );
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Stornogrund nicht gefunden' });
    return reply.status(204).send();
  });
}
