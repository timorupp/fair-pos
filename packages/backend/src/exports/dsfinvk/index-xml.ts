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
 * `<Description>`/`<MaxLength>` (D-064) and the `BON_ID` `ForeignKey`/
 * `VariablePrimaryKey` linkage (D-063) were added afterwards — see the
 * doc comments on `COLUMN_DESCRIPTIONS` and `BON_ID_FOREIGN_KEYS` below for
 * how each is sourced and why the latter is a voluntary addition rather
 * than "catching up" to the official reference.
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

/** One column's `<Description>` wording and (for `AlphaNumeric` columns only) `<MaxLength>`, both taken verbatim from the official reference `index.xml`. */
interface ColumnMeta {
  description: string;
  maxLength?: number;
}

/**
 * `<Description>`/`<MaxLength>` per column name (D-064), taken verbatim from
 * the official reference `index.xml` bundled in BZSt's DSFinV-K 2.4 download
 * package (bzst.de, `02_index.xml/index.xml`) — grepped per `<Name>COLUMN</Name>`
 * there, never invented (see AGENTS.md "Compliance-Prüfungen gegen offizielle
 * Standards"). `MaxLength` is only ever set for columns that are
 * `AlphaNumeric` here (see `NUMERIC_COLUMNS`) — the DTD forbids it on
 * `Numeric` columns.
 *
 * One flat map suffices because the same column name carries the same
 * Description/MaxLength across every FairPOS file it appears in — confirmed
 * by cross-checking every occurrence — with exactly two genuine exceptions
 * where the reference itself uses different wording per table context; see
 * `COLUMN_DESCRIPTION_OVERRIDES`.
 */
