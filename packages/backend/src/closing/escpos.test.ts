/** Tests for the Z-Bon ESC/POS renderer. See `print/escpos-encoding.test.ts` for `twoColumn`. */
import { describe, it, expect } from 'vitest';
import { buildZBonEscPos, type ClosingContext } from './escpos.js';
import type { ClosingTotals } from './totals.js';

const ctx: ClosingContext = {
  company_name: 'Musterverein e.V.',
  register_name: 'Theke',
  system_serial: 'FairPOS-2026-ABCDEFGHIJ',
  z_number: 42,
  created_at: new Date(2026, 5, 24, 22, 30, 0),
  zero_counter: 5,
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

const businessDate = '2026-06-24';

describe('buildZBonEscPos', () => {
  it('starts with ESC @ and ends with GS V 0 (cut)', () => {
    const buf = buildZBonEscPos(ctx, totals, businessDate);
    expect(buf[0]).toBe(0x1b); expect(buf[1]).toBe(0x40);
    const tail = buf.subarray(buf.length - 3);
    expect(tail[0]).toBe(0x1d); expect(tail[1]).toBe(0x56); expect(tail[2]).toBe(0x00);
  });

  it('contains Z-Bon header and identifying numbers', () => {
    const ascii = buildZBonEscPos(ctx, totals, businessDate).toString('ascii');
    expect(ascii).toContain('Z-BON');
    expect(ascii).toContain('Z-Nr.: 42');
    expect(ascii).toContain('Nullstellungen: 5');
    expect(ascii).toContain('Theke');
  });

  it('prints the creation timestamp and the business date, both in German format', () => {
    const buf = buildZBonEscPos(ctx, totals, businessDate);
    expect(buf.toString('ascii')).toContain('24.06.2026 22:30:00');
    // "Geschäftstag" contains ä (CP858, not ASCII) — match around it instead of via toString('ascii').
    expect(buf.includes(Buffer.from('Gesch', 'ascii'))).toBe(true);
    expect(buf.includes(Buffer.from('ftstag: 24.06.2026', 'ascii'))).toBe(true);
  });

  it('includes all three VAT-rate buckets and the gross total', () => {
    const ascii = buildZBonEscPos(ctx, totals, businessDate).toString('ascii');
    expect(ascii).toContain('19 %');
    expect(ascii).toContain('7 %');
    expect(ascii).toContain('0 %');
    expect(ascii).toContain('Gesamt');
    expect(ascii).toContain('250,00 EUR');
    expect(ascii).toContain('200,00 EUR');
    expect(ascii).toContain('50,00 EUR');
  });

  it('shows the cash total under "Zahlungsarten"', () => {
    const ascii = buildZBonEscPos(ctx, totals, businessDate).toString('ascii');
    expect(ascii).toContain('Zahlungsarten');
    expect(ascii).toContain('Bar');
    expect(ascii).toContain('235,00 EUR');
  });

  it('shows cancellation total under "Stornos"', () => {
    const ascii = buildZBonEscPos(ctx, totals, businessDate).toString('ascii');
    expect(ascii).toContain('Stornos');
    expect(ascii).toContain('15,00 EUR');
  });

  it('flags a zero closing in the header', () => {
    const zeroTotals: ClosingTotals = {
      total_gross: 0, total_tax_standard: 0, total_tax_reduced: 0, total_tax_zero: 0,
      total_cash: 0, total_cancellations: 0, is_zero_closing: true,
    };
    const ascii = buildZBonEscPos(ctx, zeroTotals, businessDate).toString('ascii');
    expect(ascii).toContain('Nullabschluss');
  });

  it('encodes umlauts in inputs as CP858 bytes (no transliteration)', () => {
    const buf = buildZBonEscPos(
      { ...ctx, company_name: 'Käse Müllers Großverein', register_name: 'Foyer-Süd' },
      totals, businessDate,
    );
    // "Käse Müllers Großverein" in CP858: K(0x4b) ä(0x84) s(0x73) e(0x65) ...
    // Match a distinctive substring so the test is robust against changes.
    expect(buf.includes(Buffer.from([0x4b, 0x84, 0x73, 0x65]))).toBe(true);   // "Käse"
    expect(buf.includes(Buffer.from([0x4d, 0x81, 0x6c]))).toBe(true);          // "Mül"
    expect(buf.includes(Buffer.from([0x47, 0x72, 0x6f, 0xe1]))).toBe(true);    // "Groß"
    expect(buf.includes(Buffer.from([0x53, 0x81, 0x64]))).toBe(true);          // "Süd"
  });

  it('emits the CP858 code-page selector at the top of the stream', () => {
    const buf = buildZBonEscPos(ctx, totals, businessDate);
    // ESC @ + ESC t 19 — printer reset followed by CP858 select.
    expect(buf.subarray(0, 5).equals(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x13]))).toBe(true);
  });
});
