/**
 * Renders a `ReceiptData` object as a PDF (A6 portrait — fits comfortably on a phone
 * after the customer scans the QR code, and prints cleanly on plain paper).
 *
 * The renderer is intentionally simple-text-only (no images, no custom fonts) so it
 * works without bundling font files. Helvetica covers German umlauts via WinAnsi.
 */

import PDFDocument from 'pdfkit';
import type { ReceiptData } from './types.js';
import {
  formatEuro, formatEuroLabel, formatGermanDateTime, formatTaxRate,
} from './format.js';
import { buildQrPayload, renderQrPng } from './qr.js';

/** Renders the receipt PDF and resolves with the complete byte buffer. */
export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  const qrPng = await renderQrPng(buildQrPayload(data), 220);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 18, info: { Title: data.receiptNumber } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    layout(doc, data, qrPng);
    doc.end();
  });
}

/** Lays out one full receipt onto the document. Kept separate so the byte-pump above stays small. */
function layout(doc: PDFKit.PDFDocument, d: ReceiptData, qrPng: Buffer): void {
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  // PDFKit shifts `doc.x` after every `text()` call. For multi-column rows we
  // must anchor all column x-positions off a fixed value (the left margin),
  // not off `doc.x` — otherwise the second column starts wherever the first
  // call ended up. See the corresponding fix in `closing/pdf.ts`.
  const x0 = doc.page.margins.left;

  // ── Logo ───────────────────────────────────────────────────────────────────
  // Optional centred logo above the company name. Width is capped so the
  // receipt header doesn't blow up if the operator uploaded a huge image.
  //
  // PDFKit does NOT advance `doc.y` when `image()` is called with an explicit
  // (x, y) — only the implicit-position form moves the cursor. So we compute
  // the rendered height from the source aspect ratio and bump `doc.y` ourselves;
  // otherwise the company-name line would overdraw the logo.
  if (d.logoPng && d.logoWidth > 0 && d.logoHeight > 0) {
    const targetWidth  = Math.min(d.logoWidth, W);
    const targetHeight = targetWidth * d.logoHeight / d.logoWidth;
    const topY = doc.y;
    doc.image(d.logoPng, x0 + (W - targetWidth) / 2, topY, { width: targetWidth });
    doc.y = topY + targetHeight;
    doc.moveDown(0.5);
  }

  // ── Cancellation banner ────────────────────────────────────────────────────
  // For cancellation invoices we lead with a clearly red, oversized
  // "STORNOBELEG" line so the document cannot be confused with a sales receipt.
  if (d.isCancellation) {
    doc.fillColor('#a00').font('Helvetica-Bold').fontSize(16).text('STORNOBELEG', { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(0.3);
  }

  // ── Company header ─────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(11).text(d.companyName, { align: 'center' });
  doc.font('Helvetica').fontSize(8);
  for (const line of d.companyAddressLines) doc.text(line, { align: 'center' });
  doc.text(`Steuernummer: ${d.taxNumber}`, { align: 'center' });
  if (d.vatId) doc.text(`USt-IdNr.: ${d.vatId}`, { align: 'center' });
  doc.moveDown(0.5);

  // ── Receipt metadata ───────────────────────────────────────────────────────
  const headerLabel = d.isCancellation ? `Stornobeleg ${d.receiptNumber}` : `Beleg ${d.receiptNumber}`;
  doc.font('Helvetica-Bold').fontSize(9).text(headerLabel, { align: 'center' });
  doc.font('Helvetica').fontSize(8);
  doc.text(formatGermanDateTime(d.createdAt), { align: 'center' });
  doc.text(`Kasse: ${d.registerName}`, { align: 'center' });
  doc.text(`Zahlung: ${d.paymentMethod === 'cash' ? 'Bar' : 'Karte'}`, { align: 'center' });
  doc.moveDown(0.4);

  // ── Positions table ────────────────────────────────────────────────────────
  hr(doc, W);
  const cols = { qty: 28, name: 80, total: W - 28 - 80 - 4 };
  doc.fontSize(7).font('Helvetica-Bold');
  const headerY = doc.y;
  doc.text('Anz',     x0,                                  headerY, { width: cols.qty });
  doc.text('Artikel', x0 + cols.qty,                       headerY, { width: cols.name });
  doc.text('Summe',   x0 + cols.qty + cols.name + 4,       headerY, { width: cols.total, align: 'right' });
  doc.x = x0;
  doc.moveDown(0.3);
  hr(doc, W);

  doc.font('Helvetica').fontSize(8);
  for (const p of d.positions) {
    const lineY = doc.y;
    doc.text(`${p.quantity}×`,            x0,                            lineY, { width: cols.qty });
    doc.text(p.name,                      x0 + cols.qty,                 lineY, { width: cols.name });
    doc.text(formatEuro(p.lineGross),     x0 + cols.qty + cols.name + 4, lineY, { width: cols.total, align: 'right' });
    doc.x = x0;

    // Show the per-unit / deposit breakdown indented when the position carries a deposit
    if (p.unitDeposit !== null && p.unitDeposit !== 0) {
      doc.fontSize(7).fillColor('#666666');
      doc.text(`  à ${formatEuro(p.unitPrice)} + Pfand ${formatEuro(p.unitDeposit)}`, x0 + cols.qty, doc.y, {
        width: cols.name + cols.total + 4,
      });
      doc.fillColor('black').fontSize(8);
      doc.x = x0;
    }
  }
  doc.moveDown(0.3);
  hr(doc, W);

  // ── Total ──────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10);
  const totalY = doc.y;
  doc.text('Gesamt',                       x0,           totalY, { width: W / 2 });
  doc.text(formatEuroLabel(d.totalGross),  x0 + W / 2,   totalY, { width: W / 2, align: 'right' });
  doc.x = x0;
  doc.moveDown(0.4);

  // ── VAT breakdown ──────────────────────────────────────────────────────────
  doc.font('Helvetica').fontSize(7);
  for (const row of d.taxBreakdown) {
    const y = doc.y;
    doc.text(`MwSt ${formatTaxRate(row.rate)}`, x0,         y, { width: 70 });
    doc.text(`Netto ${formatEuro(row.net)}`,    x0 + 70,    y, { width: 70 });
    doc.text(`Steuer ${formatEuro(row.tax)}`,   x0 + 140,   y, { width: W - 140, align: 'right' });
    doc.x = x0;
  }
  doc.moveDown(0.4);

  // ── TSE block ──────────────────────────────────────────────────────────────
  hr(doc, W);
  doc.font('Helvetica-Bold').fontSize(7).text('TSE-Daten');
  doc.font('Helvetica').fontSize(6.5);
  doc.text(`Kassensystem-Seriennr.: ${d.systemSerial}`);
  if (d.tseSerial) doc.text(`TSE-Seriennr.: ${d.tseSerial}`);
  if (d.tseTransactionNumber !== null) doc.text(`Transaktionsnr.: ${d.tseTransactionNumber}`);
  if (d.tseSignatureCounter !== null) doc.text(`Signaturzähler: ${d.tseSignatureCounter}`);
  if (d.tseStartTime) doc.text(`Start: ${formatGermanDateTime(d.tseStartTime)}`);
  if (d.tseEndTime) doc.text(`Ende:  ${formatGermanDateTime(d.tseEndTime)}`);
  if (d.tseSignature) {
    // Signatures are long — wrap them so they fit in the narrow column.
    doc.text(`Signatur: ${d.tseSignature}`, { width: W });
  } else {
    doc.fillColor('#a00').text('Signatur: ⚠ TSE noch nicht aktiv', { width: W }).fillColor('black');
  }
  doc.moveDown(0.4);

  // ── QR code ────────────────────────────────────────────────────────────────
  const qrSize = 90;
  const qrX = doc.page.margins.left + (W - qrSize) / 2;
  doc.image(qrPng, qrX, doc.y, { width: qrSize, height: qrSize });
}

/** Draws a faint horizontal divider across the printable width and advances `doc.y` slightly. */
function hr(doc: PDFKit.PDFDocument, w: number): void {
  const y = doc.y;
  doc.strokeColor('#cccccc').lineWidth(0.5)
    .moveTo(doc.x, y).lineTo(doc.x + w, y).stroke()
    .strokeColor('black');
  doc.moveDown(0.2);
}
