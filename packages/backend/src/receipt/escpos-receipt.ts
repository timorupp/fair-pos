/**
 * ESC/POS renderer for a full customer receipt.
 *
 * Thin wrapper around the shared block model (Task #105, see
 * `receipt/blocks.ts`/`print/blocks.ts`) — the actual byte-level rendering
 * (including the QR code, added here as of Task #101) is identical to what
 * `receipt/pdf.ts` produces from the same blocks, just rendered to a
 * different target format.
 */

import type { ReceiptData } from './types.js';
import { buildReceiptBlocks } from './blocks.js';
import { renderBlocksToEscPos } from '../print/blocks.js';

/**
 * Builds an ESC/POS byte sequence representing a complete receipt.
 *
 * @param d - Full receipt data.
 * @returns Raw bytes ready to enqueue as a print job.
 */
export async function buildReceiptEscPos(d: ReceiptData): Promise<Buffer> {
  return renderBlocksToEscPos(await buildReceiptBlocks(d));
}
