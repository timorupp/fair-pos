import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';

/**
 * Checks whether a register layout belongs to the currently active event.
 * Task #95: a register's `layout_id` must never point at a layout from a
 * different event than the register itself — application-level check, no
 * DB constraint (same pattern as the article/category and slot/article
 * checks, see docs/Umsetzungsplan-94-95.txt Phase 2.3/2.4).
 *
 * @param layoutId - The register_layout id to verify.
 * @returns Whether the layout exists in the active event.
 */
async function layoutBelongsToActiveEvent(layoutId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM register_layout WHERE id = $1 AND event_id = $2',
    [layoutId, config.activeEventId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Admin routes for register management. Scoped to the active event (Task #95). */
export async function registersAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/registers — list registers of the active event with their printer and layout name. */
  app.get('/', async (_req, reply) => {
    const result = await query(`
      SELECT r.id, r.name, r.type, r.printer_id, r.layout_id, r.is_active, r.created_at,
             p.name AS printer_name, rl.name AS layout_name
      FROM register r
      LEFT JOIN printer p ON p.id = r.printer_id
      LEFT JOIN register_layout rl ON rl.id = r.layout_id
      WHERE r.event_id = $1
      ORDER BY r.name
    `, [config.activeEventId]);
    return reply.send(result.rows);
  });

  /** GET /api/admin/registers/:id — get a single register (of the active event) with its cash balance. */
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query<{
      id: string; name: string; type: string;
      printer_id: string | null; printer_name: string | null;
      effective_printer_name: string | null;
      layout_id: string | null; layout_name: string | null;
      is_active: boolean;
      created_at: Date;
      total_deposits: string; total_withdrawals: string;
    }>(`
      SELECT r.id, r.name, r.type, r.printer_id, r.layout_id, r.is_active, r.created_at,
             p.name AS printer_name,
             COALESCE(p.name, dp.name) AS effective_printer_name,
             rl.name AS layout_name,
             COALESCE(SUM(CASE WHEN ct.type = 'deposit'    THEN ct.amount ELSE 0 END), 0) AS total_deposits,
             COALESCE(SUM(CASE WHEN ct.type = 'withdrawal' THEN ct.amount ELSE 0 END), 0) AS total_withdrawals
      FROM register r
      LEFT JOIN printer p ON p.id = r.printer_id
      LEFT JOIN printer dp ON dp.is_default = true
      LEFT JOIN register_layout rl ON rl.id = r.layout_id
      LEFT JOIN cash_transaction ct ON ct.register_id = r.id
      WHERE r.id = $1 AND r.event_id = $2
      GROUP BY r.id, p.name, dp.name, rl.name
    `, [id, config.activeEventId]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** POST /api/admin/registers — create a register in the active event. */
  app.post('/', async (req, reply) => {
    const body = req.body as {
      name?: string; type?: string; printer_id?: string | null; layout_id?: string | null;
      is_active?: boolean;
    };
    if (!body.name || !body.type) {
      return reply.status(400).send({ error: 'Name und Typ erforderlich' });
    }
    if (body.type !== 'receipt_register' && body.type !== 'service_register') {
      return reply.status(400).send({ error: 'Ungültiger Kassentyp' });
    }
    if (body.layout_id && !(await layoutBelongsToActiveEvent(body.layout_id))) {
      return reply.status(400).send({ error: 'Layout gehört nicht zur aktiven Veranstaltung' });
    }

    const result = await query(
      `INSERT INTO register (name, type, printer_id, layout_id, is_active, event_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, type, printer_id, layout_id, is_active, created_at`,
      [body.name, body.type, body.printer_id ?? null, body.layout_id ?? null, body.is_active ?? true, config.activeEventId],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /**
   * PUT /api/admin/registers/:id — update a register of the active event, including
   * the `is_active` archive flag (Task #55). Deactivating a register does not
   * touch any historical data — it only makes the register disappear from
   * the operator login/register picker (`GET /register-session/me`).
   */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string; type?: string; printer_id?: string | null; layout_id?: string | null;
      is_active?: boolean;
    };
    if (body.layout_id && !(await layoutBelongsToActiveEvent(body.layout_id))) {
      return reply.status(400).send({ error: 'Layout gehört nicht zur aktiven Veranstaltung' });
    }

    const result = await query(
      `UPDATE register
       SET name       = COALESCE($1, name),
           type       = COALESCE($2, type),
           printer_id = $3,
           layout_id  = $4,
           is_active  = COALESCE($5, is_active)
       WHERE id = $6 AND event_id = $7
       RETURNING id, name, type, printer_id, layout_id, is_active, created_at`,
      [body.name ?? null, body.type ?? null,
       body.printer_id !== undefined ? body.printer_id : null,
       body.layout_id !== undefined ? body.layout_id : null,
       body.is_active !== undefined ? body.is_active : null, id, config.activeEventId],
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /**
   * DELETE /api/admin/registers/:id — delete a register of the active event.
   *
   * Blocked by Postgres (23503, foreign key violation) once the register has
   * any invoice/order_item/service_order/order_cancellation rows — those
   * reference register(id) without ON DELETE CASCADE by design (fiscal
   * records are never deleted). Caught here to surface a clear message
   * instead of a raw 500.
   */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await query(
        'DELETE FROM register WHERE id = $1 AND event_id = $2 RETURNING id',
        [id, config.activeEventId],
      );
      if (result.rowCount === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });
      return reply.status(204).send();
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23503') {
        return reply.status(409).send({ error: 'Kasse hat bereits Transaktionen und kann nicht gelöscht werden' });
      }
      throw e;
    }
  });

  /** GET /api/admin/registers/:id/transactions — list cash transactions for a register of the active event. */
  app.get('/:id/transactions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const regCheck = await query('SELECT id FROM register WHERE id = $1 AND event_id = $2', [id, config.activeEventId]);
    if (regCheck.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });

    const result = await query(`
      SELECT ct.id, ct.register_id, ct.user_name,
             ct.type, ct.amount, ct.note, ct.created_at
      FROM cash_transaction ct
      WHERE ct.register_id = $1
      ORDER BY ct.created_at DESC
    `, [id]);
    return reply.send(result.rows);
  });

  /** POST /api/admin/registers/:id/transactions — record a deposit or withdrawal for a register of the active event. */
  app.post('/:id/transactions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { type?: string; amount?: number; note?: string };

    if (!body.type || body.amount === undefined) {
      return reply.status(400).send({ error: 'Typ und Betrag erforderlich' });
    }
    if (!['deposit', 'withdrawal'].includes(body.type)) {
      return reply.status(400).send({ error: 'Ungültiger Typ (deposit oder withdrawal)' });
    }
    if (body.amount <= 0) {
      return reply.status(400).send({ error: 'Betrag muss größer als 0 sein' });
    }

    const regCheck = await query('SELECT id FROM register WHERE id = $1 AND event_id = $2', [id, config.activeEventId]);
    if (regCheck.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });

    const result = await query(
      `INSERT INTO cash_transaction (register_id, user_name, type, amount, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, register_id, user_name, type, amount, note, created_at`,
      [id, req.adminUser.name, body.type, body.amount, body.note ?? null],
    );
    return reply.status(201).send(result.rows[0]);
  });
}
