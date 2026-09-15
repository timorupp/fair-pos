/**
 * Per-bon-type visibility flags for the company logo.
 *
 * The administrator can toggle independently whether the logo appears on each
 * document kind via checkboxes in the Unternehmensdaten settings. Default for
 * every flag is `false` — uploading a logo doesn't automatically print it.
 */

import { query } from '../db/client.js';
import { loadCompanyLogo, type CompanyLogo } from './logo.js';

/** Logical document types that can carry the logo. */
export type LogoTarget =
  | 'receipt'         // sales-receipt PDF / ESC/POS
  | 'cancellation'    // cancellation invoice PDF / ESC/POS
  | 'z_bon'           // daily closing
  | 'order_slip'      // Bedienungskasse order slip
  | 'pickup_slip'     // Bonkasse self-pickup slip
  | 'deposit_slip';   // Bonkasse separate Pfandbon

/** All keys we read from `system_setting`, in the same order as `LogoTarget`. */
export const LOGO_FLAG_KEYS: Record<LogoTarget, string> = {
  receipt:       'logo_on_receipt',
  cancellation:  'logo_on_cancellation',
  z_bon:         'logo_on_z_bon',
  order_slip:    'logo_on_order_slip',
  pickup_slip:   'logo_on_pickup_slip',
  deposit_slip:  'logo_on_deposit_slip',
};

/**
 * Returns the visibility flag for one target. Missing rows default to false.
 *
 * @param target - The document type to check.
 * @returns `true` when the logo should be embedded into that document type.
 */
export async function isLogoEnabledFor(target: LogoTarget): Promise<boolean> {
  const key = LOGO_FLAG_KEYS[target];
  const result = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = $1`, [key],
  );
  return result.rows[0]?.value === 'true';
}

/**
 * Convenience helper that combines the flag check with the actual logo lookup.
 * Saves callers a conditional + a second query.
 *
 * @param target - The document type to render.
 * @returns The logo when both the flag is on AND a logo is configured; otherwise `null`.
 */
export async function loadLogoFor(target: LogoTarget): Promise<CompanyLogo | null> {
  if (!(await isLogoEnabledFor(target))) return null;
  return loadCompanyLogo();
}
