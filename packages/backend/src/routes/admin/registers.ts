import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Admin routes for register management. */
export async function registersAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/registers — list all registers with their printer and layout name. */
  app.get('/', async (_req, reply) => {
    const result = await query(`
      SELECT r.id, r.name, r.type, r.printer_id, r.layout_id, r.created_at,
             p.name AS printer_name, rl.name AS layout_name
      FROM register r
      LEFT JOIN printer p ON p.id = r.printer_id
      LEFT JOIN register_layout rl ON rl.id = r.layout_id
      ORDER BY r.name
    `);
    return reply.send(result.rows);
  });

  /** GET /api/admin/registers/:id — get a single register with its cash balance. */
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query<{
      id: string; name: string; type: string;
      printer_id: string | null; printer_name: string | null;
      effective_printer_name: string | null;
      layout_id: string | null; layout_name: string | null;
      created_at: Date;
      total_deposits: string; total_withdrawals: string;
    }>(`
      SELECT r.id, r.name, r.type, r.printer_id, r.layout_id, r.created_at,
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
      WHERE r.id = $1
      GROUP BY r.id, p.name, dp.name, rl.name
    `, [id]);
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** POST /api/admin/registers — create a register. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; type?: string; printer_id?: string | null; layout_id?: string | null };
    if (!body.name || !body.type) {
      return reply.status(400).send({ error: 'Name und Typ erforderlich' });
    }
    if (body.type !== 'receipt_register' && body.type !== 'service_register') {
      return reply.status(400).send({ error: 'Ungültiger Kassentyp' });
    }

    const result = await query(
      `INSERT INTO register (name, type, printer_id, layout_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, type, printer_id, layout_id, created_at`,
      [body.name, body.type, body.printer_id ?? null, body.layout_id ?? null],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PUT /api/admin/registers/:id — update a register. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; type?: string; printer_id?: string | null; layout_id?: string | null };

    const result = await query(
      `UPDATE register
       SET name       = COALESCE($1, name),
           type       = COALESCE($2, type),
           printer_id = $3,
           layout_id  = $4
       WHERE id = $5
       RETURNING id, name, type, printer_id, layout_id, created_at`,
      [body.name ?? null, body.type ?? null,
       body.printer_id !== undefined ? body.printer_id : null,
       body.layout_id !== undefined ? body.layout_id : null, id],
    );

    if (result.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /** DELETE /api/admin/registers/:id — delete a register. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query('DELETE FROM register WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });
    return reply.status(204).send();
  });

  /** GET /api/admin/registers/:id/transactions — list cash transactions for a register. */
  app.get('/:id/transactions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query(`
      SELECT ct.id, ct.register_id, ct.user_id, u.name AS user_name,
             ct.type, ct.amount, ct.note, ct.created_at
      FROM cash_transaction ct
      LEFT JOIN "user" u ON u.id = ct.user_id
      WHERE ct.register_id = $1
      ORDER BY ct.created_at DESC
    `, [id]);
    return reply.send(result.rows);
  });

  /** POST /api/admin/registers/:id/transactions — record a deposit or withdrawal. */
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

    const regCheck = await query('SELECT id FROM register WHERE id = $1', [id]);
    if (regCheck.rows.length === 0) return reply.status(404).send({ error: 'Kasse nicht gefunden' });

    const result = await query(
      `INSERT INTO cash_transaction (register_id, user_id, type, amount, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, register_id, user_id, type, amount, note, created_at`,
      [id, req.adminUser.id, body.type, body.amount, body.note ?? null],
    );
    return reply.status(201).send(result.rows[0]);
  });
}
