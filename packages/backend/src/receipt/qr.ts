/** QR-code payload building and rendering for receipts. */

import { toBuffer } from 'qrcode';
import type { ReceiptData } from './types.js';
import { formatGermanDateTime } from './format.js';

/**
 * Builds the QR-code payload string carrying TSE proof data.
 *
 * Format follows the common semicolon-separated "Bon-QR" layout used by
 * KassenSichV implementations. Until TSE integration (task #4) supplies real
 * values, the payload encodes whatever fields are available so the renderer
 * still produces a scannable code.
 *
 * NOTE: The exact byte-level format prescribed by DSFinV-K / BSI TR-03151 must
 * be verified against the official specification once TSE is wired up.
 * Tracked in DANGER.md (D-009).
 *
 * @param data - Full receipt data (TSE fields may be null in the pre-TSE phase).
 * @returns Semicolon-separated string ready to be encoded as a QR code.
 */
export function buildQrPayload(data: ReceiptData): string {
  return [
    data.systemSerial,
    data.receiptNumber,
    formatGermanDateTime(data.createdAt),
    data.tseSerial ?? '',
    data.tseTransactionNumber?.toString() ?? '',
    data.tseSignatureCounter?.toString() ?? '',
    data.tseSignature ?? '',
    data.tseStartTime ? formatGermanDateTime(data.tseStartTime) : '',
    data.tseEndTime ? formatGermanDateTime(data.tseEndTime) : '',
  ].join(';');
}

/**
 * Renders the QR payload as a PNG buffer suitable for embedding into the PDF
 * or sending to the customer's browser.
 *
 * @param payload - Plain-text QR data (typically from `buildQrPayload`).
 * @param sizePx - Output image edge length in pixels.
 * @returns PNG bytes.
 */
export function renderQrPng(payload: string, sizePx: number = 220): Promise<Buffer> {
  return toBuffer(payload, { type: 'png', width: sizePx, margin: 1 });
}
