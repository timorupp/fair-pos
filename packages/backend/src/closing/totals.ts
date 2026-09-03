/** Pure aggregation for daily-closing (Z-Bon) totals. */

import type { TaxCategory } from '@fairpos/shared';

/** One order item, as it contributes to the closing aggregate. */
export interface ClosingItem {
  status: 'paid' | 'free' | 'cancelled' | 'open';
  /** VAT category of the article itself (Task #110) — does NOT apply to `deposit_price`, see below. */
  tax_category: TaxCategory;
  /** Per-unit gross price (article only, excludes deposit). */
  price: number;
  /** Per-unit gross deposit; null when absent. Always taxed at `standard` regardless of `tax_category` (Task #113 — Pfand unterliegt immer dem Regelsteuersatz). */
  deposit_price: number | null;
}

/** One invoice that belongs to the closing window — needed to split cash vs. card receipts. */
export interface ClosingInvoice {
  id: string;
  payment_method: 'cash' | 'card';
  receipt_type: 'sales_receipt' | 'cancellation' | 'training';
  /** All order items linked to this invoice. */
  items: ClosingItem[];
}

/** Aggregated closing totals computed from the invoices in scope. */
export interface ClosingTotals {
  /** Total gross over all `sales_receipt` items not in a `cancelled`/`free` status. */
  total_gross: number;
  /** Gross sum of items taxed at the standard rate (19 %). */
  total_tax_standard: number;
  /** Gross sum of items taxed at the reduced rate (7 %). */
  total_tax_reduced: number;
  /** Gross sum of items taxed at the zero rate (0 %). */
  total_tax_zero: number;
  /** Gross sum of all cash receipts (after refund offsets). */
  total_cash: number;
  /** Gross sum of items in `cancelled` or `free` status (informational, not in `total_gross`). */
  total_cancellations: number;
  /** True when no movement occurred in the closing window (Nullabschluss). */
  is_zero_closing: boolean;
}

/**
 * Computes the aggregated totals for one daily closing.
 *
 * Rules:
 *  - Only `sales_receipt` invoices contribute to `total_gross` and the per-rate buckets.
 *  - Cancellation invoices (`receipt_type='cancellation'`) reduce `total_cash` but show up
 *    in `total_cancellations` instead of in the gross buckets.
 *  - Items in `cancelled` / `free` status never count toward `total_gross` — they are
 *    reported separately in `total_cancellations`.
 *  - `total_gross` is always equal to the sum of the three rate buckets (cent-precise).
 *  - `is_zero_closing` is true iff every total is exactly zero.
 *
 * @param invoices - Invoices in the closing window with their order items pre-joined.
 * @returns The aggregated totals plus the `is_zero_closing` flag.
 */
export function computeClosingTotals(invoices: ClosingInvoice[]): ClosingTotals {
  let total_gross = 0;
  let total_tax_standard = 0;
  let total_tax_reduced = 0;
  let total_tax_zero = 0;
  let total_cash = 0;
  let total_cancellations = 0;

  for (const inv of invoices) {
    let invoiceGross = 0;
    for (const item of inv.items) {
      const depositGross = item.deposit_price ?? 0;
      const lineGross = item.price + depositGross;

      if (item.status === 'cancelled' || item.status === 'free') {
        total_cancellations += lineGross;
        continue;
      }

      if (inv.receipt_type === 'sales_receipt') {
        total_gross += lineGross;
        // Article and deposit are bucketed separately — the deposit always
        // counts toward `total_tax_standard` (Task #113), independent of
        // the article's own category.
        if (item.tax_category === 'standard') total_tax_standard += item.price;
        else if (item.tax_category === 'reduced') total_tax_reduced += item.price;
        else total_tax_zero += item.price;
        total_tax_standard += depositGross;
      }
      invoiceGross += lineGross;
    }
    if (inv.payment_method === 'cash') {
      // Cancellation invoices carry negative grosses → naturally reduce the cash bucket.
      total_cash += inv.receipt_type === 'cancellation' ? -invoiceGross : invoiceGross;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  total_gross         = round(total_gross);
  total_tax_standard  = round(total_tax_standard);
  total_tax_reduced   = round(total_tax_reduced);
  total_tax_zero      = round(total_tax_zero);
  total_cash          = round(total_cash);
  total_cancellations = round(total_cancellations);

  const is_zero_closing =
    total_gross === 0 && total_cash === 0 && total_cancellations === 0;

  return {
    total_gross, total_tax_standard, total_tax_reduced, total_tax_zero,
    total_cash, total_cancellations, is_zero_closing,
  };
}
