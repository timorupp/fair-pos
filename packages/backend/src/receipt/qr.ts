/** QR-code payload building and rendering for receipts. */

import { toBuffer } from 'qrcode';
import { config } from '../config.js';
import { buildKassenbelegProcessData, KASSENBELEG_PROCESS_TYPE } from '../tse/processData.js';
import { getTseCertificateInfo } from '../tse/certificateInfo.js';
import type { ReceiptData } from './types.js';

/** Hex string (as stored on `invoice`) to base64 — Anhang I's `<signatur>` QR field, like `TSE_TA_SIG` in transactions_tse.csv, is base64, not hex. */
function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

/**
 * Builds the QR-code payload string for a "maschinell prüfbarer Kassenbeleg"
 * exactly as DSFinV-K v2.4 Anhang I §2 defines it (verbatim citation:
 * docs/Rechtliche-Anforderungen.md Abschnitt 6.5/8): field order
 * `<qr-code-version>;<kassen-seriennummer>;<processType>;<processData>;
 * <transaktions-nummer>;<signatur-zaehler>;<start-zeit>;<log-time>;<sig-alg>;
 * <log-time-format>;<signatur>;<public-key>`.
 *
 * `<processData>` is recomputed from the receipt's own line items rather
 * than persisted separately — deterministic given the same
 * positions/payment method/`isCancellation` flag that were actually signed
 * (see tse/processData.ts), so there is no second copy that could drift from
 * what's on the TSE.
 *
 * @param data - Full receipt data. TSE fields are `null` when the sale
 *   wasn't signed (TSE unconfigured or an outage — see
 *   docs/TSE-Integration.md → "TSE-Ausfall"); the QR code is still rendered
 *   in that case, just with empty trailing fields — a missing transaction
 *   number is itself an accepted outage marking per AEAO zu § 146a AO
 *   Nr. 1.14.2.
 * @returns Semicolon-separated string ready to be encoded as a QR code.
 */
export async function buildQrPayload(data: ReceiptData): Promise<string> {
  const processData = buildKassenbelegProcessData({
    paymentMethod: data.paymentMethod,
    receiptType: data.isCancellation ? 'cancellation' : 'sales_receipt',
    positions: data.positions.map((p) => ({
      quantity: p.quantity,
      unitPriceEuros: p.unitPrice,
      depositPriceEuros: p.unitDeposit,
      taxCategory: p.taxCategory,
    })),
  }).toString('utf-8');

  const cert = await getTseCertificateInfo();

  return [
    'V0',
    config.tseClientId ?? '',
    KASSENBELEG_PROCESS_TYPE,
    processData,
    data.tseTransactionNumber?.toString() ?? '',
    data.tseSignatureCounter?.toString() ?? '',
    data.tseStartTime ? data.tseStartTime.toISOString() : '',
    data.tseEndTime ? data.tseEndTime.toISOString() : '',
    cert?.signatureAlgorithm ?? '',
    cert?.logTimeFormat ?? '',
    data.tseSignature ? hexToBase64(data.tseSignature) : '',
    cert?.publicKeyBase64 ?? '',
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
