/**
 * PDF renderer for a daily closing (Z-Bon), for in-browser preview.
 *
 * Thin wrapper around the shared block model (Task #105, see
 * `closing/blocks.ts`/`print/blocks.ts`) — mirrors the ESC/POS printout's
 * layout exactly (monospace, no colour) so admins see "the same paper" on
 * screen, by construction rather than by two renderers happening to agree.
 */

import type { CompanyLogo } from '../logo/logo.js';
import type { ClosingTotals } from './totals.js';
import { buildZBonBlocks, type ClosingContext } from './blocks.js';
import { renderBlocksToPdf } from '../print/blocks.js';

/**
 * Renders one Z-Bon as a PDF and resolves with the byte buffer.
 *
 * @param ctx - Closing header context (company, register, Z-number, …).
 * @param totals - Aggregated totals from `computeClosingTotals` / persisted row.
 * @param businessDate - Calendar day (`YYYY-MM-DD`) the Z-Bon belongs to.
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit.
 * @returns Complete PDF byte buffer.
 */
export function renderZBonPdf(
  ctx: ClosingContext, totals: ClosingTotals, businessDate: string, logo: CompanyLogo | null = null,
): Promise<Buffer> {
  return renderBlocksToPdf(buildZBonBlocks(ctx, totals, businessDate, logo), `Z-Bon ${ctx.z_number} (${businessDate})`);
}
