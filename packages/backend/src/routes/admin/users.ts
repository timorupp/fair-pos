import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '../../db/client.js';
import { hashPassword } from '../../auth/password.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** User row returned to the client — never includes password_hash. */
interface UserRow {
  id: string;
  name: string;
  is_admin: boolean;
  created_at: string;
}

/** Admin routes for user management. All routes require admin privileges. */
export async function usersAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/users — list all users ordered by name. */
  app.get('/', async (_req, reply) => {
    const result = await query<UserRow>(
      'SELECT id, name, is_admin, created_at FROM "user" ORDER BY name',
    );
    return reply.send(result.rows);
  });

  /** POST /api/admin/users — create a new user. */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; password?: string; is_admin?: boolean };
    if (!body.name || !body.password) {
      return reply.status(400).send({ error: 'Name und Passwort erforderlich' });
    }

    const hash = await hashPassword(body.password);
    try {
      const result = await query<UserRow>(
        `INSERT INTO "user" (name, password_hash, is_admin)
         VALUES ($1, $2, $3)
         RETURNING id, name, is_admin, created_at`,
        [body.name, hash, body.is_admin ?? false],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Benutzername „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /** PUT /api/admin/users/:id — update name, admin flag, or password. */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; password?: string; is_admin?: boolean };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(body.name); }
    if (body.is_admin !== undefined) { setClauses.push(`is_admin = $${idx++}`); params.push(body.is_admin); }
    if (body.password) {
      const hash = await hashPassword(body.password);
      setClauses.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ error: 'Keine Felder zum Aktualisieren angegeben' });
    }

    params.push(id);
    try {
      const result = await query<UserRow>(
        `UPDATE "user" SET ${setClauses.join(', ')} WHERE id = $${idx}
         RETURNING id, name, is_admin, created_at`,
        params,
      );
      if (result.rows.length === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      return reply.send(result.rows[0]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        return reply.status(409).send({ error: `Benutzername „${body.name}" ist bereits vergeben` });
      }
      throw e;
    }
  });

  /** DELETE /api/admin/users/:id — delete a user. Prevents self-deletion. */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    if (id === req.adminUser.id) {
      return reply.status(400).send({ error: 'Du kannst deinen eigenen Benutzer nicht löschen' });
    }

    const result = await query(
      'DELETE FROM "user" WHERE id = $1 RETURNING id',
      [id],
    );
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
    return reply.status(204).send();
  });

  /** GET /api/admin/users/:id/registers — list registers assigned to a user. */
  app.get('/:id/registers', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query<{ register_id: string }>(
      'SELECT register_id FROM user_register WHERE user_id = $1',
      [id],
    );
    return reply.send(result.rows.map((r) => r.register_id));
  });

  /** PUT /api/admin/users/:id/registers — replace the full set of assigned registers. */
  app.put('/:id/registers', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { register_ids?: string[] };
    const ids = body.register_ids ?? [];

    await query('DELETE FROM user_register WHERE user_id = $1', [id]);
    if (ids.length > 0) {
      const values = ids.map((rid, i) => `($1, $${i + 2})`).join(', ');
      await query(`INSERT INTO user_register (user_id, register_id) VALUES ${values}`, [id, ...ids]);
    }
    return reply.status(204).send();
  });

  /** POST /api/admin/users/:id/token — generate a one-time QR login token (valid 10 min). */
  app.post('/:id/token', async (req, reply) => {
    const { id } = req.params as { id: string };

    const userCheck = await query('SELECT id FROM "user" WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) return reply.status(404).send({ error: 'Benutzer nicht gefunden' });

    const token = randomBytes(32).toString('hex');
    const validUntil = new Date(Date.now() + 10 * 60 * 1000);

    await withTransaction(async (client) => {
      // Invalidate any existing tokens for this user before creating a new one.
      await client.query('DELETE FROM register_access_token WHERE user_id = $1', [id]);
      await client.query(
        'INSERT INTO register_access_token (user_id, token, valid_until) VALUES ($1, $2, $3)',
        [id, token, validUntil],
      );
    });

    return reply.send({ token, valid_until: validUntil.toISOString() });
  });
}
