/** Pure aggregation for daily-closing (Z-Bon) totals. */

import type { TaxCategory } from '@fairpos/shared';

/**
 * One order item, as it contributes to the closing aggregate.
 *
 * `price`/`deposit_price` carry their own sign (D-068, 2026-09-12) — a
 * Bonstorno's rows are stored with a **negative** price/deposit at creation
 * time (`routes/admin/cancellations.ts`), so a plain sum here already nets
 * out correctly with no `receipt_type` branching. **Never** use the sign to
 * detect whether a row is a Bonstorno — a legitimate `PfandRueckzahlung`
 * (deposit-return) article already has a negative `deposit_price`
 * independent of any cancellation, so a negative amount alone proves
 * nothing. Classification is always via `status` (this file) or
 * `invoice.receipt_type` (below), never via sign.
 */
export interface ClosingItem {
  status: 'paid' | 'free' | 'cancelled' | 'open';
  /** VAT category of the article itself (Task #110) — does NOT apply to `deposit_price`, see below. */
  tax_category: TaxCategory;
  /** Per-unit gross price (article only, excludes deposit). Signed — see the type doc comment above. */
  price: number;
  /** Per-unit gross deposit; null when absent. Always taxed at `standard` regardless of `tax_category` (Task #113 — Pfand unterliegt immer dem Regelsteuersatz). Signed — see the type doc comment above. */
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
  /**
   * Total gross over all non-`free`/`cancelled` items of every non-`training`
   * invoice — includes Bonstorno rows (`receipt_type='cancellation'`), which
   * reduce this total via their own negative sign rather than being excluded
   * from it (D-068). Matches the DSFinV-K spec's own model: a Bonstorno is
   * just a normal `GV_TYP=Umsatz` line with reversed sign, "im Umsatz
   * saldiert dargestellt" (Anhang C) — there is no separate bucket for it at
   * the Kassenabschluss level.
   */
  total_gross: number;
  /** Gross sum of items taxed at the standard rate (19 %). */
  total_tax_standard: number;
  /** Gross sum of items taxed at the reduced rate (7 %). */
  total_tax_reduced: number;
  /** Gross sum of items taxed at the zero rate (0 %). */
  total_tax_zero: number;
  /** Gross sum of all cash receipts (Bonstorno's negative sign reduces this naturally). */
  total_cash: number;
  /**
   * Informational: how much of `total_gross`/`total_cash` came from Bonstorno
   * (`receipt_type='cancellation'`) invoices — "Stornierte Rechnungen", real
   * money paid back. Already included in `total_gross`/`total_cash`, not a
   * separate additive bucket (D-068).
   */
  total_bonstorno: number;
  /** "Kostenfreie Warenabgabe" — gross sum of items given away free (`status='free'`), never charged. Not part of `total_gross`. */
  total_free: number;
  /** "Stornierte Bestellungen" — gross sum of items whose order was cancelled before checkout (`status='cancelled'`), goods never left, never charged. Not part of `total_gross`. */
  total_order_cancellations: number;
  /** True when no movement occurred in the closing window (Nullabschluss). */
  is_zero_closing: boolean;
}

/**
 * Computes the aggregated totals for one daily closing.
 *
 * Rules (revised 2026-09-12, D-068 — see the `ClosingItem`/`ClosingTotals`
 * doc comments for the full reasoning):
 *  - `receipt_type='training'` invoices are excluded entirely (Task #130 —
 *    no effect on the Kassenabschluss; not yet actually produced by any
 *    code path, but the exclusion is kept in place for when it is).
 *  - Items in `free`/`cancelled` status never count toward `total_gross` —
 *    they go to `total_free`/`total_order_cancellations` instead, using
 *    their own (always non-negative in practice) stored price.
 *  - Every other item (`status='paid'`) counts toward `total_gross` and the
 *    per-rate buckets using its **stored, already-signed** price — a
 *    Bonstorno's negative rows net out automatically, no `receipt_type`
 *    check needed here.
 *  - `total_bonstorno` separately reports the `receipt_type='cancellation'`
 *    share of `total_gross`/`total_cash`, purely for display — it does not
 *    change any other total.
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
  let total_bonstorno = 0;
  let total_free = 0;
  let total_order_cancellations = 0;

  for (const inv of invoices) {
    // AVTraining has no effect on the Kassenabschluss (Task #130) — no code
    // path sets this yet, but the exclusion stays ready for when one does.
    if (inv.receipt_type === 'training') continue;

    let invoiceGross = 0;
    for (const item of inv.items) {
      const depositGross = item.deposit_price ?? 0;
      const lineGross = item.price + depositGross;

      if (item.status === 'free') {
        total_free += lineGross;
        continue;
      }
      if (item.status === 'cancelled') {
        total_order_cancellations += lineGross;
        continue;
      }

      // status === 'paid' here — a `sales_receipt` sale or a Bonstorno
      // reversal, distinguished only by the sign already baked into `price`/
      // `deposit_price` (D-068). `status === 'open'` items should never
      // reach a closing at all (routes/admin/closings.ts only selects
      // already-invoiced rows).
      total_gross += lineGross;
      // Article and deposit are bucketed separately — the deposit always
      // counts toward `total_tax_standard` (Task #113), independent of
      // the article's own category.
      if (item.tax_category === 'standard') total_tax_standard += item.price;
      else if (item.tax_category === 'reduced') total_tax_reduced += item.price;
      else total_tax_zero += item.price;
      total_tax_standard += depositGross;
      invoiceGross += lineGross;
    }

    if (inv.receipt_type === 'cancellation') total_bonstorno += invoiceGross;
    if (inv.payment_method === 'cash') total_cash += invoiceGross;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  total_gross               = round(total_gross);
  total_tax_standard        = round(total_tax_standard);
  total_tax_reduced         = round(total_tax_reduced);
  total_tax_zero            = round(total_tax_zero);
  total_cash                = round(total_cash);
  total_bonstorno           = round(total_bonstorno);
  total_free                = round(total_free);
  total_order_cancellations = round(total_order_cancellations);

  const is_zero_closing =
    total_gross === 0 && total_cash === 0 && total_free === 0 && total_order_cancellations === 0;

  return {
    total_gross, total_tax_standard, total_tax_reduced, total_tax_zero,
    total_cash, total_bonstorno, total_free, total_order_cancellations,
    is_zero_closing,
  };
}
