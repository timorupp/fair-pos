/**
 * Validation + mutation for "Kasse stilllegen" (Task #151) — retiring a
 * register as of a chosen (possibly retroactive) last-usable calendar day.
 */
import { query } from '../db/client.js';
import { findPendingDaysForRegister, localDateString } from './pending-db.js';

/** Thrown with a German, user-facing message and an HTTP status to reply with. */
export class RegisterRetireError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus: number = 400) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

/**
 * Retires a register as of `retiredDate` (its last usable calendar day,
 * inclusive). Validates both directions before persisting anything:
 *
 *  1. Every calendar day strictly before `retiredDate` must already have a
 *     Z-Bon — otherwise retiring now would leave a gap that could never be
 *     closed once the register is hard-locked against further use.
 *  2. No booking or closing may exist on any day strictly after
 *     `retiredDate` — otherwise the chosen date was too early for a
 *     register that kept being used past it (pick a later date instead).
 *
 * `retiredDate` itself is deliberately not required to already be closed —
 * it's the *last allowed* day, not necessarily an already-closed one.
 *
 * @param registerId - The register to retire.
 * @param retiredDate - Last usable calendar day (inclusive), server-local date.
 * @throws {RegisterRetireError} With a clear German message when either
 *   validation fails.
 */
export async function retireRegister(registerId: string, retiredDate: Date): Promise<void> {
  const pendingBefore = await findPendingDaysForRegister(registerId, retiredDate);
  if (pendingBefore.length > 0) {
    throw new RegisterRetireError(
      `Vor dem Schließdatum liegen noch ${pendingBefore.length} offene ` +
      `Tagesabschluss-Tag${pendingBefore.length === 1 ? '' : 'e'} (ältester: ` +
      `${pendingBefore[0]}) — erst nachholen, bevor die Kasse stillgelegt werden kann.`,
    );
  }

  const dateStr = localDateString(retiredDate);
  const afterResult = await query<{ day: string }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day FROM (
       SELECT created_at::date AS d FROM invoice WHERE register_id = $1 AND created_at::date > $2::date
       UNION ALL
       SELECT created_at::date AS d FROM service_order WHERE register_id = $1 AND created_at::date > $2::date
       UNION ALL
       SELECT created_at::date AS d FROM order_cancellation WHERE register_id = $1 AND created_at::date > $2::date
       UNION ALL
       SELECT business_date AS d FROM daily_closing WHERE register_id = $1 AND business_date > $2::date
     ) later
     ORDER BY d ASC LIMIT 1`,
    [registerId, dateStr],
  );
  const firstAfter = afterResult.rows[0]?.day;
  if (firstAfter) {
    throw new RegisterRetireError(
      `Nach dem gewählten Schließdatum gibt es bereits Buchungen/Kassenabschlüsse ` +
      `(ab ${firstAfter}) — ein späteres Schließdatum wählen.`,
    );
  }

  await query(`UPDATE register SET retired_date = $2 WHERE id = $1`, [registerId, dateStr]);
}

/**
 * Reactivates a previously retired register (System-Administrator only,
 * Task #151 — deliberately reversible, a misclick is never permanent). No
 * validation needed: clearing `retired_date` can never create an
 * inconsistent state.
 *
 * @param registerId - The register to reactivate.
 */
export async function reactivateRegister(registerId: string): Promise<void> {
  await query(`UPDATE register SET retired_date = NULL WHERE id = $1`, [registerId]);
}
