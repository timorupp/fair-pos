/** Unit tests for the Excel-export row aggregator. */
import { describe, it, expect } from 'vitest';
import { buildExportRows, type ExportSourceRow } from './rows.js';

const row = (overrides: Partial<ExportSourceRow> = {}): ExportSourceRow => ({
  invoice_id: 'inv-1',
  receipt_number: 42,
  invoice_created_at: new Date(2026, 5, 24, 12, 0, 0),
  table_name: 'A1',
  ordering_user_name: 'Anna',
  register_name: 'Theke',
  article_name: 'Bier',
  options: null,
  price: 5,
  deposit_price: null,
  tax_rate: 19,
  ...overrides,
});

describe('buildExportRows', () => {
  it('returns an empty list for no input', () => {
    expect(buildExportRows([])).toEqual([]);
  });

  it('aggregates three identical units within the same invoice into one row with quantity 3', () => {
    const out = buildExportRows([row(), row(), row()]);
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(3);
    expect(out[0]!.line_total).toBe(15);
  });

  it('keeps the same article on separate invoices as separate rows', () => {
    const out = buildExportRows([
      row({ invoice_id: 'a', receipt_number: 1 }),
      row({ invoice_id: 'b', receipt_number: 2 }),
    ], 'POS-');
    expect(out).toHaveLength(2);
    // Receipt number renders prefix + zero-padded sequence, matching the bon.
    expect(out.map((r) => r.receipt_number)).toEqual(['POS-00001', 'POS-00002']);
  });

  it('uses an empty prefix when none is configured', () => {
    const out = buildExportRows([row({ receipt_number: 7 })]);
    expect(out[0]!.receipt_number).toBe('00007');
  });

  it('separates rows differing in options (Pommes mit Ketchup vs. Pommes mit Mayo)', () => {
    const out = buildExportRows([
      row({ article_name: 'Pommes', options: 'mit Ketchup' }),
      row({ article_name: 'Pommes', options: 'mit Mayo' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.article_name).toBe('Pommes (mit Ketchup)');
    expect(out[1]!.article_name).toBe('Pommes (mit Mayo)');
  });

  it('separates rows differing in price (same article, different rate)', () => {
    const out = buildExportRows([
      row({ price: 5 }),
      row({ price: 6 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('sums deposit into the line total per unit', () => {
    const out = buildExportRows([
      row({ price: 4.5, deposit_price: 2 }),
      row({ price: 4.5, deposit_price: 2 }),
    ]);
    expect(out[0]!.quantity).toBe(2);
    expect(out[0]!.unit_deposit).toBe(2);
    expect(out[0]!.line_total).toBe(13);
  });

  it('handles negative deposits (Leergutrückgabe) cent-precisely', () => {
    const out = buildExportRows([
      row({ article_name: 'Flasche zurück', price: 0, deposit_price: -1 }),
    ]);
    expect(out[0]!.unit_deposit).toBe(-1);
    expect(out[0]!.line_total).toBe(-1);
  });

  it('coerces pg-decimal-strings to numbers', () => {
    const out = buildExportRows([
      row({ price: '4.50', tax_rate: '19.00', deposit_price: '2.00' }),
    ]);
    expect(out[0]!.unit_price).toBe(4.5);
    expect(out[0]!.tax_rate).toBe(19);
    expect(out[0]!.unit_deposit).toBe(2);
  });

  it('uses empty strings for missing table and user', () => {
    const out = buildExportRows([row({ table_name: null, ordering_user_name: null })]);
    expect(out[0]!.table_name).toBe('');
    expect(out[0]!.ordering_user_name).toBe('');
  });

  it('keeps the position order stable: invoice order outer, first-occurrence inner', () => {
    const out = buildExportRows([
      row({ invoice_id: 'i1', article_name: 'Pommes' }),
      row({ invoice_id: 'i1', article_name: 'Bier' }),
      row({ invoice_id: 'i1', article_name: 'Pommes' }),
      row({ invoice_id: 'i2', article_name: 'Pommes' }),
    ]);
    expect(out.map((r) => `${r.receipt_number}:${r.article_name}:${r.quantity}`)).toEqual([
      '00042:Pommes:2',
      '00042:Bier:1',
      '00042:Pommes:1',
    ]);
  });
});
