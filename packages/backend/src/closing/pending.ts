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
 * Algorithm — a day is pending if EITHER:
 *  1. No `daily_closing` exists for it at all (`closedDays` doesn't contain it) — the
 *     original "never closed" case, including a day with zero activity (still
 *     needs a Nullabschluss to keep the Z-number chain gapless); or
 *  2. A closing already exists for it, but at least one `invoice`/`service_order`/
 *     `order_cancellation` row dated on that day is still unlinked
 *     (`daily_closing_id IS NULL`) — D-075 (2026-09-12): a row created *after* that
 *     day's closing (nothing locks a register once closed — see
 *     `isRegisterUnlocked`'s own doc comment) previously stayed invisible to this
 *     check forever, since it only ever asked "does a closing exist for this day",
 *     never "is every row for this day actually linked to one". Such a straggler
 *     would eventually get swept into whatever closing happens to run next —
 *     silently misattributed to the WRONG business_date instead of its own.
 *
 * The walk is in the host's local timezone — `Date` arithmetic naturally crosses
 * DST boundaries because we advance the day-of-month by one.
 *
 * @param firstActivity - Earliest signal of life on the register (oldest invoice
 *   or oldest closing). `null` when the register has never been used.
 * @param closedDays - Set of `YYYY-MM-DD` strings that already have a Z-Bon.
 * @param daysWithUnlinkedRows - Set of `YYYY-MM-DD` strings (D-075) on which at
 *   least one invoice/service_order/order_cancellation row still has
 *   `daily_closing_id IS NULL` — re-opens an already-`closedDays` day.
 * @param today - Reference "now"; injected for testability. Time portion ignored.
 * @returns Sorted list of `YYYY-MM-DD` strings that still need a Z-Bon, oldest first.
 */
export function pendingClosingDays(
  firstActivity: Date | null,
  closedDays: Set<string>,
  daysWithUnlinkedRows: Set<string>,
  today: Date,
): string[] {
  if (!firstActivity) return [];

  // Walk a Date through each calendar day from firstActivity up to (but excluding) today.
  const cursor = new Date(firstActivity.getFullYear(), firstActivity.getMonth(), firstActivity.getDate());
  const stop = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const pending: string[] = [];
  while (cursor.getTime() < stop.getTime()) {
    const key = localDateString(cursor);
    if (!closedDays.has(key) || daysWithUnlinkedRows.has(key)) pending.push(key);
    cursor.setDate(cursor.getDate() + 1);
  }
  return pending;
}
