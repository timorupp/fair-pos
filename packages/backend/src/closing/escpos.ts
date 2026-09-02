/**
 * ESC/POS renderer for the daily-closing (Z-Bon) document.
 *
 * Thin wrapper around the shared block model (Task #105, see
 * `closing/blocks.ts`/`print/blocks.ts`) — byte-level rendering is shared
 * with `closing/pdf.ts`, which now produces a PDF that matches this
 * printout's layout instead of an independently-drifting one.
 */

import type { CompanyLogo } from '../logo/logo.js';
import type { ClosingTotals } from './totals.js';
import { buildZBonBlocks } from './blocks.js';
import { renderBlocksToEscPos } from '../print/blocks.js';

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
 * @param ctx - Surrounding context (company, register, Z-number, timestamp).
 * @param totals - Aggregated totals computed by `computeClosingTotals`.
 * @param businessDate - Calendar day (`YYYY-MM-DD`) the Z-Bon belongs to.
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit.
 * @returns Raw bytes ready for the print queue.
 */
export function buildZBonEscPos(
  ctx: ClosingContext,
  totals: ClosingTotals,
  businessDate: string,
  logo: CompanyLogo | null = null,
): Buffer {
  return renderBlocksToEscPos(buildZBonBlocks(ctx, totals, businessDate, logo));
}
