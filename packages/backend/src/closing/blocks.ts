/**
 * Builds the neutral print-block list (Task #105) for a Z-Bon (daily
 * closing) — consumed by both `renderBlocksToEscPos` and `renderBlocksToPdf`,
 * replacing the two previously-independent renderers in `escpos.ts`/`pdf.ts`.
 */

import type { PrintBlock } from '../print/blocks.js';
import type { CompanyLogo } from '../logo/logo.js';
import type { ClosingContext } from './escpos.js';
import type { ClosingTotals } from './totals.js';

/** Formats a euro amount as German `1.234,56`. Local copy, matches the pre-migration renderers' own wording (` EUR`, not `€` — kept as-is, not unified with the receipt's `€` symbol; that's a separate wording choice, not part of Task #105's scope). */
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

/**
 * Builds the complete block list for one Z-Bon.
 *
 * @param ctx - Closing header context (company, register, Z-number, …).
 * @param totals - Aggregated totals from `computeClosingTotals` / persisted row.
 * @param businessDate - Calendar day (`YYYY-MM-DD`) the Z-Bon belongs to.
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit.
 * @returns Blocks in print order, ready for either renderer.
 */
export function buildZBonBlocks(
  ctx: ClosingContext, totals: ClosingTotals, businessDate: string, logo: CompanyLogo | null,
): PrintBlock[] {
  const blocks: PrintBlock[] = [];

  if (logo) {
    blocks.push({
      kind: 'image',
      pngBase64: logo.pdfPng.toString('base64'), pngWidth: logo.pdfWidth, pngHeight: logo.pdfHeight,
      escposRasterBase64: logo.escposBytes.toString('base64'), widthFactor: logo.pdfWidthFactor,
    });
  }

  blocks.push({ kind: 'text', text: 'Z-BON', align: 'center', bold: true, size: 'xlarge' });
  blocks.push({ kind: 'blank' });
  blocks.push({ kind: 'text', text: ctx.company_name, align: 'center', bold: true });
  blocks.push({ kind: 'text', text: `Kasse: ${ctx.register_name}`, align: 'center' });
  blocks.push({ kind: 'text', text: formatGermanDateTime(ctx.created_at), align: 'center' });
  blocks.push({ kind: 'text', text: `Geschäftstag: ${formatGermanDate(businessDate)}`, align: 'center' });
  blocks.push({
    kind: 'text',
    text: `Z-Nr.: ${ctx.z_number}   Nullstellungen: ${ctx.zero_counter}`,
    align: 'center',
  });
  if (totals.is_zero_closing) {
    blocks.push({ kind: 'text', text: '(Nullabschluss)', align: 'center', bold: true });
  }
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: 'Brutto nach MwSt.-Satz', bold: true });
  blocks.push({ kind: 'row', left: '  19 %', right: `${formatEuro(totals.total_tax_standard)} EUR` });
  blocks.push({ kind: 'row', left: '   7 %', right: `${formatEuro(totals.total_tax_reduced)} EUR` });
  blocks.push({ kind: 'row', left: '   0 %', right: `${formatEuro(totals.total_tax_zero)} EUR` });
  blocks.push({ kind: 'row', left: '  Gesamt', right: `${formatEuro(totals.total_gross)} EUR`, bold: true });
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: 'Zahlungsarten', bold: true });
  blocks.push({ kind: 'row', left: '  Bar', right: `${formatEuro(totals.total_cash)} EUR` });
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: 'Stornos / Kostenfrei', bold: true });
  blocks.push({ kind: 'row', left: '  Summe', right: `${formatEuro(totals.total_cancellations)} EUR` });
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: `Kassen-Seriennr.: ${ctx.system_serial}` });
  blocks.push({ kind: 'blank' });
  blocks.push({ kind: 'text', text: '--- Ende Z-Bon ---', align: 'center' });

  return blocks;
}
