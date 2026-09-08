/**
 * Pure helpers for the Kassenlayout editor
 * (`routes/admin/settings/layouts/[id]/+page.svelte`) — extracted so the
 * grid/resize/drag-drop logic is unit-testable without a component harness
 * (T-007).
 */

/** One placed article on the layout grid. */
export interface Slot {
  article_id: string;
  article_name: string;
  grid_row: number;
  grid_col: number;
  color: string;
  label: string | null;
  hidden: boolean;
}

/** Default tile color for a freshly-placed slot (no color chosen yet). */
export const DEFAULT_COLOR = '#3b82f6';

/**
 * Builds a `rows × cols` matrix with each placed slot at its grid position,
 * `null` everywhere else.
 *
 * @param rows - Number of grid rows.
 * @param cols - Number of grid columns.
 * @param slots - Currently placed slots.
 * @returns A `rows`-length array of `cols`-length arrays.
 */
export function buildGrid(rows: number, cols: number, slots: Slot[]): (Slot | null)[][] {
  const cells: (Slot | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const slot of slots) {
    if (slot.grid_row < rows && slot.grid_col < cols) (cells[slot.grid_row] as (Slot | null)[])[slot.grid_col] = slot;
  }
  return cells;
}

/**
 * Computes the new grid size and slot list after resizing one dimension.
 * Clamped to [1, 10]. Shrinking a dimension drops any slot that would fall
 * outside the new bounds.
 *
 * @param dim - Which dimension to resize.
 * @param delta - `+1`/`-1` (or any signed step).
 * @param gridCols - Current column count.
 * @param gridRows - Current row count.
 * @param slots - Current slots.
 * @returns The new column/row counts and the (possibly pruned) slot list.
 */
export function changeGridSize(
  dim: 'cols' | 'rows',
  delta: number,
  gridCols: number,
  gridRows: number,
  slots: Slot[],
): { gridCols: number; gridRows: number; slots: Slot[] } {
  if (dim === 'cols') {
    const next = Math.max(1, Math.min(10, gridCols + delta));
    const nextSlots = next < gridCols ? slots.filter((s) => s.grid_col < next) : slots;
    return { gridCols: next, gridRows, slots: nextSlots };
  }
  const next = Math.max(1, Math.min(10, gridRows + delta));
  const nextSlots = next < gridRows ? slots.filter((s) => s.grid_row < next) : slots;
  return { gridCols, gridRows: next, slots: nextSlots };
}

/** What's being dragged onto a grid cell — a fresh article from the Ablage, or an existing slot being moved from another cell. */
export interface DragSource {
  type: 'ablage' | 'slot';
  articleId: string;
  articleName: string;
  /** Only set (and only meaningful) when `type === 'slot'`. */
  fromRow?: number;
  /** Only set (and only meaningful) when `type === 'slot'`. */
  fromCol?: number;
}

/**
 * Computes the new slot list after dropping `drag` onto grid cell
 * `(row, col)`. A fresh placement from the Ablage always starts with
 * default color/label/hidden; moving an existing slot preserves its
 * attributes. If the target cell is already occupied, the two slots swap
 * positions instead of one overwriting the other.
 *
 * @param slots - Current slots before the drop.
 * @param drag - What's being dragged (see {@link DragSource}).
 * @param row - Target row.
 * @param col - Target column.
 * @returns The new slot list after the drop.
 */
export function applyDrop(slots: Slot[], drag: DragSource, row: number, col: number): Slot[] {
  const slotAt = (r: number, c: number): Slot | null => slots.find((s) => s.grid_row === r && s.grid_col === c) ?? null;
  const existing = slotAt(row, col);

  if (drag.type === 'ablage') {
    const withoutTarget = slots.filter((s) => !(s.grid_row === row && s.grid_col === col));
    return [...withoutTarget, {
      article_id: drag.articleId, article_name: drag.articleName,
      grid_row: row, grid_col: col, color: DEFAULT_COLOR, label: null, hidden: false,
    }];
  }

  // Move from another cell — grab the full moved slot BEFORE removing it from
  // its old position, so color/label/hidden carry over to the new position
  // instead of resetting to defaults (found live: looking the old slot up
  // again only after it had already been filtered out always found nothing).
  const fromRow = drag.fromRow!;
  const fromCol = drag.fromCol!;
  const movedSlot = slotAt(fromRow, fromCol)!;
  let next = slots.filter((s) => !(s.grid_row === fromRow && s.grid_col === fromCol));
  if (existing) {
    // Swap: put the existing slot where the dragged one came from.
    next = next.filter((s) => !(s.grid_row === row && s.grid_col === col));
    next = [...next, { ...existing, grid_row: fromRow, grid_col: fromCol }];
  } else {
    next = next.filter((s) => !(s.grid_row === row && s.grid_col === col));
  }
  return [...next, { ...movedSlot, grid_row: row, grid_col: col }];
}
