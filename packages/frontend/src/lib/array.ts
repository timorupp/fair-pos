/** Pure array helpers used across the frontend. */

/**
 * Repositions `item` to sit immediately before `target` in the result.
 * Returns a new array. If `item` or `target` is not in `arr`, the original array is returned unchanged.
 */
export function reorderArray<T>(arr: T[], item: T, target: T): T[] {
  if (!arr.includes(item) || !arr.includes(target)) return arr;
  const result = arr.filter((x) => x !== item);
  const idx = result.indexOf(target);
  result.splice(idx, 0, item);
  return result;
}
