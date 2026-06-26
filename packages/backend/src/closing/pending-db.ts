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
  // Earliest sign of activity = min(oldest invoice, oldest closing). For the
  // closings side we use `business_date` so a Z-Bon nachgeholt on a later day
  // still anchors the walk at the day it covers, not the day it was created.
  const firstResult = await query<{ first: Date | null }>(
    `SELECT LEAST(MIN(i.created_at), MIN(c.business_date)::timestamptz) AS first
       FROM register r
       LEFT JOIN invoice i ON i.register_id = r.id
       LEFT JOIN daily_closing c ON c.register_id = r.id
      WHERE r.id = $1`,
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

  return pendingClosingDays(first, closedDays, today);
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
