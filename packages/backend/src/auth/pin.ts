/**
 * PIN login (Task #90) — a persistent, admin-assigned code that both
 * identifies and authenticates a user in a single step (no visible
 * username), replacing the previous QR one-time-token login.
 *
 * Format: 9 characters from a 32-symbol alphabet (A–Z + 0–9, minus the
 * visually-ambiguous `0`/`O`/`1`/`I`), displayed/entered as `XXX-XXX-XXX`.
 * That's 32^9 ≈ 3.5×10^13 combinations — brute-forcing it is infeasible even
 * before the login rate limiter (see `auth/rateLimit.ts`) is factored in.
 *
 * Hashing is a **deterministic**, keyed HMAC-SHA256
 * (`config.pinHashSecret`) rather than a per-row-salted slow hash like
 * `auth/password.ts` uses for passwords. This is a deliberate trade-off: a
 * salted hash would make the PIN un-lookupable by value, forcing login to
 * compare against every user's hash in turn (bcrypt/scrypt are intentionally
 * slow — a linear scan becomes seconds-long at realistic user counts). HMAC
 * keeps the lookup a single indexed `WHERE pin_hash = $1` while still
 * resisting offline attacks against a stolen DB backup, provided
 * `PIN_HASH_SECRET` is kept out of that backup (see `docs/SETUP.md`).
 */
import { createHmac, randomInt } from 'node:crypto';
import { config } from '../config.js';

/** Characters allowed in a PIN — A–Z and 0–9 minus `0`/`O`/`1`/`I` (easily confused when read/typed). */
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Number of 3-character groups in a PIN, e.g. `XXX-XXX-XXX`. */
const PIN_GROUP_COUNT = 3;
/** Characters per group. */
const PIN_GROUP_LENGTH = 3;
/** Total PIN length excluding separators. */
const PIN_LENGTH = PIN_GROUP_COUNT * PIN_GROUP_LENGTH;

/**
 * Strips separators and normalizes case from user input — accepts pasted
 * input with or without hyphens/spaces, in any letter case.
 *
 * @param input - Raw PIN input, e.g. `"abc-123-xyz"` or `"ABC123XYZ"`.
 * @returns The normalized, separator-free, uppercase PIN candidate (may be
 *   the wrong length or contain invalid characters — check with
 *   {@link isValidPinFormat} before using).
 */
export function normalizePin(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Checks whether a normalized PIN has the right length and only uses
 * characters from {@link PIN_ALPHABET}.
 *
 * @param normalized - A PIN already run through {@link normalizePin}.
 * @returns Whether the PIN is well-formed (not whether it exists/matches).
 */
export function isValidPinFormat(normalized: string): boolean {
  if (normalized.length !== PIN_LENGTH) return false;
  return [...normalized].every((c) => PIN_ALPHABET.includes(c));
}

/**
 * Formats a normalized PIN for display, e.g. `"ABC123XYZ"` → `"ABC-123-XYZ"`.
 *
 * @param normalized - A PIN already run through {@link normalizePin}.
 * @returns The hyphen-grouped display form.
 */
export function formatPinForDisplay(normalized: string): string {
  const groups: string[] = [];
  for (let i = 0; i < normalized.length; i += PIN_GROUP_LENGTH) {
    groups.push(normalized.slice(i, i + PIN_GROUP_LENGTH));
  }
  return groups.join('-');
}

/**
 * Computes the deterministic, keyed hash stored in `user.pin_hash`.
 *
 * @param normalized - A PIN already run through {@link normalizePin}.
 * @returns Hex-encoded HMAC-SHA256 digest.
 */
export function hashPin(normalized: string): string {
  return createHmac('sha256', config.pinHashSecret).update(normalized).digest('hex');
}

/**
 * Generates a cryptographically random, well-formed PIN using
 * `crypto.randomInt` (unbiased, unlike `Math.random() % n`).
 *
 * @returns A normalized (separator-free, uppercase) random PIN.
 */
export function generateRandomPin(): string {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += PIN_ALPHABET[randomInt(0, PIN_ALPHABET.length)];
  }
  return pin;
}
