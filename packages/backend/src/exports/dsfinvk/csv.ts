/**
 * CSV serialisation for the DSFinV-K export.
 *
 * The DSFinV-K specification itself does not fix a field separator or file
 * encoding — it defers to a separate companion document ("Ergänzende
 * Informationen zur Datenträgerüberlassung", an Anlage to the GoBD). That
 * BMF letter in turn names Audicon GmbH's technical Beschreibungsstandard as
 * the authoritative source; the official DSFinV-K 2.4 download package
 * (bzst.de) bundles that standard's actual DTD and a reference `index.xml`,
 * which confirm semicolon-separated, UTF-8, CRLF-terminated, header-row CSV
 * as the correct format this module already produces (Task #122) — see
 * `index-xml.ts` for the `index.xml` side of that verification.
 */

/** Escapes a single CSV field: wraps in quotes and doubles inner quotes if it contains the separator, a quote, or a line break. */
function escapeField(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialises an array of flat row objects into a semicolon-separated CSV
 * string with a header row (the object keys, in their declared order) and
 * CRLF line endings.
 *
 * @param rows - Row objects; every value is coerced to a string via `String()`.
 * @returns The complete CSV file content (no trailing newline after the last row's CRLF).
 */
export function toCsv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return '';
  const header = Object.keys(rows[0]!) as (keyof T)[];
  const lines = [header.map((key) => escapeField(String(key))).join(';')];
  for (const row of rows) {
    lines.push(header.map((key) => escapeField(String(row[key]))).join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}
