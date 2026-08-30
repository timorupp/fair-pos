/** Renders a daily closing (Z-Bon) as a PDF for in-browser preview. */

import PDFDocument from 'pdfkit';
import type { ClosingContext } from './escpos.js';
import type { ClosingTotals } from './totals.js';

/**
 * Renders one Z-Bon onto an A6 page and resolves with the PDF bytes. Mirrors
 * the layout of the ESC/POS variant so admins see "the same paper" on screen.
 *
 * @param ctx - Closing header context (company, register, Z-number, …).
 * @param totals - Aggregated totals from `computeClosingTotals` / persisted row.
 * @param businessDate - Calendar day (`YYYY-MM-DD`) the Z-Bon belongs to.
 * @param logo - Optional logo to embed above the title. Pass `null` to omit.
 * @returns Complete PDF byte buffer.
 */
export async function renderZBonPdf(
  ctx: ClosingContext, totals: ClosingTotals, businessDate: string,
  logo: { pdfPng: Buffer; pdfWidth: number; pdfHeight: number; pdfWidthFactor: number } | null = null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A6', margin: 18,
      info: { Title: `Z-Bon ${ctx.z_number} (${businessDate})` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    layout(doc, ctx, totals, businessDate, logo);
    doc.end();
  });
}

/** Lays out the full Z-Bon onto the document. */
function layout(
  doc: PDFKit.PDFDocument, ctx: ClosingContext, totals: ClosingTotals, businessDate: string,
  logo: { pdfPng: Buffer; pdfWidth: number; pdfHeight: number; pdfWidthFactor: number } | null,
): void {
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x0 = doc.page.margins.left;

  if (logo && logo.pdfWidthFactor > 0 && logo.pdfWidth > 0 && logo.pdfHeight > 0) {
    // Target width comes from the bon width × zoom factor (clamped 0–1), not
    // the PNG's pixel size — same logic as receipt/pdf.ts. PDFKit needs an
    // explicit cursor advance after image(x, y, …).
    const targetWidth  = W * logo.pdfWidthFactor;
    const targetHeight = targetWidth * logo.pdfHeight / logo.pdfWidth;
    const topY = doc.y;
    doc.image(logo.pdfPng, x0 + (W - targetWidth) / 2, topY, { width: targetWidth });
    doc.y = topY + targetHeight;
    doc.moveDown(0.5);
  }

  doc.font('Helvetica-Bold').fontSize(13).text('Z-BON', { align: 'center' });
  doc.moveDown(0.3);

  doc.font('Helvetica-Bold').fontSize(10).text(ctx.company_name, { align: 'center' });
  doc.font('Helvetica').fontSize(8);
  doc.text(`Kasse: ${ctx.register_name}`, { align: 'center' });
  doc.text(`Erstellt: ${formatGermanDateTime(ctx.created_at)}`, { align: 'center' });
  doc.text(`Geschäftstag: ${formatGermanDate(businessDate)}`, { align: 'center' });
  doc.text(`Z-Nr. ${ctx.z_number}    Nullstellungen: ${ctx.zero_counter}`, { align: 'center' });
  if (totals.is_zero_closing) {
    doc.font('Helvetica-Bold').fillColor('#a00').text('(Nullabschluss)', { align: 'center' }).fillColor('black').font('Helvetica');
  }
  doc.moveDown(0.3);
  hr(doc, W);

  // Gross by VAT rate.
  doc.font('Helvetica-Bold').fontSize(9).text('Brutto nach MwSt.-Satz');
  doc.font('Helvetica').fontSize(8);
  twoCol(doc, W, '  19 %', formatEuro(totals.total_tax_standard) + ' €');
  twoCol(doc, W, '   7 %', formatEuro(totals.total_tax_reduced)  + ' €');
  twoCol(doc, W, '   0 %', formatEuro(totals.total_tax_zero)     + ' €');
  doc.font('Helvetica-Bold').fontSize(9);
  twoCol(doc, W, '  Gesamt', formatEuro(totals.total_gross) + ' €');
  doc.font('Helvetica').fontSize(8);
  doc.moveDown(0.3); hr(doc, W);

  doc.font('Helvetica-Bold').fontSize(9).text('Zahlungsarten');
  doc.font('Helvetica').fontSize(8);
  twoCol(doc, W, '  Bar', formatEuro(totals.total_cash) + ' €');
  doc.moveDown(0.3); hr(doc, W);

  doc.font('Helvetica-Bold').fontSize(9).text('Stornos / Kostenfrei');
  doc.font('Helvetica').fontSize(8);
  twoCol(doc, W, '  Summe', formatEuro(totals.total_cancellations) + ' €');
  doc.moveDown(0.3); hr(doc, W);

  doc.fontSize(7).text(`Kassen-Seriennr.: ${ctx.system_serial}`);
}

/**
 * Writes a two-column row (left label, right value) at the current y.
 *
 * Important: PDFKit moves `doc.x` after each `text()` call, so we MUST anchor
 * both columns off `doc.page.margins.left` (a fixed value) rather than off
 * `doc.x`. Otherwise the second column lands wherever the first call ended up
 * — which is what produced the "19 % left, 7 % middle, 0 % right" zigzag in
 * the previous version.
 *
 * After writing both columns, we reset `doc.x` to the left margin so any
 * subsequent `doc.text(s)` (no explicit x/y) starts on a fresh line at the
 * left edge.
 */
function twoCol(doc: PDFKit.PDFDocument, W: number, left: string, right: string): void {
  const x0 = doc.page.margins.left;
  const y = doc.y;
  doc.text(left,  x0,         y, { width: W / 2 });
  doc.text(right, x0 + W / 2, y, { width: W / 2, align: 'right' });
  doc.x = x0;
}

/** Draws a faint divider across the printable width. */
function hr(doc: PDFKit.PDFDocument, w: number): void {
  const y = doc.y;
  doc.strokeColor('#cccccc').lineWidth(0.5)
    .moveTo(doc.x, y).lineTo(doc.x + w, y).stroke()
    .strokeColor('black');
  doc.moveDown(0.2);
}

/** Formats a number as German `1.234,56`. */
function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formats a `YYYY-MM-DD` string as `DD.MM.YYYY`. */
function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Formats a Date as German `DD.MM.YYYY HH:MM:SS`. */
function formatGermanDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
