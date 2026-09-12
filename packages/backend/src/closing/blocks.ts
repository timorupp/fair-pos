/**
 * Builds the neutral print-block list (Task #105) for a Z-Bon (daily
 * closing) — consumed by both `renderBlocksToEscPos` and `renderBlocksToPdf`
 * (see `closing/pdf.ts`), replacing what used to be two independent
 * renderers.
 */

import type { PrintBlock } from '../print/blocks.js';
import type { CompanyLogo } from '../logo/logo.js';
import type { ClosingTotals } from './totals.js';

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
  /** Regelsteuersatz in percent (`vat_rate_standard` setting), for the tax-breakdown row label (Task #110 — was hardcoded "19 %"). */
  vat_rate_standard: number;
  /** Ermäßigter Steuersatz in percent (`vat_rate_reduced` setting), for the tax-breakdown row label (Task #110 — was hardcoded "7 %"). */
  vat_rate_reduced: number;
  /**
   * True when this Z-Bon belongs to a training register (`register.is_training`,
   * Task #130) — the printed Z-Bon gets a prominent "TRAININGSKASSE" marker.
   * Its totals are naturally all zero (`closing/totals.ts` excludes every
   * `receipt_type='training'` invoice), so no computation changes, only the
   * visual marker below.
   */
  is_training: boolean;
}

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
  if (ctx.is_training) {
    blocks.push({ kind: 'text', text: 'TRAININGSKASSE', align: 'center', bold: true, size: 'xlarge' });
    blocks.push({ kind: 'blank' });
  }
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
  blocks.push({ kind: 'row', left: `  ${ctx.vat_rate_standard} %`, right: `${formatEuro(totals.total_tax_standard)} EUR` });
  blocks.push({ kind: 'row', left: `   ${ctx.vat_rate_reduced} %`, right: `${formatEuro(totals.total_tax_reduced)} EUR` });
  blocks.push({ kind: 'row', left: '   0 %', right: `${formatEuro(totals.total_tax_zero)} EUR` });
  blocks.push({ kind: 'row', left: '  Gesamt', right: `${formatEuro(totals.total_gross)} EUR`, bold: true });
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: 'Zahlungsarten', bold: true });
  blocks.push({ kind: 'row', left: '  Bar', right: `${formatEuro(totals.total_cash)} EUR` });
  blocks.push({ kind: 'hr' });

  // Three economically distinct cases (D-068, 2026-09-12), grouped under one
  // heading with a summed "Gesamt" row (Nutzerwunsch 2026-09-12, matches the
  // "Brutto nach MwSt.-Satz" section's style above): Bonstorno is real money
  // paid back (already included in total_gross/total_cash above, shown here
  // only for information), Kostenfrei is goods given away without ever being
  // charged, and stornierte Bestellungen never left the house at all.
  const totalStorno = totals.total_bonstorno + totals.total_free + totals.total_order_cancellations;
  blocks.push({ kind: 'text', text: 'Stornos und kostenfreie Abgabe', bold: true });
  blocks.push({ kind: 'row', left: '  Stornierte Rechnungen', right: `${formatEuro(totals.total_bonstorno)} EUR` });
  blocks.push({ kind: 'row', left: '  Kostenfreie Warenabgabe', right: `${formatEuro(totals.total_free)} EUR` });
  blocks.push({ kind: 'row', left: '  Stornierte Bestellungen', right: `${formatEuro(totals.total_order_cancellations)} EUR` });
  blocks.push({ kind: 'row', left: '  Gesamt', right: `${formatEuro(totalStorno)} EUR`, bold: true });
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'text', text: `Kassen-Seriennr.: ${ctx.system_serial}` });
  blocks.push({ kind: 'blank' });
  blocks.push({ kind: 'text', text: '--- Ende Z-Bon ---', align: 'center' });

  return blocks;
}
