/**
 * Bridges the TSE connection settings between `system_setting` (source of
 * truth, editable via the admin Settings UI, same table/endpoints as
 * `server_address`) and `config` (in-memory values read synchronously on the
 * hot checkout path — see config.ts).
 */
import { query } from '../db/client.js';
import { config } from '../config.js';

/** Keys in `system_setting` that configure the TSE connection. */
export const TSE_SETTING_KEYS = ['tse_mount_point', 'tse_client_id', 'tse_time_admin_pin'] as const;

/**
 * Copies TSE-related values from a settings key-value map into `config`,
 * overriding the environment-variable defaults. Only keys present in
 * `settings` are applied, so a partial save (e.g. only `tse_client_id`
 * changed) doesn't clobber the other value.
 *
 * @param settings - Flat key-value map, as saved via `PUT /api/admin/settings`.
 */
export function applyTseSettings(settings: Record<string, string>): void {
  if ('tse_mount_point' in settings) config.tseMountPoint = settings['tse_mount_point'] || null;
  if ('tse_client_id' in settings) config.tseClientId = settings['tse_client_id'] || null;
}

/** Loads the persisted TSE connection settings from the database into `config`. Called once at startup. */
export async function loadTseSettingsFromDb(): Promise<void> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [TSE_SETTING_KEYS],
  );
  const settings: Record<string, string> = {};
  for (const row of result.rows) settings[row.key] = row.value;
  applyTseSettings(settings);
}
