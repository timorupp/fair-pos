import { api } from './api';

/**
 * Formats the heading shown on every table page of the Bedienungskasse
 * (Task #158) — always "Tisch <Name>", so the operator always sees which
 * table they are working on. Falls back to plain "Tisch" while the name is
 * unknown.
 *
 * @param tableName - The table's name, or `null`/empty if not (yet) known.
 * @returns The heading text, e.g. `Tisch A1`.
 */
export function formatTableHeading(tableName: string | null): string {
  return tableName ? `Tisch ${tableName}` : 'Tisch';
}

/**
 * Loads a table's name and formats it as the page heading. Never throws: a
 * failed lookup only costs the table number in the heading, not the page.
 *
 * @param registerId - The register the table page belongs to.
 * @param tableId - The table to look up.
 * @returns The heading text, e.g. `Tisch A1`, or `Tisch` on failure.
 */
export async function loadTableHeading(registerId: string, tableId: string): Promise<string> {
  try {
    const table = await api.registerSession.table(registerId, tableId);
    return formatTableHeading(table.name);
  } catch {
    return formatTableHeading(null);
  }
}
