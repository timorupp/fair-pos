/**
 * Builds the `index.xml` manifest that accompanies the DSFinV-K CSV files.
 *
 * The DSFinV-K specification itself does not define the index.xml schema —
 * it defers to the GDPdU/GoBD "Datenträgerüberlassung" companion document
 * (see docs/Rechtliche-Anforderungen.md Abschnitt 6, intro). This module
 * follows the long-established, publicly documented GDPdU index.xml
 * structure (`DataSet` → `Media` → `Table` → `VariableLength`/`Column`) as a
 * best-effort implementation — it has **not** been verified against that
 * specific companion document. Review before relying on this for a real
 * Betriebsprüfung.
 */
import type { DsfinvkExport } from './types.js';

/** Escapes text for inclusion in XML content (not attributes — none of our values need attribute-escaping here). */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds the `index.xml` content describing every CSV file in the export.
 *
 * @param data - The built export (only its keys/column names are used — row content doesn't matter here).
 * @returns The complete `index.xml` file content.
 */
export function buildIndexXml(data: DsfinvkExport): string {
  const tables = (Object.keys(data) as (keyof DsfinvkExport)[])
    .filter((filename) => data[filename].length > 0)
    .map((filename) => {
      const rows = data[filename];
      const columns = Object.keys(rows[0]!);
      const columnXml = columns
        .map((name) => `      <Column><Name>${escapeXml(name)}</Name><Type>AlphaNumeric</Type></Column>`)
        .join('\n');
      return `  <Table>
    <URL>${escapeXml(filename)}</URL>
    <VariableLength>
      <SkipRows>1</SkipRows>
      <TextEncoding>UTF-8</TextEncoding>
      <Separator>;</Separator>
      <RecordDelimiter>\\r\\n</RecordDelimiter>
      <Columns>
${columnXml}
      </Columns>
    </VariableLength>
  </Table>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<DataSet xmlns="http://www.datentraegerueberlassung.de/">
${tables}
</DataSet>
`;
}
