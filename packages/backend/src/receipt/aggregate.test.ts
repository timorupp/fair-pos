/** Unit tests for the order-item → receipt-position aggregator. */
import { describe, it, expect } from 'vitest';
import { aggregatePositions, type RawOrderItem } from './aggregate.js';

const item = (overrides: Partial<RawOrderItem> = {}): RawOrderItem => ({
  article_name: 'Bier',
  tax_rate: 19,
  tax_category: 'standard',
  price: 5,
  deposit_price: null,
  deposit_tax_rate: null,
  options: null,
  ...overrides,
});

describe('aggregatePositions', () => {
  it('returns an empty array for no items', () => {
    expect(aggregatePositions([])).toEqual([]);
  });

  it('combines three identical items into one line with quantity 3', () => {
    const rows = [item(), item(), item()];
    const positions = aggregatePositions(rows);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.quantity).toBe(3);
    expect(positions[0]!.lineGross).toBe(15);
  });

  it('keeps items with different options on separate lines', () => {
    const positions = aggregatePositions([
      item({ article_name: 'Pommes', options: 'mit Ketchup' }),
      item({ article_name: 'Pommes', options: 'mit Mayo' }),
    ]);
    expect(positions).toHaveLength(2);
    expect(positions[0]!.name).toBe('Pommes (mit Ketchup)');
    expect(positions[1]!.name).toBe('Pommes (mit Mayo)');
  });

  it('keeps items with different prices on separate lines', () => {
    const positions = aggregatePositions([
      item({ price: 5 }),
      item({ price: 6 }),
    ]);
    expect(positions).toHaveLength(2);
  });

  it('coerces decimal string values returned by pg into numbers', () => {
    const positions = aggregatePositions([
      item({ price: '4.50', tax_rate: '19.00', deposit_price: '2.00' }),
    ]);
    expect(positions[0]!.unitPrice).toBe(4.5);
    expect(positions[0]!.unitDeposit).toBe(2);
    expect(positions[0]!.taxRate).toBe(19);
    expect(positions[0]!.lineGross).toBe(6.5);
  });

  it('includes deposit in the per-unit line total', () => {
    const positions = aggregatePositions([
      item({ price: 4.5, deposit_price: 2 }),
      item({ price: 4.5, deposit_price: 2 }),
    ]);
    expect(positions[0]!.quantity).toBe(2);
    expect(positions[0]!.lineGross).toBe(13);
  });

  it('handles negative deposits (Leergutrückgabe) correctly', () => {
    const positions = aggregatePositions([
      item({ article_name: 'Flasche zurück', price: 0, deposit_price: -1 }),
    ]);
    expect(positions[0]!.unitDeposit).toBe(-1);
    expect(positions[0]!.lineGross).toBe(-1);
  });

  it('treats null and empty-string options as the same group', () => {
    const positions = aggregatePositions([
      item({ options: null }),
      item({ options: null }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.quantity).toBe(2);
  });
});
