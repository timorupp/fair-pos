/**
 * PDF renderer for a full customer receipt.
 *
 * Thin wrapper around the shared block model (Task #105, see
 * `receipt/blocks.ts`/`print/blocks.ts`) — visually matches the printed
 * receipt (monospace, no colour) rather than having its own independent
 * layout, which is what previously let the two drift apart (Task #101).
 */

import type { ReceiptData } from './types.js';
import { buildReceiptBlocks } from './blocks.js';
import { renderBlocksToPdf } from '../print/blocks.js';

/** Renders the receipt PDF and resolves with the complete byte buffer. */
export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return renderBlocksToPdf(await buildReceiptBlocks(data), data.receiptNumber);
}
