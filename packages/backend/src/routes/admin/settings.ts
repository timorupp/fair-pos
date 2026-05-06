import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';

/** Keys used in the system_setting table. */
const ALLOWED_KEYS = new Set([
  'company_name', 'company_street', 'company_postal_code', 'company_city',
  'company_tax_number', 'company_vat_id', 'receipt_prefix', 'receipt_counter_start',
  'vat_rate_deposit', 'server_address', 'backup_directory',
]);

/** Admin routes for system settings (key-value store). */
export async function settingsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/settings — return all settings as a flat object. */
  app.get('/', async (_req, reply) => {
    const result = await query('SELECT key, value FROM system_setting');
    const settings: Record<string, string> = {};
    for (const row of result.rows as { key: string; value: string }[]) {
      settings[row.key] = row.value;
    }
    return reply.send(settings);
  });

  /** PUT /api/admin/settings — upsert a batch of key-value pairs. */
  app.put('/', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const entries = Object.entries(body).filter(([k]) => ALLOWED_KEYS.has(k));

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO system_setting (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value],
      );
    }
    return reply.status(204).send();
  });
}
