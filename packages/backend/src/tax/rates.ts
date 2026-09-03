/**
 * Resolves the two configurable VAT percentages (Task #110) — the
 * Regelsteuersatz and ermäßigter Steuersatz are `system_setting` values
 * (`vat_rate_standard`/`vat_rate_reduced`), not hardcoded, so a future legal
 * rate change only needs a settings update, not a code change. `zero` needs
 * no setting — it is always exactly 0 % by definition.
 */

import { query } from '../db/client.js';
import type { TaxCategory } from '@fairpos/shared';

/** Fallback used when a rate setting has never been explicitly saved — matches the rates in force when this module was introduced (2026-09-03), same pattern as `receipt_prefix`'s `?? 'RE-'` default. */
const DEFAULT_STANDARD_RATE = 19;
const DEFAULT_REDUCED_RATE = 7;

/** The two configurable VAT percentages, in percent (e.g. `19`, `7`). */
export interface TaxRates {
  standard: number;
  reduced: number;
}

/**
 * Loads the current `vat_rate_standard`/`vat_rate_reduced` settings.
 *
 * @returns The two configured percentages, falling back to 19/7 if unset.
 */
export async function loadTaxRates(): Promise<TaxRates> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [['vat_rate_standard', 'vat_rate_reduced']],
  );
  const map = new Map(result.rows.map((r) => [r.key, r.value]));
  return {
    standard: Number(map.get('vat_rate_standard') ?? DEFAULT_STANDARD_RATE),
    reduced: Number(map.get('vat_rate_reduced') ?? DEFAULT_REDUCED_RATE),
  };
}

/**
 * Resolves a VAT category to its current percentage.
 *
 * @param category - The category to resolve.
 * @param rates - Already-loaded rates (see {@link loadTaxRates}).
 * @returns The percentage, e.g. `19` for `standard` given the default rates.
 */
export function percentFor(category: TaxCategory, rates: TaxRates): number {
  if (category === 'standard') return rates.standard;
  if (category === 'reduced') return rates.reduced;
  return 0;
}
