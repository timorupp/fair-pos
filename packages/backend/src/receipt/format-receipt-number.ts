/** Centralised helper for formatting an `invoice.receipt_number` into the display string used on bons, PDFs, exports and the admin UI. */

import { query } from '../db/client.js';

/** Zero-padding length applied to the sequence number — five digits matches the receipt PDF / ESC/POS layout. */
const PAD_LENGTH = 5;

/**
 * Formats a numeric receipt sequence into the "{prefix}{padded}" form printed
 * on the bon. Keeping the formatter centralised guarantees that the admin UI,
 * Excel export, PDF and ESC/POS all show the exact same string for any given
 * `invoice.receipt_number`.
 *
 * @param num - Raw integer from `invoice.receipt_number`.
 * @param prefix - Prefix from the system settings (e.g. `POS-`). Empty string OK.
 * @returns A string like `POS-00042`.
 */
export function formatReceiptNumber(num: number, prefix: string): string {
  return `${prefix}${String(num).padStart(PAD_LENGTH, '0')}`;
}

/**
 * Reads the configured receipt-number prefix from `system_setting`. Returns
 * an empty string when the setting hasn't been seeded yet — callers can then
 * still format a usable, prefix-less identifier without crashing on bootstrap.
 *
 * @returns The currently configured prefix, or `''` if none is set.
 */
export async function readReceiptPrefix(): Promise<string> {
  const result = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = 'receipt_prefix'`,
  );
  return result.rows[0]?.value ?? '';
}
