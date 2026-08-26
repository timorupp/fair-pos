/** Admin routes for printer management, online-status probing, test prints and queue inspection. */
import type { FastifyInstance } from 'fastify';
import { query, withTransaction } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { probePrinter } from '../../print/tcp.js';
import { buildTestPrint } from '../../print/escpos.js';
import { loadCompanyLogo } from '../../logo/logo.js';
import { enqueuePrintJob } from '../../print/enqueue.js';

/** Registers /api/admin/printers routes. */
export async function printersAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/printers — list all printers. */
  app.get('/', async (_req, reply) => {
    const result = await query(
      'SELECT id, name, ip_address, port, is_default, created_at FROM printer ORDER BY name',
    );
    return reply.send(result.rows);
  });

  /**
   * POST /api/admin/printers — creates a printer.
   *
   * The "default printer" flag is invariant — exactly zero or one row has
   * `is_default=true`. The body's `is_default` is intentionally ignored:
   *  - If no printer exists yet, the new one is auto-promoted to default.
   *  - Otherwise, the new printer is created as non-default; switch the
   *    default later via `POST /:id/set-default`.
   */
  app.post('/', async (req, reply) => {
    const body = req.body as { name?: string; ip_address?: string; port?: number };
    if (!body.name || !body.ip_address) {
      return reply.status(400).send({ error: 'Name und IP-Adresse erforderlich' });
    }

    const result = await withTransaction(async (client) => {
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM printer`,
      );
      const isFirst = Number(countResult.rows[0]!.count) === 0;
      return client.query(
        `INSERT INTO printer (name, ip_address, port, is_default)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, ip_address, port, is_default, created_at`,
        [body.name, body.ip_address, body.port ?? 9100, isFirst],
      );
    });
    return reply.status(201).send(result.rows[0]);
  });

  /**
   * PUT /api/admin/printers/:id — updates name / IP / port.
   *
   * The `is_default` flag is NOT updatable here — use `POST /:id/set-default`
   * so the invariant (exactly one default while any printer exists) stays
   * guarded in a single code path.
   */
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; ip_address?: string; port?: number };

    const result = await query(
      `UPDATE printer
          SET name       = COALESCE($1, name),
              ip_address = COALESCE($2, ip_address),
              port       = COALESCE($3, port)
        WHERE id = $4
        RETURNING id, name, ip_address, port, is_default, created_at`,
      [body.name ?? null, body.ip_address ?? null, body.port ?? null, id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
    return reply.send(result.rows[0]);
  });

  /**
   * POST /api/admin/printers/:id/set-default — promotes one printer to default
   * and demotes all others. Idempotent if called on the already-default printer.
   */
  app.post('/:id/set-default', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await withTransaction(async (client) => {
      const existing = await client.query(`SELECT 1 FROM printer WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return null;
      await client.query(`UPDATE printer SET is_default = (id = $1)`, [id]);
      return existing;
    });
    if (!result) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
    return reply.status(204).send();
  });

  /**
   * DELETE /api/admin/printers/:id — deletes a printer.
   *
   * If the deleted row was the current default and other printers remain, the
   * oldest one (by `created_at`) is auto-promoted to default so the invariant
   * holds. If no other printers exist, the "no default" state is acceptable.
   *
   * Blocked by Postgres (23503, foreign key violation) while any register,
   * article or print_job still references this printer — caught here to
   * surface a clear message instead of a raw 500 (analog Task #54). No
   * archive/deactivate alternative needed: unlike registers/users, a printer
   * doesn't need to stay historically provable, so the operator simply has
   * to remove the reference (reassign register/article, or wait for the
   * print job to finish) before the printer can be deleted (Task #57).
   */
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await withTransaction(async (client) => {
        const target = await client.query<{ is_default: boolean }>(
          `SELECT is_default FROM printer WHERE id = $1`, [id],
        );
        if (target.rows.length === 0) return { found: false };
        const wasDefault = target.rows[0]!.is_default;
        await client.query(`DELETE FROM printer WHERE id = $1`, [id]);
        if (wasDefault) {
          // Promote the oldest remaining printer to default.
          await client.query(
            `UPDATE printer SET is_default = true
               WHERE id = (SELECT id FROM printer ORDER BY created_at LIMIT 1)`,
          );
        }
        return { found: true };
      });

      if (!result.found) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
      return reply.status(204).send();
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23503') {
        return reply.status(409).send({ error: 'Drucker wird noch verwendet und kann nicht gelöscht werden' });
      }
      throw e;
    }
  });

  /** GET /api/admin/printers/:id/status — TCP probe to determine if the printer is reachable. */
  app.get('/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query<{ ip_address: string; port: number }>(
      'SELECT ip_address, port FROM printer WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
    const printer = result.rows[0]!;
    const online = await probePrinter(printer.ip_address, printer.port);
    return reply.send({ online });
  });

  /**
   * POST /api/admin/printers/:id/test-print — enqueues a test page on the print queue.
   *
   * Goes through the same `print_job` pipeline as receipts and order slips, so the
   * operator's test exercises the full infrastructure (queue insert → NOTIFY → worker
   * → TCP send → status update). The UI surfaces the result by refreshing the queue
   * list and watching the job transition `pending` → `printing` → `done`/`failed`.
   *
   * Returns the new print-job id so the UI can highlight it.
   */
  app.post('/:id/test-print', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query<{ name: string }>(
      'SELECT name FROM printer WHERE id = $1', [id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ error: 'Drucker nicht gefunden' });
    const printer = result.rows[0]!;

    // Always embed the configured logo on the test page — independent of the
    // per-bon-type flags, because the test print's purpose is exactly to
    // verify that the logo prints correctly. When no logo is uploaded the
    // test slip prints without one, as before.
    const logo = await loadCompanyLogo();
    const payload = buildTestPrint(printer.name, new Date(), logo?.escposBytes ?? null);
    const job = await enqueuePrintJob(id, 'test_print', payload);
    return reply.send({ print_job_id: job.id });
  });
}
