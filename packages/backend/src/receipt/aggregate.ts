/** Aggregates flat `order_item` rows (one per unit) into grouped `ReceiptPosition`s with a quantity. */

import type { TaxCategory } from '@fairpos/shared';
import type { ReceiptPosition } from './types.js';

/** Subset of the `order_item` columns needed to aggregate into receipt positions. */
export interface RawOrderItem {
  article_name: string;
  tax_rate: number | string;        // DECIMAL — pg returns string in some configs
  tax_category: TaxCategory;
  price: number | string;
  deposit_price: number | string | null;
  /** VAT rate the deposit portion was taxed at (Task #113) — `null` unless `deposit_price` is set. */
  deposit_tax_rate: number | string | null;
  options: string | null;
}

/**
 * Groups raw order items by their snapshot attributes (name + options + price
 * + deposit + rate) and sums up identical units into a single line with a
 * `quantity` field — the canonical aggregation used by both the PDF and ESC/POS
 * renderers.
 *
 * @param items - One row per ordered unit, as returned by the DB join in `data.ts`.
 * @returns Aggregated receipt positions in first-occurrence order.
 */
export function aggregatePositions(items: RawOrderItem[]): ReceiptPosition[] {
  const groups = new Map<string, { item: RawOrderItem; count: number }>();

  for (const item of items) {
    const key = JSON.stringify([
      item.article_name,
      item.options ?? '',
      String(item.price),
      String(item.deposit_price ?? ''),
      String(item.tax_rate),
      item.tax_category,
      String(item.deposit_tax_rate ?? ''),
    ]);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { item, count: 1 });
  }

  return [...groups.values()].map(({ item, count }) => toPosition(item, count));
}

/** Converts a grouped raw order item plus its count into a final `ReceiptPosition`. */
function toPosition(item: RawOrderItem, count: number): ReceiptPosition {
  const unitPrice = num(item.price);
  const unitDeposit = item.deposit_price === null ? null : num(item.deposit_price);
  return {
    name: item.options ? `${item.article_name} (${item.options})` : item.article_name,
    quantity: count,
    unitPrice,
    unitDeposit,
    taxRate: num(item.tax_rate),
    taxCategory: item.tax_category,
    depositTaxRate: item.deposit_tax_rate === null ? null : num(item.deposit_tax_rate),
    lineGross: round2(count * (unitPrice + (unitDeposit ?? 0))),
  };
}

/** Coerces a pg DECIMAL (which may arrive as string) to number. */
function num(v: number | string): number {
  return typeof v === 'string' ? Number(v) : v;
}

/** Rounds to the cent — mirrors the helper in format.ts (kept local to avoid circular deps). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
