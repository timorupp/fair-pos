/** Receipt-token generator. Kept separate from `sequence.ts` so it can be reused without a DB client. */

import crypto from 'node:crypto';

/**
 * Generates a cryptographically random URL-safe token used as the `receipt_token`
 * embedded in the customer-facing receipt URL.
 *
 * 32 random bytes → 43 base64url characters; far beyond the entropy needed to make
 * enumeration of receipts infeasible.
 *
 * @returns A URL-safe 43-character token string.
 */
export function generateReceiptToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