const COLUMN_DESCRIPTIONS: Record<string, ColumnMeta> = {
  ABRECHNUNGSKREIS: { description: 'z. B. Tischnummer', maxLength: 50 },
  AGENTUR_ID: { description: 'ID der Agentur' },
  ARTIKELTEXT: { description: 'Artikeltext', maxLength: 255 },
  ART_NR: { description: 'Artikelnummer', maxLength: 50 },
  BASISWAEH_BETRAG: { description: 'Betrag in Basiswährung (i.d.R. EUR)' },
  BEDIENER_ID: { description: 'Bediener-ID', maxLength: 50 },
  BEDIENER_NAME: { description: 'Bediener-Name', maxLength: 50 },
  BON_BRUTTO: { description: 'Bruttoumsatz' },
  BON_ENDE: { description: 'Zeitpunkt der Vorgangsbeendigung', maxLength: 30 },
  BON_ID: { description: 'Vorgangs-ID', maxLength: 40 },
  BON_NAME: { description: 'Zusatz-Beschreibung zum Bontyp', maxLength: 60 },
  BON_NETTO: { description: 'Nettoumsatz' },
  BON_NOTIZ: { description: 'Zusätzliche Informationen zum Bonkopf', maxLength: 255 },
  BON_NR: { description: 'Bonnummer' },
  BON_START: { description: 'Zeitpunkt des Vorgangsstarts', maxLength: 30 },
  BON_STORNO: { description: 'Storno-Kennzeichen', maxLength: 1 },
  BON_TYP: { description: 'Bontyp', maxLength: 30 },
  BON_UST: { description: 'Umsatzsteuer' },
  EINHEIT: { description: 'Maßeinheit, z. B. kg, Liter oder Stück', maxLength: 50 },
  FAKTOR: { description: 'Faktor, z. B. Gebindegrößen' },
  GTIN: { description: 'GTIN', maxLength: 50 },
  GUTSCHEIN_NR: { description: 'Gutschein-Nr.', maxLength: 50 },
  GV_NAME: { description: 'Name des Geschäftsvorfalls', maxLength: 40 },
  GV_TYP: { description: 'Geschäftsvorfall-Art', maxLength: 30 },
  INHAUS: { description: 'Verzehr an Ort und Stelle', maxLength: 1 },
  KASSE_BASISWAEH_CODE: { description: 'Basiswährung der Kasse', maxLength: 3 },
  KASSE_BRAND: { description: 'Marke der Kasse', maxLength: 50 },
  KASSE_MODELL: { description: 'Modellbezeichnung', maxLength: 50 },
  KASSE_SERIENNR: { description: 'Seriennummer der Kasse', maxLength: 70 },
  KASSE_SW_BRAND: { description: 'Markenbezeichnung der Software', maxLength: 50 },
  KASSE_SW_VERSION: { description: 'Version der Software', maxLength: 50 },
  KEINE_UST_ZUORDNUNG: { description: 'UmsatzsteuerNichtErmittelbar (bei späterem Zahlungseingang)', maxLength: 1 },
  KUNDE_ID: { description: 'Kundennummer des Leistungsempfängers', maxLength: 50 },
  KUNDE_LAND: { description: 'Land des Leistungsempfängers', maxLength: 3 },
  KUNDE_NAME: { description: 'Name des Leistungsempfängers', maxLength: 50 },
  KUNDE_ORT: { description: 'Ort des Leistungsempfängers', maxLength: 62 },
  KUNDE_PLZ: { description: 'PLZ des Leistungsempfängers', maxLength: 10 },
  KUNDE_STRASSE: { description: 'Straße und Hausnummer des Leistungsempfängers', maxLength: 60 },
  KUNDE_TYP: { description: 'Art des Leistungsempfängers (z. B. Mitarbeiter)', maxLength: 50 },
  KUNDE_USTID: { description: 'UStID des Leistungsempfängers', maxLength: 15 },
  LAND: { description: 'Land', maxLength: 3 },
  LOC_LAND: { description: 'Land', maxLength: 3 },
  LOC_NAME: { description: 'Name des Standortes', maxLength: 60 },
  LOC_ORT: { description: 'Ort', maxLength: 62 },
  LOC_PLZ: { description: 'Postleitzahl', maxLength: 10 },
  LOC_STRASSE: { description: 'Straße', maxLength: 60 },
  LOC_USTID: { description: 'USTID', maxLength: 15 },
  MENGE: { description: 'Menge' },
  NAME: { description: 'Name des Unternehmens', maxLength: 60 },
  ORT: { description: 'Ort', maxLength: 62 },
  PLZ: { description: 'Postleitzahl', maxLength: 10 },
  POS_BRUTTO: { description: 'Bruttoumsatz' },
  POS_NETTO: { description: 'Nettoumsatz' },
  POS_TERMINAL_ID: { description: 'ID des POS-Terminals', maxLength: 50 },
  POS_UST: { description: 'Umsatzsteuer' },
  POS_ZEILE: { description: 'Zeilennummer', maxLength: 50 },
  P_STORNO: { description: 'Positionsstorno-Kennzeichnung', maxLength: 1 },
  STK_BR: { description: 'Preis pro Einheit inkl. USt' },
  STNR: { description: 'Steuernummer des Unternehmens', maxLength: 20 },
  STRASSE: { description: 'Straße', maxLength: 60 },
  TAXONOMIE_VERSION: { description: 'Version der DFKA-Taxonomie-Kasse', maxLength: 10 },
  TERMINAL_ID: { description: 'ID des Erfassungsterminals', maxLength: 50 },
  TSE_ID: { description: 'ID der TSE - wird nur zur Referenzierung innerhalb eines Kassenabschlusses verwendet' },
  TSE_PD_ENCODING: { description: 'Das Text-Encoding der ProcessData (UTF-8 oder ASCII)', maxLength: 5 },
  TSE_PUBLIC_KEY: { description: 'Öffentlicher Schlüssel - extrahiert aus dem Zertifikat der TSE - in base64-Codierung', maxLength: 512 },
  TSE_SERIAL: { description: 'Seriennummer der TSE (Entspricht laut TR-03153 Abschnitt 7.5. dem Hashwert des im Zertifikat enthaltenen Schlüssels in Octet-String-Darstellung)', maxLength: 68 },
  TSE_SIG_ALGO: { description: 'Der von der TSE verwendete Signaturalgo-rithmus', maxLength: 21 },
  TSE_TANR: { description: 'Die Transaktionsnummer der TSE-Transaktion' },
  TSE_TA_ENDE: { description: 'Die Log-Time der FinishTransaction-Operation', maxLength: 30 },
  TSE_TA_FEHLER: { description: 'Beschreibung des TSE-Ausfalls oder Fehlers', maxLength: 200 },
  TSE_TA_SIG: { description: 'Die Signatur der FinishTransaction-Operation', maxLength: 512 },
  TSE_TA_SIGZ: { description: 'Der Signaturzähler der FinishTransaction-Operation' },
  TSE_TA_START: { description: 'Die Log-Time der StartTransaction-Operation', maxLength: 30 },
  TSE_TA_VORGANGSART: { description: 'Der processType der FinishTransaction-Operation', maxLength: 30 },
  TSE_VORGANGSDATEN: { description: 'An die zertifizierte technische Sicherheitseinrichtung übergebene Daten des Vorgangs (optional)', maxLength: 1000 },
  TSE_ZEITFORMAT: { description: 'Das von der TSE verwendete Format für die Log-Time - \'unixTime\', \'utcTime\' = YYMMDDhhmmZ, \'utcTimeWithSeconds\' = YYMMDDhhmmssZ, \'generalizedTime\' = YYYYMMDDhhmmssZ, \'generalizedTimeWithMilliseconds\' = YYYYMMDDhhmmss.fffZ', maxLength: 31 },
  TSE_ZERTIFIKAT_I: { description: 'Erste 1000 Zeichen des base64-codierten Zertifikats der TSE (in base64-Codierung)', maxLength: 1000 },
  TSE_ZERTIFIKAT_II: { description: 'Ggf. Rest des base64-codierten Zertifikats der TSE (in base64-Codierung)', maxLength: 1000 },
  UMS_BRUTTO: { description: 'Brutto-Gesamtumsatz' },
  USTID: { description: 'USTID', maxLength: 15 },
  UST_BESCHR: { description: 'Beschreibung', maxLength: 55 },
  UST_SATZ: { description: 'Prozentsatz' },
  UST_SCHLUESSEL: { description: 'ID des USt-Satzes' },
  WARENGR: { description: 'Bezeichnung Warengruppe', maxLength: 50 },
  WARENGR_ID: { description: 'Warengruppen-ID', maxLength: 40 },
  ZAHLART_BETRAG_WAEH: { description: 'Betrag' },
  ZAHLART_NAME: { description: 'Name der Zahlart', maxLength: 60 },
  ZAHLART_TYP: { description: 'Typ der Zahlart', maxLength: 25 },
  ZAHLART_WAEH: { description: 'Währung', maxLength: 3 },
  ZAHLWAEH_BETRAG: { description: 'Betrag in Fremdwährung' },
  ZAHLWAEH_CODE: { description: 'Währungscode', maxLength: 3 },
  Z_BUCHUNGSTAG: { description: 'Vom Erstellungsdatum abweichender Verbuchungstag', maxLength: 25 },
  Z_ENDE_ID: { description: 'Letzte BON_ID im Abschluss', maxLength: 40 },
  Z_ERSTELLUNG: { description: 'Zeitpunkt des Kassenabschlusses', maxLength: 30 },
  Z_KASSE_ID: { description: 'ID der (Abschluss-) Kasse', maxLength: 50 },
  Z_NR: { description: 'Nr. des Kassenabschlusses' },
  Z_SE_BARZAHLUNGEN: { description: 'Summe aller Barzahlungen' },
  Z_SE_ZAHLUNGEN: { description: 'Summe aller Zahlungen' },
  Z_START_ID: { description: 'Erste BON_ID im Abschluss', maxLength: 40 },
  Z_UMS_BRUTTO: { description: 'Bruttoumsatz' },
  Z_UMS_NETTO: { description: 'Nettoumsatz' },
  Z_UST: { description: 'Umsatzsteuer' },
  Z_ZAHLART_BETRAG: { description: 'Betrag' },
};

