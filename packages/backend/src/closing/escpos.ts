/** ESC/POS renderer for the daily-closing (Z-Bon) document. */

import type { ClosingTotals } from './totals.js';
import { SELECT_CP858, escposLine as line } from '../print/escpos-encoding.js';

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// `ESC @` resets the printer; `SELECT_CP858` switches to a code page that
// contains German umlauts + € so we don't have to transliterate.
const INIT      = Buffer.concat([Buffer.from([ESC, 0x40]), SELECT_CP858]);
const CUT       = Buffer.from([GS, 0x56, 0x00]);
const FEED3     = Buffer.from([LF, LF, LF]);
const ALIGN_CTR = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LFT = Buffer.from([ESC, 0x61, 0x00]);
const BOLD_ON   = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF  = Buffer.from([ESC, 0x45, 0x00]);

/** Width of one printed line in characters (Font A, 80 mm). */
const LINE_WIDTH = 42;

/**
 * Selects the ESC/POS print mode (size variation).
 *
 * @param mode - Bit-encoded mode byte (bit 4 = double height, bit 5 = double width).
 * @returns Three bytes encoding the `ESC ! n` sequence.
 */
function selectMode(mode: number): Buffer {
  return Buffer.from([ESC, 0x21, mode]);
}

/** Context surrounding the closing — company data, identifying numbers, timestamp. */
export interface ClosingContext {
  /** Company name printed at the top. */
  company_name: string;
  /** Display name of the register this Z-Bon belongs to. */
  register_name: string;
  /** Cash-register-system serial (FairPOS-{year}-{10}). */
  system_serial: string;
  /** Sequential Z-Bon number for this register. */
  z_number: number;
  /** When the closing was created. */
  created_at: Date;
  /** Number of closings that have ever been printed for this register (Nullstellungszähler). */
  zero_counter: number;
}

/**
 * Builds an ESC/POS byte stream representing a complete Z-Bon document.
 *
 * Layout: optional logo → header → identifiers → totals per tax rate →
 * cash/cancellation block → footer. Output uses CP858 so umlauts print.
 *
 * @param ctx - Surrounding context (company, register, Z-number, timestamp).
 * @param totals - Aggregated totals computed by `computeClosingTotals`.
 * @param logoEscPos - Optional pre-rendered ESC/POS logo raster (`GS v 0` block)
 *   to embed centred at the top. Pass `null` to omit.
 * @returns Raw bytes ready for the print queue.
 */
export function buildZBonEscPos(
  ctx: ClosingContext,
  totals: ClosingTotals,
  logoEscPos: Buffer | null = null,
): Buffer {
  const parts: Buffer[] = [INIT];

  if (logoEscPos) parts.push(ALIGN_CTR, logoEscPos, ALIGN_LFT);
  parts.push(ALIGN_CTR, BOLD_ON, selectMode(0x30), line('Z-BON'), selectMode(0x00), BOLD_OFF);
  parts.push(line(''));
  parts.push(BOLD_ON, line(ctx.company_name), BOLD_OFF);
  parts.push(line(`Kasse: ${ctx.register_name}`));
  parts.push(line(formatGermanDateTime(ctx.created_at)));
  parts.push(line(`Z-Nr.: ${ctx.z_number}   Nullstellungen: ${ctx.zero_counter}`));
  if (totals.is_zero_closing) {
    parts.push(BOLD_ON, line('(Nullabschluss)'), BOLD_OFF);
  }
  parts.push(ALIGN_LFT);
  parts.push(divider());

  // ── Gross by VAT rate ────────────────────────────────────────────────────
  parts.push(BOLD_ON, line('Brutto nach MwSt.-Satz'), BOLD_OFF);
  parts.push(line(twoColumn('  19 %',  formatEuro(totals.total_tax_standard) + ' EUR', LINE_WIDTH)));
  parts.push(line(twoColumn('   7 %',  formatEuro(totals.total_tax_reduced)  + ' EUR', LINE_WIDTH)));
  parts.push(line(twoColumn('   0 %',  formatEuro(totals.total_tax_zero)     + ' EUR', LINE_WIDTH)));
  parts.push(line(twoColumn('  Gesamt', formatEuro(totals.total_gross)        + ' EUR', LINE_WIDTH)));
  parts.push(divider());

  // ── Payment method totals ─────────────────────────────────────────────────
  parts.push(BOLD_ON, line('Zahlungsarten'), BOLD_OFF);
  parts.push(line(twoColumn('  Bar', formatEuro(totals.total_cash) + ' EUR', LINE_WIDTH)));
  parts.push(divider());

  // ── Cancellations / free-of-charge ────────────────────────────────────────
  parts.push(BOLD_ON, line('Stornos / Kostenfrei'), BOLD_OFF);
  parts.push(line(twoColumn('  Summe', formatEuro(totals.total_cancellations) + ' EUR', LINE_WIDTH)));
  parts.push(divider());

  parts.push(line(`Kassen-Seriennr.: ${ctx.system_serial}`));
  parts.push(line(''));
  parts.push(ALIGN_CTR, line('--- Ende Z-Bon ---'), ALIGN_LFT);
  parts.push(FEED3, CUT);
  return Buffer.concat(parts);
}

/**
 * Returns a horizontal divider line at full width.
 *
 * @returns A buffer with `LINE_WIDTH` hyphens followed by LF.
 */
function divider(): Buffer {
  return line('-'.repeat(LINE_WIDTH));
}

/**
 * Pads `right` against the left edge so that `left + right` totals `width` columns.
 * Truncates the left side if necessary.
 *
 * @param left - Label on the left side.
 * @param right - Value on the right side.
 * @param width - Total column width.
 * @returns A single-line string with the two ends aligned.
 */
export function twoColumn(left: string, right: string, width: number): string {
  if (left.length + right.length + 1 > width) {
    const cut = Math.max(0, width - right.length - 1);
    left = left.slice(0, cut).trimEnd();
  }
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}

/**
 * Formats a euro amount as German `1.234,56`. Local copy to keep this module self-contained.
 *
 * @param amount - Numeric amount.
 * @returns The amount with two decimals and a comma separator.
 */
function formatEuro(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats a date as German `DD.MM.YYYY HH:MM:SS`.
 *
 * @param d - The date to format.
 * @returns Day-month-year + 24-h time string.
 */
function formatGermanDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

