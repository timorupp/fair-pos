/**
 * Builds the payload logged on the TSE for fiscal transactions.
 *
 * The BSI does not mandate a specific byte format for a TSE transaction's
 * `processData` — only the later DSFinV-K *export* format is standardized
 * (see the Epson TSE Developer's Guide: "This document does not contain any
 * information on the requirements of the data contents logged to the TSE").
 * This module encodes a self-describing JSON snapshot as an interim format.
 * Task #13 (DSFinV-K-Export) may need to revisit this encoding once it's
 * built; the signing architecture itself (start/finish, storing the
 * resulting signature on the invoice) will not need to change.
 */

/** One sold article-unit as it should be reflected in the signed snapshot. */
export interface KassenbelegPosition {
  articleId: string;
  name: string;
  quantity: number;
  unitPriceEuros: number;
  depositPriceEuros: number | null;
  taxRatePercent: number;
}

/** Everything about a completed sale that gets signed as `Kassenbeleg-V1`. */
export interface KassenbelegSnapshot {
  registerId: string;
  paymentMethod: 'cash' | 'card';
  positions: KassenbelegPosition[];
}

/**
 * Serialises a Kassenbeleg-V1 snapshot into the raw bytes passed to
 * `startTransaction`/`finishTransaction`.
 *
 * @param snapshot - The sale's positions, register, and payment method.
 * @returns UTF-8-encoded JSON bytes.
 */
export function buildKassenbelegProcessData(snapshot: KassenbelegSnapshot): Buffer {
  return Buffer.from(JSON.stringify(snapshot), 'utf-8');
}
