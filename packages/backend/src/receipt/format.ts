/** Pure formatting and aggregation helpers for receipts. No I/O, no globals — fully unit-testable. */

import type { TaxCategory } from '@fairpos/shared';
import type { ReceiptPosition, TaxBreakdownRow } from './types.js';

/**
 * German euro formatter (instantiated once — `Intl.NumberFormat` construction is expensive).
 * Always renders two decimals with a comma separator and a dot as the thousands separator.
 */
const euroFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a euro amount in German style with two decimals.
 *
 * @param amount - Numeric amount.
 * @returns The amount as `12,34` / `1.234,56` / `-2,50` etc.
 */
export function formatEuro(amount: number): string {
  return euroFormatter.format(amount);
}

/**
 * Like `formatEuro` but with a trailing ` €` for display in tables.
 *
 * @param amount - Numeric amount.
 * @returns `12,34 €` style string.
 */
export function formatEuroLabel(amount: number): string {
  return `${formatEuro(amount)} €`;
}

/**
 * Formats a date in the DSFinV-K-friendly German style.
 *
 * @param d - Date to format (host's local timezone).
 * @returns `DD.MM.YYYY HH:MM:SS` string.
 */
export function formatGermanDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Formats a tax rate as a German-style percent string.
 *
 * @param rate - The rate as a number (e.g. 19, 7, 0, 10.5).
 * @returns `19 %` / `7 %` / `0 %` / `10,50 %` etc.
 */
export function formatTaxRate(rate: number): string {
  // tax rates in our DB are DECIMAL(5,2), but most are whole numbers — strip trailing .00
  const fixed = rate.toFixed(2);
  return `${fixed.endsWith('.00') ? rate.toFixed(0) : fixed.replace('.', ',')} %`;
}

/**
 * Kennbuchstabe per tax category (Task #115) — printed next to a position
 * and next to its matching VAT-breakdown row, so a mixed-rate basket (e.g.
 * Speisen 7 % + Getränke 19 %) stays traceable per line without repeating
 * the full percentage on every position. Not a legal requirement (§ 6
 * KassenSichV only requires the aggregate breakdown, already printed) —
 * purely a readability improvement, Nutzerentscheidung 2026-09-04.
 *
 * @param category - The tax category to label.
 * @returns A single uppercase letter, matching the common German
 *   supermarket-receipt convention (A = Regelsteuersatz, B = ermäßigt, C = steuerfrei).
 */
export function taxCategoryLetter(category: TaxCategory): string {
  const letters: Record<TaxCategory, string> = { standard: 'A', reduced: 'B', zero: 'C' };
  return letters[category];
}

/**
 * Aggregates a list of positions into one row per VAT rate.
 *
 * - `gross` is summed across positions of the same rate — the article price
 *   and any deposit are bucketed separately (Task #113: a deposit is always
 *   taxed at the Regelsteuersatz, independent of the article's own rate),
 *   even though they print as one combined line on the receipt itself.
 * - `net` is computed via `gross / (1 + rate/100)` and rounded to the cent.
 * - `tax` is `gross - net` so the rows always reconcile back to the gross total.
 *
 * @param positions - The receipt positions to aggregate.
 * @returns One row per distinct rate, sorted descending by rate (standard first).
 */
export function computeTaxBreakdown(positions: ReceiptPosition[]): TaxBreakdownRow[] {
  const byRate = new Map<number, { gross: number; category: TaxCategory }>();
  const add = (rate: number, category: TaxCategory, amount: number) => {
    const existing = byRate.get(rate);
    byRate.set(rate, { gross: (existing?.gross ?? 0) + amount, category });
  };
  for (const p of positions) {
    add(p.taxRate, p.taxCategory, p.unitPrice * p.quantity);
    // Deposit is always taxed at the Regelsteuersatz (Task #113), independent of the article's own category.
    if (p.unitDeposit && p.depositTaxRate !== null) {
      add(p.depositTaxRate, 'standard', p.unitDeposit * p.quantity);
    }
  }

  const rows: TaxBreakdownRow[] = [];
  for (const [rate, { gross, category }] of byRate.entries()) {
    const roundedGross = round2(gross);
    const net = round2(roundedGross / (1 + rate / 100));
    rows.push({ rate, category, gross: roundedGross, net, tax: round2(roundedGross - net) });
  }
  rows.sort((a, b) => b.rate - a.rate);
  return rows;
}

/**
 * Sums position line totals to produce the receipt gross total (cent-precise).
 *
 * @param positions - The receipt positions to sum.
 * @returns The gross total rounded to two decimals.
 */
export function computeTotalGross(positions: ReceiptPosition[]): number {
  return round2(positions.reduce((s, p) => s + p.lineGross, 0));
}

/** Rounds a euro amount to the nearest cent (banker-style not needed; HALF_UP is what fits cash). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
