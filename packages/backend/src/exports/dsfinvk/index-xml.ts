/**
 * Builds the `index.xml` manifest (Beschreibungsstandard für die
 * Datenträgerüberlassung) that accompanies the DSFinV-K CSV files.
 *
 * DSFinV-K itself defers index.xml's format to the GDPdU/GoBD companion
 * document "Ergänzende Informationen zur Datenträgerüberlassung" (Anlage zu
 * den GoBD, BMF 28.11.2019), which in turn names Audicon GmbH's technical
 * Beschreibungsstandard as the authoritative source — not itself published
 * by a Behörde. The actual DTD and a full reference `index.xml` are,
 * however, bundled by the Bundeszentralamt für Steuern itself in the
 * official DSFinV-K 2.4 download package (bzst.de, `02_index.xml/`); this
 * module follows that reference exactly (Task #122), replacing an earlier,
 * self-invented schema (`SkipRows`/`TextEncoding`/`Separator`/`Columns` —
 * none of which exist in the real DTD) that was never validated against it.
 *
 * The DTD itself (`gdpdu-01-09-2004.dtd`, vendored in `gdpduDtd.ts`) must be
 * shipped alongside `index.xml` in the export ZIP — see `zip.ts` — since the
 * `<!DOCTYPE>` declaration below doesn't resolve without it on the medium.
 */
import type { DsfinvkExport } from './types.js';

/** Escapes text for inclusion in XML element content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Official DSFinV-K module name per exported file — becomes the Table's `<Name>` (Anhang E, Tz. 3). */
const MODULE_NAMES: Record<keyof DsfinvkExport, string> = {
  'cashpointclosing.csv': 'Stamm_Abschluss',
  'location.csv': 'Stamm_Orte',
  'cashregister.csv': 'Stamm_Kassen',
  'vat.csv': 'Stamm_USt',
  'tse.csv': 'Stamm_TSE',
  'businesscases.csv': 'Z_GV_TYP',
  'payment.csv': 'Z_Zahlart',
  'cash_per_currency.csv': 'Z_WAEHRUNGEN',
  'transactions.csv': 'Bonkopf',
  'allocation_groups.csv': 'Bonkopf_AbrKreis',
  'transactions_vat.csv': 'Bonkopf_USt',
  'datapayment.csv': 'Bonkopf_Zahlarten',
  'lines.csv': 'Bonpos',
  'lines_vat.csv': 'Bonpos_USt',
  'transactions_tse.csv': 'TSE_Transaktionen',
};

/**
 * Decimal places for every column that is `Numeric` per the official
 * DSFinV-K field catalog (Anhang E) — a column absent from this map is
 * `AlphaNumeric`. Every one of these names has the same type in every file
 * it appears in, so one flat map (rather than one per file) is enough.
 * Declaring a *higher* Accuracy than the actual CSV value's decimal count
 * is explicitly safe per the DTD ("undefined" only the other way round), so
 * this uses the spec's own nominal precision regardless of how many
 * decimals FairPOS's `toFixed()` calls currently produce.
 */
const NUMERIC_COLUMNS: Record<string, number> = {
  Z_NR: 0,
  Z_SE_ZAHLUNGEN: 2,
  Z_SE_BARZAHLUNGEN: 2,
  UST_SCHLUESSEL: 0,
  UST_SATZ: 2,
  TSE_ID: 0,
  AGENTUR_ID: 0,
  Z_UMS_BRUTTO: 5,
  Z_UMS_NETTO: 5,
  Z_UST: 5,
  Z_ZAHLART_BETRAG: 2,
  ZAHLART_BETRAG_WAEH: 2,
  BON_NR: 0,
  UMS_BRUTTO: 2,
  BON_BRUTTO: 5,
  BON_NETTO: 5,
  BON_UST: 5,
  ZAHLWAEH_BETRAG: 2,
  BASISWAEH_BETRAG: 2,
  MENGE: 3,
  FAKTOR: 3,
  STK_BR: 5,
  POS_BRUTTO: 5,
  POS_NETTO: 5,
  POS_UST: 5,
  TSE_TANR: 0,
  TSE_TA_SIGZ: 0,
};

/** CRLF as XML character references — a literal `\r`/`\n` in element content is normalised away during XML parsing (per the XML spec's end-of-line handling), which would silently lose the declared line ending. */
const CRLF_ENTITY = '&#13;&#10;';

/** Builds one `<VariableColumn>` element for the given column name. */
function buildColumnXml(name: string): string {
  const decimals = NUMERIC_COLUMNS[name];
  const type = decimals === undefined
    ? '<AlphaNumeric />'
    : decimals === 0
      ? '<Numeric />'
      : `<Numeric><Accuracy>${decimals}</Accuracy></Numeric>`;
  return `        <VariableColumn>
          <Name>${escapeXml(name)}</Name>
          ${type}
        </VariableColumn>`;
}

/** Builds one `<Table>` element for a non-empty CSV file. */
function buildTableXml(filename: keyof DsfinvkExport, columns: string[]): string {
  const columnXml = columns.map(buildColumnXml).join('\n');
  return `    <Table>
      <URL>${escapeXml(filename)}</URL>
      <Name>${escapeXml(MODULE_NAMES[filename])}</Name>
      <UTF8 />
      <DecimalSymbol>.</DecimalSymbol>
      <DigitGroupingSymbol>,</DigitGroupingSymbol>
      <Range>
        <From>2</From>
      </Range>
      <VariableLength>
        <ColumnDelimiter>;</ColumnDelimiter>
        <RecordDelimiter>${CRLF_ENTITY}</RecordDelimiter>
        <TextEncapsulator>"</TextEncapsulator>
${columnXml}
      </VariableLength>
    </Table>`;
}

/**
 * Builds the `index.xml` content describing every non-empty CSV file in the
 * export, per the `gdpdu-01-09-2004.dtd` grammar (vendored in `gdpduDtd.ts`).
 *
 * @param data - The built export (only its keys/column names are used — row content doesn't matter here).
 * @returns The complete `index.xml` file content.
 */
export function buildIndexXml(data: DsfinvkExport): string {
  const tables = (Object.keys(data) as (keyof DsfinvkExport)[])
    .filter((filename) => data[filename].length > 0)
    .map((filename) => buildTableXml(filename, Object.keys(data[filename][0]!)))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">
<DataSet>
  <Version>1.0</Version>
  <DataSupplier>
    <Name />
    <Location />
    <Comment>DSFinV-K-Export FairPOS</Comment>
  </DataSupplier>
  <Media>
    <Name>DSFinV-K-Export</Name>
${tables}
  </Media>
</DataSet>
`;
}