/**
 * Per-file `<Description>` overrides (D-064) for the two column names where
 * the official reference `index.xml` genuinely uses different wording
 * depending on which table the column appears in — confirmed directly in
 * the reference rather than assumed:
 * - `UST_SCHLUESSEL` reads "ID des Umsatzsteuersatzes" in `vat.csv`
 *   (Stamm_USt, where the rate itself is defined) vs. "ID des USt-Satzes"
 *   everywhere else it's merely referenced.
 * - `TSE_ID` reads "ID der TSE - wird nur zur Referenzierung innerhalb
 *   eines Kassenabschlusses verwendet" in `tse.csv` (Stamm_TSE, the TSE
 *   master row) vs. "Die Id der für eine Transaktion verwendeten TSE" in
 *   `transactions_tse.csv`.
 */
const COLUMN_DESCRIPTION_OVERRIDES: Partial<Record<keyof DsfinvkExport, Record<string, string>>> = {
  'vat.csv': { UST_SCHLUESSEL: 'ID des Umsatzsteuersatzes' },
  'transactions_tse.csv': { TSE_ID: 'Die Id der für eine Transaktion verwendeten TSE' },
};

/**
 * transactions.csv's (Bonkopf) `BON_ID` is the export's only primary key
 * (D-063) — it becomes a `<VariablePrimaryKey>` instead of a plain
 * `<VariableColumn>`; every other file's `BON_ID` stays a `VariableColumn`
 * and, where applicable, gets a `ForeignKey` pointing back at it (see
 * `BON_ID_FOREIGN_KEYS`).
 */
const PRIMARY_KEYS: Partial<Record<keyof DsfinvkExport, string>> = {
  'transactions.csv': 'BON_ID',
};

