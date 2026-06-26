/** Pure helpers for grouping order items and choosing which units to charge. */

/** Subset of `order_item` columns relevant to grouping. */
export interface GroupableOrderItem {
  id: string;
  article_id: string | null;
  options: string | null;
  price: number | string;
  deposit_price: number | string | null;
  created_at: string | Date;
}

/**
 * Builds the canonical group key used to identify "same kind of position".
 *
 * Two order items belong to the same group iff their
 * `(article_id, options, price, deposit_price)` tuple matches exactly.
 * Order-item snapshots are immutable, so the key is stable for the lifetime
 * of the row.
 *
 * @param item - An order-item row carrying at least the four group fields.
 * @returns A stable string key suitable for `Map` lookups.
 */
export function makeGroupKey(item: GroupableOrderItem): string {
  return [
    item.article_id ?? '',
    item.options ?? '',
    String(item.price),
    item.deposit_price === null || item.deposit_price === undefined ? '' : String(item.deposit_price),
  ].join('|');
}

/**
 * Picks specific order-item IDs to be transitioned (e.g. paid or cancelled)
 * based on per-group quantities. Within each group, items are consumed in
 * FIFO order (oldest `created_at` first), so the operator sees a "natural"
 * sequencing of the table.
 *
 * Unknown group keys are ignored; over-quantities are capped at the available count.
 *
 * @param items - Open order items at the table (all groups mixed).
 * @param quantitiesByGroup - How many units of each group to charge, keyed by `makeGroupKey`.
 * @returns Concrete `order_item.id`s to be updated, in pick order.
 */
export function pickItemsToCharge<T extends GroupableOrderItem>(
  items: T[],
  quantitiesByGroup: Map<string, number>,
): string[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = makeGroupKey(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  for (const bucket of groups.values()) bucket.sort(byCreatedAt);

  const result: string[] = [];
  for (const [key, count] of quantitiesByGroup) {
    if (count <= 0) continue;
    const bucket = groups.get(key) ?? [];
    for (let i = 0; i < Math.min(count, bucket.length); i++) {
      result.push(bucket[i]!.id);
    }
  }
  return result;
}

/** Comparator: ascending by `created_at`. Accepts both ISO strings and Date instances. */
function byCreatedAt(a: GroupableOrderItem, b: GroupableOrderItem): number {
  const aT = typeof a.created_at === 'string' ? a.created_at : a.created_at.toISOString();
  const bT = typeof b.created_at === 'string' ? b.created_at : b.created_at.toISOString();
  return aT.localeCompare(bT);
}
