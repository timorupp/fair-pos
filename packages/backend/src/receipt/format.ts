/** Pure formatting and aggregation helpers for receipts. No I/O, no globals — fully unit-testable. */

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
 * Aggregates a list of positions into one row per VAT rate.
 *
 * - `gross` is summed across positions of the same rate.
 * - `net` is computed via `gross / (1 + rate/100)` and rounded to the cent.
 * - `tax` is `gross - net` so the rows always reconcile back to the gross total.
 *
 * @param positions - The receipt positions to aggregate.
 * @returns One row per distinct rate, sorted descending by rate (standard first).
 */
export function computeTaxBreakdown(positions: ReceiptPosition[]): TaxBreakdownRow[] {
  const byRate = new Map<number, number>();
  for (const p of positions) {
    byRate.set(p.taxRate, (byRate.get(p.taxRate) ?? 0) + p.lineGross);
  }

  const rows: TaxBreakdownRow[] = [];
  for (const [rate, gross] of byRate.entries()) {
    const roundedGross = round2(gross);
    const net = round2(roundedGross / (1 + rate / 100));
    rows.push({ rate, gross: roundedGross, net, tax: round2(roundedGross - net) });
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
