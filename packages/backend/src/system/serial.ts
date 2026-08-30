/** Generates and persists the cash-register-system serial number. Pure-formatter portion is unit-tested. */

import crypto from 'node:crypto';

/** Alphabet used for the random suffix: uppercase letters + digits (36 chars). Per Anforderungen. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Number of random characters appended after the year, e.g. `FairPOS-2026-A3B7K2M9XQ`. */
const SUFFIX_LENGTH = 10;

/** Validates that a string matches the FairPOS-{year}-{10×[A-Z0-9]} serial format. */
const SERIAL_REGEX = /^FairPOS-\d{4}-[A-Z0-9]{10}$/;

/**
 * Builds a new serial number for the given year using the supplied byte source.
 *
 * The byte source defaults to `crypto.randomBytes`; tests inject a deterministic
 * stub. Each output byte is mapped to one alphabet character via `byte % 36` —
 * slight modulo bias is irrelevant at 36 < 256/7, and the suffix only needs to
 * be unique-per-install, not cryptographically uniform.
 *
 * @param year - Year to embed in the serial (the second segment).
 * @param randomBytes - Byte source; defaulted to `crypto.randomBytes`. Override in tests.
 * @returns A serial like `FairPOS-2026-A3B7K2M9XQ`.
 */
export function generateSystemSerial(
  year: number,
  randomBytes: (n: number) => Buffer = crypto.randomBytes,
): string {
  const bytes = randomBytes(SUFFIX_LENGTH);
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `FairPOS-${year}-${suffix}`;
}

/**
 * Returns whether the supplied string matches the documented serial format.
 * Used by the bootstrap to detect manually-corrupted DB entries.
 *
 * @param value - The candidate string to validate.
 * @returns `true` when the format is correct, `false` otherwise.
 */
export function isValidSystemSerial(value: string): boolean {
  return SERIAL_REGEX.test(value);
}
