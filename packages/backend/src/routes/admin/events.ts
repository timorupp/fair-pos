import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateSystemAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';

/** Admin routes for event management — Task #95's hierarchy level, not just a reporting period. */
export async function eventsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateSystemAdmin);

  /**
   * GET /api/admin/events — list all events ordered by start time descending.
   * Each row carries `is_active` (Task #95) — derived from `config.activeEventId`,
   * not a stored column, so the list always reflects whichever event is
   * currently active without a second round-trip.
   */
  app.get('/', async (_req, reply) => {
    const result = await query<{ id: string; name: string; start_time: Date; end_time: Date; created_at: Date }>(
      'SELECT id, name, start_time, end_time, created_at FROM event ORDER BY start_time DESC',
    );
    return reply.send(result.rows.map((r) => ({ ...r, is_active: r.id === config.activeEventId })));
  });

  /** POST /api/admin/events — create an event; validates no time overlap with existing events. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; start_time?: string; end_time?: string };
    if (!body.name || !body.start_time || !body.end_time) {
      return reply.status(400).send({ error: 'Name, Startzeit und Endzeit erforderlich' });
    }
    if (new Date(body.end_time) <= new Date(body.start_time)) {
      return reply.status(400).send({ error: 'Endzeit muss nach der Startzeit liegen' });
    }

    const overlap = await query(
      `SELECT 1 FROM event WHERE tstzrange(start_time, end_time) && tstzrange($1::timestamptz, $2::timestamptz) LIMIT 1`,
      [body.start_time, body.end_time],
    );
    if ((overlap.rowCount ?? 0) > 0) {
      return reply.status(409).send({ error: 'Zeitraum überschneidet sich mit einer anderen Veranstaltung' });
    }

    const result = await query(
      `INSERT INTO event (name, start_time, end_time)
       VALUES ($1, $2, $3)
       RETURNING id, name, start_time, end_time, created_at`,
      [body.name, body.start_time, body.end_time],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/events/:id — update an event; validates no overlap with other events. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; start_time?: string; end_time?: string };

    const current = await query('SELECT start_time, end_time FROM event WHERE id = $1', [id]);
    if (current.rows.length === 0) return reply.status(404).send({ error: 'Veranstaltung nicht gefunden' });

    const row = current.rows[0] as { start_time: string; end_time: string };
    const start = body.start_time ?? row.start_time;
    const end = body.end_time ?? row.end_time;

    if (new Date(end) <= new Date(start)) {
      return reply.status(400).send({ error: 'Endzeit muss nach der Startzeit liegen' });
    }

    const overlap = await query(
      `SELECT 1 FROM event WHERE id <> $1
       AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz) LIMIT 1`,
      [id, start, end],
    );
    if ((overlap.rowCount ?? 0) > 0) {
      return reply.status(409).send({ error: 'Zeitraum überschneidet sich mit einer anderen Veranstaltung' });
    }

    const result = await query(
      `UPDATE event SET name = COALESCE($1, name), start_time = $2, end_time = $3
       WHERE id = $4 RETURNING id, name, start_time, end_time, created_at`,
      [body.name ?? null, start, end, id],
    );
    return reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/events/:id — delete an event. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query('DELETE FROM event WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Veranstaltung nicht gefunden' });
    return reply.status(204).send();
  });
}
