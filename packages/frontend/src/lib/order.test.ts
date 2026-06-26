/** Unit tests for the Bonkasse order helpers. */
import { describe, it, expect } from 'vitest';
import { adjustQuantity, setQuantity, computeOrderTotal, num, type ArticleLike } from './order';

const a = (id: string, price: number, deposit: number | null = null): ArticleLike => ({
  id, name: `Art ${id}`, price, deposit_price: deposit,
});

describe('num', () => {
  it('passes numbers through', () => { expect(num(3.14)).toBe(3.14); });
  it('parses decimal strings from pg', () => { expect(num('4.50')).toBe(4.5); });
  it('returns 0 for null', () => { expect(num(null)).toBe(0); });
  it('returns 0 for undefined', () => { expect(num(undefined)).toBe(0); });
});

describe('adjustQuantity', () => {
  it('adds a new line when the article is not in the order yet', () => {
    expect(adjustQuantity([], 'x', 1)).toEqual([{ article_id: 'x', quantity: 1 }]);
  });

  it('increments the quantity of an existing line', () => {
    const next = adjustQuantity([{ article_id: 'x', quantity: 2 }], 'x', 1);
    expect(next).toEqual([{ article_id: 'x', quantity: 3 }]);
  });

  it('removes the line when the resulting quantity reaches zero', () => {
    expect(adjustQuantity([{ article_id: 'x', quantity: 1 }], 'x', -1)).toEqual([]);
  });

  it('removes the line when the resulting quantity goes negative', () => {
    expect(adjustQuantity([{ article_id: 'x', quantity: 1 }], 'x', -5)).toEqual([]);
  });

  it('ignores a delta of 0 or less when adding a new article', () => {
    expect(adjustQuantity([], 'x', 0)).toEqual([]);
    expect(adjustQuantity([], 'x', -1)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const lines = [{ article_id: 'x', quantity: 2 }];
    adjustQuantity(lines, 'x', 1);
    expect(lines).toEqual([{ article_id: 'x', quantity: 2 }]);
  });

  it('preserves the order of unrelated lines', () => {
    const next = adjustQuantity(
      [{ article_id: 'a', quantity: 1 }, { article_id: 'b', quantity: 1 }, { article_id: 'c', quantity: 1 }],
      'b',
      2,
    );
    expect(next.map((l) => l.article_id)).toEqual(['a', 'b', 'c']);
    expect(next[1]!.quantity).toBe(3);
  });
});

describe('setQuantity', () => {
  it('sets the quantity for a new article', () => {
    expect(setQuantity([], 'x', 5)).toEqual([{ article_id: 'x', quantity: 5 }]);
  });

  it('overwrites the quantity of an existing line', () => {
    expect(setQuantity([{ article_id: 'x', quantity: 2 }], 'x', 7)).toEqual([{ article_id: 'x', quantity: 7 }]);
  });

  it('removes the line when setting quantity to zero', () => {
    expect(setQuantity([{ article_id: 'x', quantity: 2 }], 'x', 0)).toEqual([]);
  });
});

describe('computeOrderTotal', () => {
  it('returns 0 for an empty order', () => {
    expect(computeOrderTotal([], [a('x', 5)])).toBe(0);
  });

  it('multiplies price by quantity', () => {
    expect(computeOrderTotal([{ article_id: 'x', quantity: 3 }], [a('x', 4)])).toBe(12);
  });

  it('includes the deposit in the per-unit price', () => {
    expect(computeOrderTotal([{ article_id: 'x', quantity: 2 }], [a('x', 4.5, 2)])).toBe(13);
  });

  it('handles negative deposits (Leergutrückgabe)', () => {
    expect(computeOrderTotal([{ article_id: 'x', quantity: 1 }], [a('x', 0, -1)])).toBe(-1);
  });

  it('sums multiple lines correctly', () => {
    expect(computeOrderTotal(
      [{ article_id: 'a', quantity: 2 }, { article_id: 'b', quantity: 1 }],
      [a('a', 1.5), a('b', 3)],
    )).toBe(6);
  });

  it('ignores lines whose article is not in the catalog', () => {
    expect(computeOrderTotal(
      [{ article_id: 'unknown', quantity: 5 }],
      [a('x', 1)],
    )).toBe(0);
  });

  it('rounds to the cent', () => {
    // 3 × 0.10 = 0.30 in real math but 0.30000…04 in IEEE 754 — verify rounding.
    expect(computeOrderTotal([{ article_id: 'x', quantity: 3 }], [a('x', 0.1)])).toBe(0.3);
  });
});
