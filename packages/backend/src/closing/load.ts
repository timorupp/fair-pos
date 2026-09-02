/** Loads a persisted daily closing for reprint / PDF rendering. */

import { query } from '../db/client.js';
import type { ClosingContext } from './blocks.js';
import type { ClosingTotals } from './totals.js';
import { loadLogoFor } from '../logo/visibility.js';
import type { CompanyLogo } from '../logo/logo.js';

/** Read-only view of one stored closing, sufficient for re-rendering. */
export interface StoredClosing {
  id: string;
  register_id: string;
  ctx: ClosingContext;
  totals: ClosingTotals;
  business_date: string;
  /** Optional logo; `null` when no logo is configured or the Z-Bon flag is off. */
  logo: CompanyLogo | null;
}

/** Settings keys consulted for the closing header. */
const COMPANY_SETTING_KEYS = ['company_name', 'system_serial'] as const;

/**
 * Loads everything needed to re-render a Z-Bon — context (company, register,
 * Z-number, timestamp, zero-counter) plus the persisted totals row. Used by
 * the admin "reprint" and "PDF preview" endpoints.
 *
 * @param id - The `daily_closing` primary key.
 * @returns The reconstructed context + totals, or `null` if not found.
 */
export async function loadClosingById(id: string): Promise<StoredClosing | null> {
  const result = await query<{
    id: string; register_id: string; register_name: string;
    z_number: string; created_at: Date; business_date: string;
    is_zero_closing: boolean;
    total_gross: string; total_tax_standard: string; total_tax_reduced: string;
    total_tax_zero: string; total_cash: string; total_cancellations: string;
  }>(
    `SELECT c.id, c.register_id, r.name AS register_name,
            c.z_number::text, c.created_at,
            to_char(c.business_date, 'YYYY-MM-DD') AS business_date,
            c.is_zero_closing,
            c.total_gross::text, c.total_tax_standard::text, c.total_tax_reduced::text,
            c.total_tax_zero::text, c.total_cash::text, c.total_cancellations::text
       FROM daily_closing c
       JOIN register r ON r.id = c.register_id
      WHERE c.id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0]!;

  // Re-derive the zero-counter (number of closings up to and including this one).
  const counterResult = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM daily_closing
      WHERE register_id = $1 AND z_number <= $2`,
    [row.register_id, Number(row.z_number)],
  );
  const zeroCounter = Number(counterResult.rows[0]!.cnt);

  const settingsResult = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [COMPANY_SETTING_KEYS as unknown as string[]],
  );
  const settings = new Map(settingsResult.rows.map((r) => [r.key, r.value]));

  const ctx: ClosingContext = {
    company_name:  settings.get('company_name')  ?? '',
    register_name: row.register_name,
    system_serial: settings.get('system_serial') ?? '(noch nicht initialisiert)',
    z_number:      Number(row.z_number),
    created_at:    row.created_at,
    zero_counter:  zeroCounter,
  };
  const totals: ClosingTotals = {
    total_gross:         Number(row.total_gross),
    total_tax_standard:  Number(row.total_tax_standard),
    total_tax_reduced:   Number(row.total_tax_reduced),
    total_tax_zero:      Number(row.total_tax_zero),
    total_cash:          Number(row.total_cash),
    total_cancellations: Number(row.total_cancellations),
    is_zero_closing:     row.is_zero_closing,
  };

  const logo = await loadLogoFor('z_bon');

  return { id: row.id, register_id: row.register_id, ctx, totals, business_date: row.business_date, logo };
}
