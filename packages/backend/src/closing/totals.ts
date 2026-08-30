/** Pure aggregation for daily-closing (Z-Bon) totals. */

/** One order item, as it contributes to the closing aggregate. */
export interface ClosingItem {
  status: 'paid' | 'free' | 'cancelled' | 'open';
  /** VAT rate in percent (e.g. 19, 7, 0). */
  tax_rate: number;
  /** Per-unit gross price. */
  price: number;
  /** Per-unit gross deposit; null when absent. */
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
      const lineGross = item.price + (item.deposit_price ?? 0);

      if (item.status === 'cancelled' || item.status === 'free') {
        total_cancellations += lineGross;
        continue;
      }

      if (inv.receipt_type === 'sales_receipt') {
        total_gross += lineGross;
        if (item.tax_rate >= 18.5) total_tax_standard += lineGross;
        else if (item.tax_rate >= 6.5) total_tax_reduced += lineGross;
        else total_tax_zero += lineGross;
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
