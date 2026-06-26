/** Unit tests for the order-grouping helpers. */
import { describe, it, expect } from 'vitest';
import { makeGroupKey, pickItemsToCharge, type GroupableOrderItem } from './grouping.js';

const item = (overrides: Partial<GroupableOrderItem> = {}): GroupableOrderItem => ({
  id: 'i-1',
  article_id: 'a-bier',
  options: null,
  price: 5,
  deposit_price: null,
  created_at: '2026-06-24T12:00:00.000Z',
  ...overrides,
});

describe('makeGroupKey', () => {
  it('produces the same key for items with identical snapshot attributes', () => {
    const a = item();
    const b = item({ id: 'i-2', created_at: '2026-06-24T13:00:00.000Z' });
    expect(makeGroupKey(a)).toBe(makeGroupKey(b));
  });

  it('treats different options as different groups', () => {
    expect(makeGroupKey(item({ options: 'mit Ketchup' })))
      .not.toBe(makeGroupKey(item({ options: 'mit Mayo' })));
  });

  it('treats null and missing options as the same', () => {
    expect(makeGroupKey(item({ options: null })))
      .toBe(makeGroupKey({ ...item(), options: null }));
  });

  it('encodes deposit_price difference so pfand-versions are separate groups', () => {
    expect(makeGroupKey(item({ deposit_price: 2 })))
      .not.toBe(makeGroupKey(item({ deposit_price: null })));
  });

  it('coerces pg-decimal strings consistently with numeric counterparts', () => {
    expect(makeGroupKey(item({ price: '5' }))).toBe(makeGroupKey(item({ price: 5 })));
  });
});

describe('pickItemsToCharge', () => {
  const three = [
    item({ id: 'i-1', created_at: '2026-06-24T12:00:00.000Z' }),
    item({ id: 'i-2', created_at: '2026-06-24T12:01:00.000Z' }),
    item({ id: 'i-3', created_at: '2026-06-24T12:02:00.000Z' }),
  ];
  const groupKey = makeGroupKey(three[0]!);

  it('returns an empty list for empty inputs', () => {
    expect(pickItemsToCharge([], new Map())).toEqual([]);
  });

  it('picks oldest first within a group (FIFO by created_at)', () => {
    expect(pickItemsToCharge(three, new Map([[groupKey, 2]]))).toEqual(['i-1', 'i-2']);
  });

  it('caps the count at the group size', () => {
    expect(pickItemsToCharge(three, new Map([[groupKey, 99]]))).toEqual(['i-1', 'i-2', 'i-3']);
  });

  it('ignores quantities of zero or negative', () => {
    expect(pickItemsToCharge(three, new Map([[groupKey, 0]]))).toEqual([]);
    expect(pickItemsToCharge(three, new Map([[groupKey, -3]]))).toEqual([]);
  });

  it('skips unknown group keys silently', () => {
    expect(pickItemsToCharge(three, new Map([['unknown-key', 2]]))).toEqual([]);
  });

  it('handles multiple groups independently', () => {
    const mixed = [
      ...three,
      item({ id: 'p-1', article_id: 'a-pommes', created_at: '2026-06-24T12:03:00.000Z' }),
      item({ id: 'p-2', article_id: 'a-pommes', created_at: '2026-06-24T12:04:00.000Z' }),
    ];
    const pommesKey = makeGroupKey(mixed[3]!);
    const result = pickItemsToCharge(mixed, new Map([[groupKey, 1], [pommesKey, 2]]));
    expect(result).toContain('i-1');
    expect(result).toContain('p-1');
    expect(result).toContain('p-2');
    expect(result).toHaveLength(3);
  });

  it('handles Date instances for created_at (matches pg row format)', () => {
    const items = [
      item({ id: 'i-A', created_at: new Date('2026-06-24T13:00:00Z') }),
      item({ id: 'i-B', created_at: new Date('2026-06-24T12:00:00Z') }),
    ];
    expect(pickItemsToCharge(items, new Map([[groupKey, 1]]))).toEqual(['i-B']);
  });
});
