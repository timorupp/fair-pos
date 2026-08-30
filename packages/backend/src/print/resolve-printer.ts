/** Helper: resolves which printer to send a print job to. */

import { query } from '../db/client.js';

/**
 * Returns the printer id a given register should print receipts on.
 *
 * Resolution order:
 *  1. The register's own `printer_id`, if assigned.
 *  2. The system-wide default printer (`is_default = true`).
 *  3. `null` — no printer available at all.
 *
 * @param registerId - The register whose receipts need a target printer.
 * @returns The resolved printer id, or `null` if no printer exists in the system.
 */
export async function resolvePrinterForRegister(registerId: string): Promise<string | null> {
  const result = await query<{ register_printer: string | null; default_printer: string | null }>(
    `SELECT r.printer_id AS register_printer,
            (SELECT id FROM printer WHERE is_default = true LIMIT 1) AS default_printer
       FROM register r
      WHERE r.id = $1`,
    [registerId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0]!.register_printer ?? result.rows[0]!.default_printer;
}
