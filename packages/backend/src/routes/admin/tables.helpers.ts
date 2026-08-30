/** Pure helper functions for the floor-plan table routes. Kept separate so they can be unit-tested without booting the application. */

/** Generates a sequence of labels (alpha or numeric) for the given count. */
export function makeLabels(count: number, labelType: 'alpha' | 'numeric', order: 'asc' | 'desc'): string[] {
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    labels.push(labelType === 'alpha' ? String.fromCharCode(65 + i) : String(i + 1));
  }
  if (order === 'desc') labels.reverse();
  return labels;
}