/**
 * `ForeignKey` links (D-063) from each child file's `BON_ID` column back to
 * `transactions.csv`'s (Bonkopf) `BON_ID` `VariablePrimaryKey` — one entry
 * per file confirmed (via `types.ts`/`rows.ts`) to actually carry a `BON_ID`
 * referencing one Bonkopf/Vorgang row. `lines_vat.csv` deliberately has no
 * entry here even though it also carries `BON_ID`: its natural key is
 * composite (`BON_ID` + `POS_ZEILE`) referencing `Bonpos` (lines.csv), not
 * `Bonkopf` directly — out of scope for this single-column, same-name join.
 *
 * This is a deliberate, DTD-permitted enhancement, **not** something taken
 * from the official reference: BZSt's own reference `index.xml` (bundled in
 * the DSFinV-K 2.4 download package) uses zero `ForeignKey`/`PrimaryKey`
 * elements anywhere across its ~20 tables, confirmed by grepping it
 * directly — the DTD has supported this since v1.5 (2004-09-01), but BZSt's
 * own reference never adopted it. Added here because it costs nothing and
 * makes the BON_ID join machine-readable for any importer that honours it.
 */
const BON_ID_FOREIGN_KEYS: Partial<Record<keyof DsfinvkExport, { column: string; references: string }>> = {
  'lines.csv': { column: 'BON_ID', references: 'Bonkopf' },
  'transactions_vat.csv': { column: 'BON_ID', references: 'Bonkopf' },
  'datapayment.csv': { column: 'BON_ID', references: 'Bonkopf' },
  'transactions_tse.csv': { column: 'BON_ID', references: 'Bonkopf' },
  'allocation_groups.csv': { column: 'BON_ID', references: 'Bonkopf' },
};

/** CRLF as XML character references — a literal `\r`/`\n` in element content is normalised away during XML parsing (per the XML spec's end-of-line handling), which would silently lose the declared line ending. */
const CRLF_ENTITY = '&#13;&#10;';

/**
 * Builds one `<VariableColumn>` element for the given column name — or a
 * `<VariablePrimaryKey>` (identical content model, different role/tag) when
 * `name` is the file's primary key per `PRIMARY_KEYS`.
 *
 * @param filename - The CSV file this column belongs to — needed to resolve
 *   the file's primary key (`PRIMARY_KEYS`) and any per-file Description
 *   override (`COLUMN_DESCRIPTION_OVERRIDES`).
 * @param name - The column name (matches the row object's own key).
 * @returns The complete `<VariableColumn>`/`<VariablePrimaryKey>` markup,
 *   with `<Description>` (and, for `AlphaNumeric` columns, `<MaxLength>`)
 *   from `COLUMN_DESCRIPTIONS` when known.
 */
function buildColumnXml(filename: keyof DsfinvkExport, name: string): string {
  const decimals = NUMERIC_COLUMNS[name];
  const tag = PRIMARY_KEYS[filename] === name ? 'VariablePrimaryKey' : 'VariableColumn';
  const meta = COLUMN_DESCRIPTIONS[name];
  const description = COLUMN_DESCRIPTION_OVERRIDES[filename]?.[name] ?? meta?.description;
  const descriptionXml = description
    ? `\n          <Description>${escapeXml(description)}</Description>`
    : '';
  const type = decimals === undefined
    ? (meta?.maxLength !== undefined
      ? `<AlphaNumeric />\n          <MaxLength>${meta.maxLength}</MaxLength>`
      : '<AlphaNumeric />')
    : decimals === 0
      ? '<Numeric />'
      : `<Numeric><Accuracy>${decimals}</Accuracy></Numeric>`;
  return `        <${tag}>
          <Name>${escapeXml(name)}</Name>${descriptionXml}
          ${type}
        </${tag}>`;
}

/**
 * Builds one `<Table>` element for a non-empty CSV file.
 *
 * @param filename - The DSFinV-K CSV file name (also the `<URL>` and,
 *   per the reference `index.xml`'s own convention, the `<Description>`).
 * @param columns - The row object's own keys, in emission order — reordered
 *   so the file's primary key (if any, per `PRIMARY_KEYS`) comes first, as
 *   the DTD's `VariablePrimaryKey+, VariableColumn*` content model requires.
 * @returns The complete `<Table>` markup, including any `ForeignKey` per
 *   `BON_ID_FOREIGN_KEYS` at the end of its `VariableLength` content.
 */
function buildTableXml(filename: keyof DsfinvkExport, columns: string[]): string {
  const primaryKey = PRIMARY_KEYS[filename];
  const orderedColumns = primaryKey
    ? [primaryKey, ...columns.filter((c) => c !== primaryKey)]
    : columns;
  const columnXml = orderedColumns.map((c) => buildColumnXml(filename, c)).join('\n');

  const foreignKey = BON_ID_FOREIGN_KEYS[filename];
  const foreignKeyXml = foreignKey
    ? `\n        <ForeignKey>
          <Name>${escapeXml(foreignKey.column)}</Name>
          <References>${escapeXml(foreignKey.references)}</References>
        </ForeignKey>`
    : '';

  return `    <Table>
      <URL>${escapeXml(filename)}</URL>
      <Name>${escapeXml(MODULE_NAMES[filename])}</Name>
      <Description>${escapeXml(filename)}</Description>
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
${columnXml}${foreignKeyXml}
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
