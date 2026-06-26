/** ESC/POS renderer for a full customer receipt. Mirrors the PDF layout but emits printer bytes. */

import type { ReceiptData } from './types.js';
import { formatEuro, formatEuroLabel, formatGermanDateTime, formatTaxRate } from './format.js';
import { SELECT_CP858, escposLine as line } from '../print/escpos-encoding.js';

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// `ESC @` resets the printer; `SELECT_CP858` then switches it to a code page
// that contains the German umlauts and the Euro sign. Done once per document.
const INIT      = Buffer.concat([Buffer.from([ESC, 0x40]), SELECT_CP858]);
const CUT       = Buffer.from([GS, 0x56, 0x00]);
const FEED3     = Buffer.from([LF, LF, LF]);
const ALIGN_CTR = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LFT = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_RGT = Buffer.from([ESC, 0x61, 0x02]);
const BOLD_ON   = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF  = Buffer.from([ESC, 0x45, 0x00]);

/** ESC ! n — print mode; bit 4 = double height, bit 5 = double width. */
function selectMode(mode: number): Buffer {
  return Buffer.from([ESC, 0x21, mode]);
}

/** Width assumed for a standard 80 mm thermal printer (Font A, 12 cpi). */
const LINE_WIDTH = 42;

/**
 * Builds an ESC/POS byte sequence representing a complete receipt.
 *
 * Encoding is ASCII — characters above 0x7F (umlauts, ß) are best-effort replaced
 * by ASCII equivalents. The renderer chooses ASCII over CP-437/CP-858 to avoid
 * encoding mismatches across printer models; the trade-off is acceptable for
 * production receipts because the canonical document is the PDF.
 */
export function buildReceiptEscPos(d: ReceiptData): Buffer {
  const parts: Buffer[] = [INIT];

  // ── Logo ───────────────────────────────────────────────────────────────────
  // Pre-rendered raster (GS v 0) — the centring is done by the printer when we
  // emit it inside an ALIGN_CTR block.
  if (d.logoEscPos) {
    parts.push(ALIGN_CTR, d.logoEscPos, ALIGN_LFT);
  }

  // ── Cancellation banner ────────────────────────────────────────────────────
  // ESC/POS has no colour, so STORNOBELEG goes on a separate oversized line
  // at the very top and the metadata label below is also flipped.
  if (d.isCancellation) {
    parts.push(ALIGN_CTR, BOLD_ON, selectMode(0x30), line('STORNOBELEG'), selectMode(0x00), BOLD_OFF);
    parts.push(line(''));
  }

  // ── Company header ─────────────────────────────────────────────────────────
  parts.push(ALIGN_CTR, BOLD_ON, selectMode(0x10), line(d.companyName), selectMode(0x00), BOLD_OFF);
  for (const addrLine of d.companyAddressLines) parts.push(line(addrLine));
  parts.push(line(`Steuernummer: ${d.taxNumber}`));
  if (d.vatId) parts.push(line(`USt-IdNr.: ${d.vatId}`));
  parts.push(line(''));

  // ── Receipt metadata ───────────────────────────────────────────────────────
  parts.push(BOLD_ON, line(`${d.isCancellation ? 'Stornobeleg' : 'Beleg'} ${d.receiptNumber}`), BOLD_OFF);
  parts.push(line(formatGermanDateTime(d.createdAt)));
  parts.push(line(`Kasse: ${d.registerName}    Zahlung: ${d.paymentMethod === 'cash' ? 'Bar' : 'Karte'}`));
  parts.push(ALIGN_LFT, divider());

  // ── Positions ──────────────────────────────────────────────────────────────
  for (const p of d.positions) {
    const left  = `${p.quantity}x ${p.name}`;
    const right = formatEuro(p.lineGross);
    parts.push(line(twoColumn(left, right, LINE_WIDTH)));
    if (p.unitDeposit !== null && p.unitDeposit !== 0) {
      parts.push(line(`     a ${formatEuro(p.unitPrice)} + Pfand ${formatEuro(p.unitDeposit)}`));
    }
  }
  parts.push(divider());

  // ── Total ──────────────────────────────────────────────────────────────────
  parts.push(BOLD_ON, selectMode(0x20));
  parts.push(line(twoColumn('Gesamt', formatEuroLabel(d.totalGross), Math.floor(LINE_WIDTH / 2))));
  parts.push(selectMode(0x00), BOLD_OFF);

  // ── VAT breakdown ──────────────────────────────────────────────────────────
  for (const row of d.taxBreakdown) {
    parts.push(line(
      twoColumn(
        `MwSt ${formatTaxRate(row.rate)}`,
        `Netto ${formatEuro(row.net)}  Steuer ${formatEuro(row.tax)}`,
        LINE_WIDTH,
      ),
    ));
  }
  parts.push(divider());

  // ── TSE block ──────────────────────────────────────────────────────────────
  parts.push(BOLD_ON, line('TSE-Daten'), BOLD_OFF);
  parts.push(line(`Kassen-Seriennr.: ${d.systemSerial}`));
  if (d.tseSerial) parts.push(line(`TSE-Seriennr.: ${d.tseSerial}`));
  if (d.tseTransactionNumber !== null) parts.push(line(`Transaktionsnr.: ${d.tseTransactionNumber}`));
  if (d.tseSignatureCounter !== null) parts.push(line(`Signaturzähler: ${d.tseSignatureCounter}`));
  if (d.tseStartTime) parts.push(line(`Start: ${formatGermanDateTime(d.tseStartTime)}`));
  if (d.tseEndTime) parts.push(line(`Ende:  ${formatGermanDateTime(d.tseEndTime)}`));
  if (d.tseSignature) {
    // Long signatures will wrap automatically across printer columns.
    parts.push(line(`Signatur: ${d.tseSignature}`));
  } else {
    parts.push(line('Signatur: ! TSE noch nicht aktiv'));
  }

  parts.push(ALIGN_CTR, line(''), line('Danke für Ihren Einkauf!'), ALIGN_LFT, FEED3, CUT);
  return Buffer.concat(parts);
}

/** Renders a horizontal divider made of hyphens at full line width. */
function divider(): Buffer {
  return line('-'.repeat(LINE_WIDTH));
}

/** Left-pads `right` so that `left + right` fills `width` columns. Truncates the left side if necessary. */
export function twoColumn(left: string, right: string, width: number): string {
  if (left.length + right.length + 1 > width) {
    const cut = Math.max(0, width - right.length - 1);
    left = left.slice(0, cut).trimEnd();
  }
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}
