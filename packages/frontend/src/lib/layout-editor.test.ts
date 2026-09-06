/** Unit tests for the Kassenlayout-editor pure helpers (DANGER.md T-007). */
import { describe, it, expect } from 'vitest';
import { buildGrid, changeGridSize, applyDrop, DEFAULT_COLOR, type Slot } from './layout-editor';

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    article_id: 'a1', article_name: 'Bier', grid_row: 0, grid_col: 0,
    color: '#111111', label: null, hidden: false,
    ...overrides,
  };
}

describe('buildGrid', () => {
  it('places each slot at its grid position, null elsewhere', () => {
    const s = slot({ grid_row: 1, grid_col: 2 });
    const grid = buildGrid(2, 3, [s]);
    expect(grid).toHaveLength(2);
    expect(grid[0]).toEqual([null, null, null]);
    expect(grid[1]).toEqual([null, null, s]);
  });

  it('returns an all-null grid for no slots', () => {
    expect(buildGrid(2, 2, [])).toEqual([[null, null], [null, null]]);
  });

  it('drops a slot that falls outside the given bounds instead of throwing', () => {
    const s = slot({ grid_row: 5, grid_col: 5 });
    const grid = buildGrid(2, 2, [s]);
    expect(grid.flat().every((cell) => cell === null)).toBe(true);
  });
});

describe('changeGridSize', () => {
  it('increments within bounds without touching slots', () => {
    const s = slot({ grid_col: 1 });
    const result = changeGridSize('cols', 1, 4, 4, [s]);
    expect(result).toEqual({ gridCols: 5, gridRows: 4, slots: [s] });
  });

  it('clamps at the upper bound (10)', () => {
    expect(changeGridSize('cols', 5, 10, 4, []).gridCols).toBe(10);
  });

  it('clamps at the lower bound (1)', () => {
    expect(changeGridSize('rows', -5, 4, 1, []).gridRows).toBe(1);
  });

  it('drops slots that fall outside the grid when shrinking columns', () => {
    const kept = slot({ grid_col: 0 });
    const dropped = slot({ grid_col: 2, article_id: 'a2' });
    const result = changeGridSize('cols', -2, 4, 4, [kept, dropped]);
    expect(result.gridCols).toBe(2);
    expect(result.slots).toEqual([kept]);
  });

  it('drops slots that fall outside the grid when shrinking rows', () => {
    const kept = slot({ grid_row: 0 });
    const dropped = slot({ grid_row: 3, article_id: 'a2' });
    const result = changeGridSize('rows', -2, 4, 4, [kept, dropped]);
    expect(result.gridRows).toBe(2);
    expect(result.slots).toEqual([kept]);
  });

  it('keeps all slots when growing', () => {
    const s = slot();
    const result = changeGridSize('rows', 2, 4, 4, [s]);
    expect(result.slots).toEqual([s]);
  });
});

describe('applyDrop', () => {
  it('places a fresh article from the Ablage with default color/label/hidden', () => {
    const result = applyDrop([], { type: 'ablage', articleId: 'a1', articleName: 'Bier' }, 0, 0);
    expect(result).toEqual([
      { article_id: 'a1', article_name: 'Bier', grid_row: 0, grid_col: 0, color: DEFAULT_COLOR, label: null, hidden: false },
    ]);
  });

  it('bumps an existing slot off the target cell when placing a fresh Ablage article there', () => {
    const existing = slot({ grid_row: 0, grid_col: 0, article_id: 'old' });
    const result = applyDrop([existing], { type: 'ablage', articleId: 'new', articleName: 'Cola' }, 0, 0);
    expect(result).toHaveLength(1);
    expect(result[0]!.article_id).toBe('new');
  });

  it('moves an existing slot to an empty cell, preserving its color/label/hidden', () => {
    const s = slot({ grid_row: 0, grid_col: 0, color: '#abcdef', label: 'Spezial', hidden: true });
    const result = applyDrop(
      [s],
      { type: 'slot', articleId: s.article_id, articleName: s.article_name, fromRow: 0, fromCol: 0 },
      1, 1,
    );
    expect(result).toEqual([{ ...s, grid_row: 1, grid_col: 1 }]);
  });

  it('swaps two slots when moving onto an occupied cell', () => {
    const a = slot({ article_id: 'a', grid_row: 0, grid_col: 0, color: '#111111' });
    const b = slot({ article_id: 'b', grid_row: 1, grid_col: 1, color: '#222222' });
    const result = applyDrop(
      [a, b],
      { type: 'slot', articleId: a.article_id, articleName: a.article_name, fromRow: 0, fromCol: 0 },
      1, 1,
    );
    const movedA = result.find((s) => s.article_id === 'a')!;
    const movedB = result.find((s) => s.article_id === 'b')!;
    // a took b's old cell, b took a's old cell — each keeping its own color.
    expect(movedA).toEqual({ ...a, grid_row: 1, grid_col: 1 });
    expect(movedB).toEqual({ ...b, grid_row: 0, grid_col: 0 });
  });
});
