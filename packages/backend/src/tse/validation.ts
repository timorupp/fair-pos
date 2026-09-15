/**
 * Format validation for TSE credentials entered via the Admin UI (Task
 * #131) — checked server-side *before* ever invoking `tseCli`, so a typo
 * (e.g. a 5-digit PUK) is rejected immediately instead of reaching the TSE
 * and risking a failed-attempt counter (a wrong PUK on `setup` can
 * permanently lock the TSE after 3 attempts, see
 * docs/TSE-CLI-Referenz.md). Lengths are taken verbatim from `WormDLL.h`
 * (`worm_user_deriveInitialCredentials`/`worm_user_change_puk`/
 * `worm_user_change_pin`); the Client-ID limit from
 * `worm_tse_registerClient`'s documented maximum.
 */

/**
 * Validates a TSE PUK (Admin or TimeAdmin): must be exactly 6 digits.
 *
 * @param value - The candidate PUK.
 * @returns Whether `value` is exactly 6 ASCII digits.
 */
export function isValidPuk(value: string): boolean {
  return /^[0-9]{6}$/.test(value);
}

/**
 * Validates a TSE PIN (Admin or TimeAdmin): must be exactly 5 digits.
 *
 * @param value - The candidate PIN.
 * @returns Whether `value` is exactly 5 ASCII digits.
 */
export function isValidPin(value: string): boolean {
  return /^[0-9]{5}$/.test(value);
}

/**
 * Validates a TSE Client-ID: letters, digits, hyphen, underscore only, at
 * most 30 bytes (`worm_tse_registerClient`'s documented maximum length).
 *
 * @param value - The candidate Client-ID.
 * @returns Whether `value` is a non-empty string matching that character set and length.
 */
export function isValidClientId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,30}$/.test(value);
}
