/** Pure helpers shared by the floor-plan editor and the Bedienungskasse Saalplan view. */

/** Minimal shape of a dining-table row used by the geometry helpers. */
export interface TableLike {
  col_label: string;
  row_label: string;
  col_order: number;
  row_order: number;
}

/**
 * Derives the ordered column-label sequence from a flat list of tables.
 * Each column appears exactly once, sorted by its `col_order`. Conflicts (same
 * `col_label` with different `col_order` values) take the first-seen ordering.
 */
export function columnsFromTables(tables: TableLike[]): string[] {
  return uniqueLabelsByOrder(tables, (t) => t.col_label, (t) => t.col_order);
}

/** Derives the ordered row-label sequence the same way `columnsFromTables` does. */
export function rowsFromTables(tables: TableLike[]): string[] {
  return uniqueLabelsByOrder(tables, (t) => t.row_label, (t) => t.row_order);
}

/** Shared core: returns labels in ascending-order, deduplicated. */
function uniqueLabelsByOrder<T>(
  items: T[],
  labelOf: (item: T) => string,
  orderOf: (item: T) => number,
): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const label = labelOf(item);
    if (!seen.has(label)) seen.set(label, orderOf(item));
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
}
