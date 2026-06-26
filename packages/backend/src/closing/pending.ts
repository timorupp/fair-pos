/** Pure helpers for detecting calendar days that still need a Z-Bon. */

/**
 * Returns the calendar date portion ("YYYY-MM-DD") of a `Date` in the host's
 * local timezone. Used both as DB key and as a sortable string.
 *
 * @param d - The date to format.
 * @returns Date string in `YYYY-MM-DD` format.
 */
export function localDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Computes the list of past calendar days for one register that have not yet
 * been closed with a Z-Bon. "Past" means strictly before `today` — the current
 * day is never reported because the operator is presumably still trading on it.
 *
 * Algorithm:
 *  1. If the register has no activity at all (`firstActivity === null`), there is
 *     nothing to close — return an empty list.
 *  2. Otherwise walk from `firstActivity`'s calendar day to `today - 1` inclusive,
 *     and emit every day that does not appear in `closedDays`.
 *
 * The walk is in the host's local timezone — `Date` arithmetic naturally crosses
 * DST boundaries because we advance the day-of-month by one.
 *
 * @param firstActivity - Earliest signal of life on the register (oldest invoice
 *   or oldest closing). `null` when the register has never been used.
 * @param closedDays - Set of `YYYY-MM-DD` strings that already have a Z-Bon.
 * @param today - Reference "now"; injected for testability. Time portion ignored.
 * @returns Sorted list of `YYYY-MM-DD` strings that still need a Z-Bon, oldest first.
 */
export function pendingClosingDays(
  firstActivity: Date | null,
  closedDays: Set<string>,
  today: Date,
): string[] {
  if (!firstActivity) return [];

  // Walk a Date through each calendar day from firstActivity up to (but excluding) today.
  const cursor = new Date(firstActivity.getFullYear(), firstActivity.getMonth(), firstActivity.getDate());
  const stop = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const pending: string[] = [];
  while (cursor.getTime() < stop.getTime()) {
    const key = localDateString(cursor);
    if (!closedDays.has(key)) pending.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return pending;
}
