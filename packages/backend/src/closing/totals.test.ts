/** Unit tests for the Z-Bon totals aggregator. */
import { describe, it, expect } from 'vitest';
import { computeClosingTotals, type ClosingInvoice, type ClosingItem } from './totals.js';

const item = (overrides: Partial<ClosingItem> = {}): ClosingItem => ({
  status: 'paid', tax_category: 'standard', price: 5, deposit_price: null, ...overrides,
});

const invoice = (overrides: Partial<ClosingInvoice> = {}): ClosingInvoice => ({
  id: 'i', payment_method: 'cash', receipt_type: 'sales_receipt', items: [], ...overrides,
});

describe('computeClosingTotals', () => {
  it('returns a zero-closing for no invoices', () => {
    const t = computeClosingTotals([]);
    expect(t).toEqual({
      total_gross: 0, total_tax_standard: 0, total_tax_reduced: 0, total_tax_zero: 0,
      total_cash: 0, total_cancellations: 0, is_zero_closing: true,
    });
  });

  it('sums gross prices across paid items', () => {
    const t = computeClosingTotals([invoice({
      items: [item({ price: 5 }), item({ price: 3 })],
    })]);
    expect(t.total_gross).toBe(8);
  });

  it('buckets gross by tax category (standard/reduced/zero)', () => {
    const t = computeClosingTotals([invoice({
      items: [
        item({ price: 10, tax_category: 'standard' }),
        item({ price: 4,  tax_category: 'reduced' }),
        item({ price: 2,  tax_category: 'zero' }),
      ],
    })]);
    expect(t.total_tax_standard).toBe(10);
    expect(t.total_tax_reduced).toBe(4);
    expect(t.total_tax_zero).toBe(2);
    expect(t.total_gross).toBe(t.total_tax_standard + t.total_tax_reduced + t.total_tax_zero);
  });

  it('includes the deposit in the per-item gross', () => {
    const t = computeClosingTotals([invoice({
      items: [item({ price: 5, deposit_price: 2 })],
    })]);
    expect(t.total_gross).toBe(7);
  });

  it('handles negative deposits (Leergutrückgabe) — gross decreases', () => {
    const t = computeClosingTotals([invoice({
      items: [item({ price: 0, deposit_price: -1 })],
    })]);
    expect(t.total_gross).toBe(-1);
  });

  it('buckets a deposit into total_tax_standard even when the article itself is reduced (Task #113 — Pfand unterliegt immer dem Regelsteuersatz)', () => {
    const t = computeClosingTotals([invoice({
      items: [item({ price: 4, tax_category: 'reduced', deposit_price: 2 })],
    })]);
    expect(t.total_tax_reduced).toBe(4);
    expect(t.total_tax_standard).toBe(2);
    expect(t.total_gross).toBe(6);
  });

  it('buckets a deposit into total_tax_standard even when the article itself is zero-rated', () => {
    const t = computeClosingTotals([invoice({
      items: [item({ price: 0, tax_category: 'zero', deposit_price: 2 })],
    })]);
    expect(t.total_tax_zero).toBe(0);
    expect(t.total_tax_standard).toBe(2);
  });

  it('excludes cancelled and free items from total_gross, adds them to total_cancellations', () => {
    const t = computeClosingTotals([invoice({
      items: [
        item({ price: 5, status: 'paid' }),
        item({ price: 3, status: 'cancelled' }),
        item({ price: 2, status: 'free' }),
      ],
    })]);
    expect(t.total_gross).toBe(5);
    expect(t.total_cancellations).toBe(5);
  });

  it('counts cash receipts toward total_cash', () => {
    const t = computeClosingTotals([
      invoice({ payment_method: 'cash', items: [item({ price: 10 })] }),
      invoice({ payment_method: 'card', items: [item({ price: 5 })] }),
    ]);
    expect(t.total_cash).toBe(10);
  });

  it('subtracts cancellation-invoice grosses from total_cash', () => {
    const t = computeClosingTotals([
      invoice({ id: 'a', payment_method: 'cash', receipt_type: 'sales_receipt',  items: [item({ price: 10 })] }),
      invoice({ id: 'b', payment_method: 'cash', receipt_type: 'cancellation',   items: [item({ price: 3 })] }),
    ]);
    expect(t.total_cash).toBe(7);
  });

  it('does not include cancellation-invoice items in total_gross', () => {
    const t = computeClosingTotals([
      invoice({ id: 'a', receipt_type: 'sales_receipt', items: [item({ price: 10 })] }),
      invoice({ id: 'b', receipt_type: 'cancellation',  items: [item({ price: 3 })] }),
    ]);
    expect(t.total_gross).toBe(10);
  });

  it('flags is_zero_closing only when every total is exactly zero', () => {
    expect(computeClosingTotals([invoice({ items: [item({ price: 0, deposit_price: null })] })])
      .is_zero_closing).toBe(true);
    expect(computeClosingTotals([invoice({ items: [item({ price: 1 })] })]).is_zero_closing).toBe(false);
    expect(computeClosingTotals([invoice({ items: [item({ price: 0, status: 'cancelled' })] })])
      .is_zero_closing).toBe(true); // both totals zero
  });

  it('rounds aggregated totals to the cent', () => {
    // 3 × 0.10 = 0.30, but in IEEE 754 the unrounded sum drifts → check we round.
    const t = computeClosingTotals([invoice({
      items: [item({ price: 0.1 }), item({ price: 0.1 }), item({ price: 0.1 })],
    })]);
    expect(t.total_gross).toBe(0.3);
  });
});
