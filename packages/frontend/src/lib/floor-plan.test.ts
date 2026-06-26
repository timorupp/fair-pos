/** Unit tests for the pure floor-plan label helpers. */
import { describe, it, expect } from 'vitest';
import { columnsFromTables, rowsFromTables, type TableLike } from './floor-plan';

const t = (col: string, row: string, colOrder: number, rowOrder: number): TableLike =>
  ({ col_label: col, row_label: row, col_order: colOrder, row_order: rowOrder });

describe('columnsFromTables', () => {
  it('returns the unique column labels in ascending order', () => {
    const tables = [
      t('A', '1', 0, 0), t('B', '1', 1, 0), t('A', '2', 0, 1), t('C', '1', 2, 0),
    ];
    expect(columnsFromTables(tables)).toEqual(['A', 'B', 'C']);
  });

  it('returns an empty array for no tables', () => {
    expect(columnsFromTables([])).toEqual([]);
  });

  it('deduplicates labels that appear in many rows', () => {
    const tables = Array.from({ length: 5 }, (_, i) => t('A', String(i + 1), 0, i));
    expect(columnsFromTables(tables)).toEqual(['A']);
  });

  it('respects the configured order even when it does not match insertion order', () => {
    const tables = [
      t('C', '1', 2, 0), t('A', '1', 0, 0), t('B', '1', 1, 0),
    ];
    expect(columnsFromTables(tables)).toEqual(['A', 'B', 'C']);
  });
});

describe('rowsFromTables', () => {
  it('returns the unique row labels in ascending order', () => {
    const tables = [
      t('A', '1', 0, 0), t('A', '3', 0, 2), t('A', '2', 0, 1),
    ];
    expect(rowsFromTables(tables)).toEqual(['1', '2', '3']);
  });

  it('handles a mixed alphanumeric grid like the editor produces', () => {
    const tables = [
      t('A', 'I',   0, 0), t('B', 'I',   1, 0),
      t('A', 'II',  0, 1), t('B', 'II',  1, 1),
    ];
    expect(columnsFromTables(tables)).toEqual(['A', 'B']);
    expect(rowsFromTables(tables)).toEqual(['I', 'II']);
  });
});
