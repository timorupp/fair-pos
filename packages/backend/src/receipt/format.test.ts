/** Unit tests for the receipt formatting and aggregation helpers. */
import { describe, it, expect } from 'vitest';
import {
  formatEuro, formatEuroLabel, formatGermanDateTime, formatTaxRate,
  computeTaxBreakdown, computeTotalGross,
} from './format.js';
import type { ReceiptPosition } from './types.js';

describe('formatEuro', () => {
  it('formats whole euros with two decimals and German comma', () => {
    expect(formatEuro(12)).toBe('12,00');
    expect(formatEuro(0)).toBe('0,00');
  });

  it('formats fractional amounts to the cent', () => {
    expect(formatEuro(3.5)).toBe('3,50');
    expect(formatEuro(12.34)).toBe('12,34');
  });

  it('inserts a German thousands separator (dot)', () => {
    expect(formatEuro(1234.56)).toBe('1.234,56');
    expect(formatEuro(1_234_567.89)).toBe('1.234.567,89');
  });

  it('rounds clearly-below-half down', () => {
    expect(formatEuro(1.004)).toBe('1,00');
  });

  it('rounds clearly-above-half up', () => {
    expect(formatEuro(1.006)).toBe('1,01');
  });

  it('preserves the sign on negative amounts (Leergutrückgabe)', () => {
    expect(formatEuro(-2.5)).toBe('-2,50');
    expect(formatEuro(-1234.5)).toBe('-1.234,50');
  });
});

describe('formatEuroLabel', () => {
  it('appends the euro symbol', () => {
    expect(formatEuroLabel(7)).toBe('7,00 €');
  });
});

describe('formatGermanDateTime', () => {
  it('pads day, month, hour, minute, second to two digits', () => {
    expect(formatGermanDateTime(new Date(2026, 0, 3, 4, 5, 6))).toBe('03.01.2026 04:05:06');
  });
});

describe('formatTaxRate', () => {
  it('strips trailing zeros on whole rates', () => {
    expect(formatTaxRate(19)).toBe('19 %');
    expect(formatTaxRate(7)).toBe('7 %');
    expect(formatTaxRate(0)).toBe('0 %');
  });

  it('keeps two decimals for non-whole rates and uses the German comma', () => {
    expect(formatTaxRate(10.5)).toBe('10,50 %');
  });
});

/** Maps a plain test rate to its category — only the rates these tests actually use. */
function categoryFor(rate: number): ReceiptPosition['taxCategory'] {
  if (rate === 19) return 'standard';
  if (rate === 7) return 'reduced';
  return 'zero';
}

const p = (
  name: string, qty: number, unit: number, rate: number,
  deposit: number | null = null, depositRate: number | null = null,
): ReceiptPosition => ({
  name, quantity: qty, unitPrice: unit, unitDeposit: deposit, taxRate: rate, taxCategory: categoryFor(rate),
  depositTaxRate: deposit === null ? null : (depositRate ?? rate),
  lineGross: qty * (unit + (deposit ?? 0)),
});

describe('computeTaxBreakdown', () => {
  it('groups by tax rate and computes net + tax that reconcile to gross', () => {
    const rows = computeTaxBreakdown([
      p('Bier', 3, 5, 19),       // 15.00 @ 19%
      p('Brezel', 2, 2.5, 7),    // 5.00  @ 7%
      p('Pommes', 1, 4, 19),     // 4.00  @ 19%
    ]);

    expect(rows).toHaveLength(2);

    const r19 = rows.find((r) => r.rate === 19)!;
    expect(r19.gross).toBe(19);
    // 19 / 1.19 ≈ 15.9663… → 15.97
    expect(r19.net).toBe(15.97);
    expect(r19.tax).toBe(3.03);
    expect(r19.net + r19.tax).toBeCloseTo(r19.gross, 2);

    const r7 = rows.find((r) => r.rate === 7)!;
    expect(r7.gross).toBe(5);
    expect(r7.net).toBe(4.67);
    expect(r7.tax).toBe(0.33);
  });

  it('sorts rows by descending rate so the standard rate comes first', () => {
    const rows = computeTaxBreakdown([
      p('Mineralwasser', 1, 2, 7),
      p('Bier', 1, 5, 19),
      p('Spende', 1, 1, 0),
    ]);
    expect(rows.map((r) => r.rate)).toEqual([19, 7, 0]);
  });

  it('returns an empty array for an empty receipt', () => {
    expect(computeTaxBreakdown([])).toEqual([]);
  });

  it('handles negative line totals (Leergutrückgabe)', () => {
    const rows = computeTaxBreakdown([
      p('Bier', 2, 5, 19),                  // 10 @ 19%
      p('Pfandflasche zurück', 1, 0, 19, -2), // -2 @ 19%
    ]);
    const r19 = rows[0]!;
    expect(r19.gross).toBe(8);
  });

  it('buckets the deposit at its own rate, separately from the article (Task #113 — Pfand ist immer Regelsteuersatz, auch bei einem ermäßigt besteuerten Artikel)', () => {
    const rows = computeTaxBreakdown([
      p('Essen im Pfandglas', 1, 4, 7, 2, 19), // article @ 7%, deposit @ 19%
    ]);
    const r7 = rows.find((r) => r.rate === 7)!;
    const r19 = rows.find((r) => r.rate === 19)!;
    expect(r7.gross).toBe(4);
    expect(r19.gross).toBe(2);
  });
});

describe('computeTotalGross', () => {
  it('sums all line totals to the cent', () => {
    expect(computeTotalGross([p('A', 2, 1.5, 19), p('B', 1, 3, 7)])).toBe(6);
  });

  it('returns zero for an empty receipt', () => {
    expect(computeTotalGross([])).toBe(0);
  });
});
