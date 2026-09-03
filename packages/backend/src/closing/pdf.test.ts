/** End-to-end test for the Z-Bon PDF renderer (Task #105 — did not exist as a dedicated test file before). */
import { describe, it, expect } from 'vitest';
import { renderZBonPdf } from './pdf.js';
import type { ClosingContext } from './blocks.js';
import type { ClosingTotals } from './totals.js';

const ctx: ClosingContext = {
  company_name: 'Musterverein e.V.',
  register_name: 'Theke',
  system_serial: 'FairPOS-2026-ABCDEFGHIJ',
  z_number: 42,
  created_at: new Date(2026, 5, 24, 22, 30, 0),
  zero_counter: 5,
  vat_rate_standard: 19,
  vat_rate_reduced: 7,
};

const totals: ClosingTotals = {
  total_gross: 250.00,
  total_tax_standard: 200.00,
  total_tax_reduced: 50.00,
  total_tax_zero: 0,
  total_cash: 235.00,
  total_cancellations: 15.00,
  is_zero_closing: false,
};

describe('renderZBonPdf', () => {
  it('renders a valid PDF buffer', async () => {
    const pdf = await renderZBonPdf(ctx, totals, '2026-06-24', null);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('produces different PDFs for different Z-numbers', async () => {
    const a = await renderZBonPdf(ctx, totals, '2026-06-24', null);
    const b = await renderZBonPdf({ ...ctx, z_number: 99 }, totals, '2026-06-24', null);
    expect(a.equals(b)).toBe(false);
  });
});
