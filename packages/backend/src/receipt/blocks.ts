/**
 * Builds the neutral print-block list (Task #105) for a customer receipt —
 * consumed by both `renderBlocksToEscPos` and `renderBlocksToPdf`, replacing
 * the two previously-independent renderers in `escpos-receipt.ts`/`pdf.ts`.
 */

import type { PrintBlock } from '../print/blocks.js';
import { pngToEscposRaster } from '../print/raster.js';
import { buildQrPayload, renderQrPng } from './qr.js';
import { formatEuro, formatEuroLabel, formatGermanDateTime, formatTaxRate } from './format.js';
import type { ReceiptData } from './types.js';

/** Fraction of the printable width the QR code occupies in the PDF. */
const QR_PDF_WIDTH_FACTOR = 0.35;
/** Target pixel width for the QR code's ESC/POS raster (thermal print head is ~576px at 100%). */
const QR_ESCPOS_WIDTH_PX = 300;
/** Fixed pixel size the QR PNG is rendered at before either target format scales it down. */
const QR_SOURCE_SIZE_PX = 220;

/**
 * Builds the complete block list for one receipt, including its QR code
 * (Task #101 — now on both the PDF and the printed receipt, not just the PDF).
 *
 * @param d - Full receipt data (see `receipt/data.ts` for how it's loaded).
 * @returns Blocks in print order, ready for either renderer.
 */
export async function buildReceiptBlocks(d: ReceiptData): Promise<PrintBlock[]> {
  const qrPng = await renderQrPng(await buildQrPayload(d), QR_SOURCE_SIZE_PX);
  const qrEscposRaster = await pngToEscposRaster(qrPng, QR_ESCPOS_WIDTH_PX);

  const blocks: PrintBlock[] = [];

  if (d.logoPng && d.logoWidth > 0 && d.logoHeight > 0 && d.logoWidthFactor > 0 && d.logoEscPos) {
    blocks.push({
      kind: 'image',
      pngBase64: d.logoPng.toString('base64'), pngWidth: d.logoWidth, pngHeight: d.logoHeight,
      escposRasterBase64: d.logoEscPos.toString('base64'), widthFactor: d.logoWidthFactor,
    });
  }

  if (d.isCancellation) {
    blocks.push({ kind: 'text', text: 'STORNOBELEG', align: 'center', bold: true, size: 'xlarge' });
    blocks.push({ kind: 'blank' });
  }

  blocks.push({ kind: 'text', text: d.companyName, align: 'center', bold: true, size: 'large' });
  for (const line of d.companyAddressLines) blocks.push({ kind: 'text', text: line, align: 'center' });
  blocks.push({ kind: 'text', text: `Steuernummer: ${d.taxNumber}`, align: 'center' });
  if (d.vatId) blocks.push({ kind: 'text', text: `USt-IdNr.: ${d.vatId}`, align: 'center' });
  blocks.push({ kind: 'blank' });

  blocks.push({
    kind: 'text',
    text: `${d.isCancellation ? 'Stornobeleg' : 'Beleg'} ${d.receiptNumber}`,
    align: 'center', bold: true,
  });
  blocks.push({ kind: 'text', text: formatGermanDateTime(d.createdAt), align: 'center' });
  blocks.push({
    kind: 'text',
    text: `Kasse: ${d.registerName}    Zahlung: ${d.paymentMethod === 'cash' ? 'Bar' : 'Karte'}`,
    align: 'center',
  });
  blocks.push({ kind: 'hr' });

  for (const p of d.positions) {
    blocks.push({ kind: 'row', left: `${p.quantity}x ${p.name}`, right: formatEuro(p.lineGross) });
    if (p.unitDeposit !== null && p.unitDeposit !== 0) {
      blocks.push({ kind: 'text', text: `     à ${formatEuro(p.unitPrice)} + Pfand ${formatEuro(p.unitDeposit)}` });
    }
  }
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'row', left: 'Gesamt', right: formatEuroLabel(d.totalGross), bold: true, size: 'large' });

  for (const row of d.taxBreakdown) {
    blocks.push({
      kind: 'row',
      left: `MwSt ${formatTaxRate(row.rate)}`,
      right: `Netto ${formatEuro(row.net)}  Steuer ${formatEuro(row.tax)}`,
    });
  }
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: 'TSE-Daten', bold: true });
  blocks.push({ kind: 'text', text: `Kassensystem-Seriennr.: ${d.systemSerial}` });
  if (d.tseSerial) blocks.push({ kind: 'text', text: `TSE-Seriennr.: ${d.tseSerial}` });
  if (d.tseTransactionNumber !== null) blocks.push({ kind: 'text', text: `Transaktionsnr.: ${d.tseTransactionNumber}` });
  if (d.tseSignatureCounter !== null) blocks.push({ kind: 'text', text: `Signaturzähler: ${d.tseSignatureCounter}` });
  if (d.tseStartTime) blocks.push({ kind: 'text', text: `Start: ${formatGermanDateTime(d.tseStartTime)}` });
  if (d.tseEndTime) blocks.push({ kind: 'text', text: `Ende:  ${formatGermanDateTime(d.tseEndTime)}` });
  if (d.tseSignature) {
    blocks.push({ kind: 'text', text: `Signatur: ${d.tseSignature}` });
  } else {
    blocks.push({ kind: 'text', text: 'Signatur: ! TSE Fehler !' });
  }

  blocks.push({
    kind: 'image',
    pngBase64: qrPng.toString('base64'), pngWidth: QR_SOURCE_SIZE_PX, pngHeight: QR_SOURCE_SIZE_PX,
    escposRasterBase64: qrEscposRaster.toString('base64'), widthFactor: QR_PDF_WIDTH_FACTOR,
  });

  blocks.push({ kind: 'blank' });
  blocks.push({ kind: 'text', text: 'Danke für Ihren Einkauf!', align: 'center' });

  return blocks;
}
