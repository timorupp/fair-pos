/** One-time system initialisation that must run after migrations on every boot. */

import { query } from '../db/client.js';
import { generateSystemSerial, isValidSystemSerial } from './serial.js';

/**
 * Ensures the cash-register-system serial number exists in `system_setting`.
 * If absent (or malformed from a manual DB edit), generates a fresh one and
 * persists it. Idempotent — safe to call on every server start.
 *
 * @returns The serial currently stored in the DB (existing or newly generated).
 */
export async function ensureSystemSerial(): Promise<string> {
  const existing = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = 'system_serial'`,
  );
  if (existing.rows.length > 0 && isValidSystemSerial(existing.rows[0]!.value)) {
    return existing.rows[0]!.value;
  }

  const serial = generateSystemSerial(new Date().getFullYear());
  await query(
    `INSERT INTO system_setting (key, value) VALUES ('system_serial', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [serial],
  );
  console.log(`[bootstrap] generated system serial: ${serial}`);
  return serial;
}

/**
 * Seeds the `receipt_counter` system_setting row if absent.
 *
 * Initial value = `MAX(invoice.receipt_number)` so even after a DB restore the
 * counter never regresses below an already-issued number. Idempotent: subsequent
 * runs are no-ops thanks to `ON CONFLICT DO NOTHING`.
 */
export async function initReceiptCounter(): Promise<void> {
  await query(
    `INSERT INTO system_setting (key, value)
     SELECT 'receipt_counter', COALESCE(MAX(receipt_number), 0)::text FROM invoice
     ON CONFLICT (key) DO NOTHING`,
  );
}
