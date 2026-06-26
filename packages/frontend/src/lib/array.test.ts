/** Unit tests for array helpers. */
import { describe, it, expect } from 'vitest';
import { reorderArray } from './array';

describe('reorderArray', () => {
  it('inserts the item immediately before the target (forward move)', () => {
    expect(reorderArray(['A', 'B', 'C', 'D'], 'A', 'C')).toEqual(['B', 'A', 'C', 'D']);
  });

  it('inserts the item immediately before the target (backward move)', () => {
    expect(reorderArray(['A', 'B', 'C', 'D'], 'D', 'B')).toEqual(['A', 'D', 'B', 'C']);
  });

  it('dragging onto the immediate next neighbour is a no-op (item ends up before target = its original slot)', () => {
    // Dragging A onto B: remove A → [B], insert A before B → [A, B]. Unchanged.
    expect(reorderArray(['A', 'B'], 'A', 'B')).toEqual(['A', 'B']);
  });

  it('dragging onto the immediate previous neighbour swaps them', () => {
    // Dragging B onto A: remove B → [A], insert B before A → [B, A]. Swap.
    expect(reorderArray(['A', 'B'], 'B', 'A')).toEqual(['B', 'A']);
  });

  it('returns the original array unchanged when item is not present', () => {
    const arr = ['A', 'B', 'C'];
    expect(reorderArray(arr, 'X', 'A')).toEqual(arr);
  });

  it('returns the original array unchanged when target is not present', () => {
    const arr = ['A', 'B', 'C'];
    expect(reorderArray(arr, 'A', 'X')).toEqual(arr);
  });

  it('returns a new array (does not mutate input) when reordering happens', () => {
    const arr = ['A', 'B', 'C'];
    const result = reorderArray(arr, 'A', 'C');
    expect(result).not.toBe(arr);
    expect(arr).toEqual(['A', 'B', 'C']);
  });

  it('works with numeric values', () => {
    expect(reorderArray([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });
});
