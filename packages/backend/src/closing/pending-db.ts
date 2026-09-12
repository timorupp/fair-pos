/** Database-backed wrapper around `pendingClosingDays`. Resolves the missing-closing list for a register. */

import { query } from '../db/client.js';
import { pendingClosingDays, localDateString } from './pending.js';

/**
 * Looks up the calendar days that still need a Z-Bon for the given register.
 *
 * Reads from the shared pool — not safe to call inside an open transaction
 * on a different client because it depends on committed data.
 *
 * @param registerId - The register to inspect.
 * @param today - Reference "now"; defaults to a fresh `Date` if omitted.
 * @returns Sorted list of `YYYY-MM-DD` strings, oldest first.
 */
export async function findPendingDaysForRegister(
  registerId: string,
  today: Date = new Date(),
): Promise<string[]> {
  // Earliest sign of activity = min(oldest invoice, oldest closing, oldest
  // service_order, oldest order_cancellation) — a register can see Bedienung
  // activity (order placed, order cancelled) before its first invoice is ever
  // written, so anchoring on invoices/closings alone could start the walk
  // later than the day that activity actually needs a Z-Bon for. For the
  // closings side we use `business_date` so a Z-Bon nachgeholt on a later day
  // still anchors the walk at the day it covers, not the day it was created.
  // Four independent subqueries rather than LEFT JOINs, so the row counts of
  // unrelated tables don't multiply into a cross product.
  const firstResult = await query<{ first: Date | null }>(
    `SELECT LEAST(
              (SELECT MIN(created_at) FROM invoice WHERE register_id = $1),
              (SELECT MIN(business_date)::timestamptz FROM daily_closing WHERE register_id = $1),
              (SELECT MIN(created_at) FROM service_order WHERE register_id = $1),
              (SELECT MIN(created_at) FROM order_cancellation WHERE register_id = $1)
            ) AS first`,
    [registerId],
  );
  const first = firstResult.rows[0]?.first ?? null;
  if (!first) return [];

  // Calendar days for which a closing has been issued, keyed by business_date.
  const closedResult = await query<{ day: string }>(
    `SELECT to_char(business_date, 'YYYY-MM-DD') AS day
       FROM daily_closing
      WHERE register_id = $1`,
    [registerId],
  );
  const closedDays = new Set<string>(closedResult.rows.map((r) => r.day));

  // D-075: calendar days (by `created_at`) that still have at least one
  // invoice/service_order/order_cancellation row not yet linked to ANY
  // closing — re-opens a day already in `closedDays` if a row slipped in
  // after that day's Z-Bon (nothing locks a register once closed).
  const unlinkedResult = await query<{ day: string }>(
    `SELECT DISTINCT to_char(created_at::date, 'YYYY-MM-DD') AS day FROM (
       SELECT created_at FROM invoice WHERE register_id = $1 AND daily_closing_id IS NULL
       UNION ALL
       SELECT created_at FROM service_order WHERE register_id = $1 AND daily_closing_id IS NULL
       UNION ALL
       SELECT created_at FROM order_cancellation WHERE register_id = $1 AND daily_closing_id IS NULL
     ) unlinked`,
    [registerId],
  );
  const daysWithUnlinkedRows = new Set<string>(unlinkedResult.rows.map((r) => r.day));

  return pendingClosingDays(first, closedDays, daysWithUnlinkedRows, today);
}

/**
 * Convenience predicate: `true` when the register has no past calendar day awaiting
 * a Z-Bon. Used to gate cash-register operations until the operator has caught up.
 *
 * @param registerId - The register to check.
 * @param today - Reference "now"; defaults to a fresh `Date` if omitted.
 * @returns Whether the register is currently unlocked for new bookings.
 */
export async function isRegisterUnlocked(
  registerId: string,
  today: Date = new Date(),
): Promise<boolean> {
  const pending = await findPendingDaysForRegister(registerId, today);
  return pending.length === 0;
}

/** Re-export so endpoints can format today's date alongside the pending list. */
export { localDateString };
