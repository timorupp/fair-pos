/**
 * Unit tests for the `index.xml` builder — verifies the generated markup
 * against the official `gdpdu-01-09-2004.dtd` grammar (Task #122), plus the
 * `Description`/`MaxLength` (D-064) and `BON_ID` `ForeignKey`/
 * `VariablePrimaryKey` (D-063) additions.
 */
import { describe, it, expect } from 'vitest';
import { buildIndexXml } from './index-xml.js';
import type { DsfinvkExport } from './types.js';

/** A minimal but structurally complete DsfinvkExport with two non-empty tables and the rest empty. */
function minimalExport(): DsfinvkExport {
  return {
    'cashpointclosing.csv': [{
      Z_KASSE_ID: 'k1', Z_ERSTELLUNG: '2026-08-05T20:00:00.000Z', Z_NR: 1,
      Z_BUCHUNGSTAG: '2026-08-05', TAXONOMIE_VERSION: '2.4', Z_START_ID: 'a', Z_ENDE_ID: 'b',
      NAME: 'Testverein', STRASSE: 'Hauptstr. 1', PLZ: '12345', ORT: 'Musterstadt', LAND: 'DEU',
      STNR: '12/345/67890', USTID: '', Z_SE_ZAHLUNGEN: '5.00', Z_SE_BARZAHLUNGEN: '5.00',
    }],
    'location.csv': [],
    'cashregister.csv': [],
    'vat.csv': [],
    'tse.csv': [],
    'businesscases.csv': [],
    'payment.csv': [],
    'cash_per_currency.csv': [],
    'transactions.csv': [{
      Z_KASSE_ID: 'k1', Z_ERSTELLUNG: '2026-08-05T20:00:00.000Z', Z_NR: 1,
      BON_ID: 'v-1', BON_NR: 42, BON_TYP: 'Beleg', BON_NAME: '', TERMINAL_ID: 'reg-1',
      BON_STORNO: '0', BON_START: '2026-08-05T18:00:00.000Z', BON_ENDE: '2026-08-05T18:00:00.000Z',
      BEDIENER_ID: '', BEDIENER_NAME: 'Anna', UMS_BRUTTO: '5.00',
      KUNDE_NAME: '', KUNDE_ID: '', KUNDE_TYP: '', KUNDE_STRASSE: '', KUNDE_PLZ: '',
      KUNDE_ORT: '', KUNDE_LAND: '', KUNDE_USTID: '', BON_NOTIZ: '',
    }],
    'allocation_groups.csv': [],
    'transactions_vat.csv': [],
    'datapayment.csv': [],
    'lines.csv': [{
      Z_KASSE_ID: 'k1', Z_ERSTELLUNG: '2026-08-05T20:00:00.000Z', Z_NR: 1,
      BON_ID: 'v-1', POS_ZEILE: '1', GUTSCHEIN_NR: '', ARTIKELTEXT: 'Bier',
      POS_TERMINAL_ID: 'reg-1', GV_TYP: 'Umsatz', GV_NAME: '', INHAUS: '1',
      P_STORNO: '0', AGENTUR_ID: 0, ART_NR: 'a-1', GTIN: '', WARENGR_ID: 'Getränke',
      WARENGR: 'Getränke', MENGE: '1.000', FAKTOR: '1.000', EINHEIT: 'Stück', STK_BR: '5.00',
    }],
    'lines_vat.csv': [],
    'transactions_tse.csv': [],
  };
}

describe('buildIndexXml', () => {
  it('declares the gdpdu-01-09-2004.dtd DOCTYPE', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">');
  });

  it('omits empty tables and includes exactly the non-empty ones', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<URL>cashpointclosing.csv</URL>');
    expect(xml).toContain('<URL>transactions.csv</URL>');
    expect(xml).toContain('<URL>lines.csv</URL>');
    expect(xml).not.toContain('<URL>vat.csv</URL>');
    expect(xml).not.toContain('<URL>lines_vat.csv</URL>');
  });

  it('declares UTF8 and the DecimalSymbol/DigitGroupingSymbol matching the actual dot-decimal CSV content', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<UTF8 />');
    expect(xml).toContain('<DecimalSymbol>.</DecimalSymbol>');
    expect(xml).toContain('<DigitGroupingSymbol>,</DigitGroupingSymbol>');
  });

  it('skips the header row via Range/From=2 instead of the old invented SkipRows element', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<Range>\n        <From>2</From>\n      </Range>');
    expect(xml).not.toContain('SkipRows');
    expect(xml).not.toContain('TextEncoding');
    expect(xml).not.toContain('<Separator>');
  });

  it('declares the correct ColumnDelimiter/RecordDelimiter/TextEncapsulator', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<ColumnDelimiter>;</ColumnDelimiter>');
    expect(xml).toContain('<RecordDelimiter>&#13;&#10;</RecordDelimiter>');
    expect(xml).toContain('<TextEncapsulator>"</TextEncapsulator>');
  });

  it('marks Z_NR/BON_NR/UMS_BRUTTO as Numeric (with no MaxLength) and text fields as AlphaNumeric', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<Name>Z_NR</Name>\n          <Description>Nr. des Kassenabschlusses</Description>\n          <Numeric />');
    expect(xml).toContain('<Name>BON_NR</Name>\n          <Description>Bonnummer</Description>\n          <Numeric />');
    expect(xml).toContain('<Name>UMS_BRUTTO</Name>\n          <Description>Brutto-Gesamtumsatz</Description>\n          <Numeric><Accuracy>2</Accuracy></Numeric>');
    expect(xml).not.toContain('UMS_BRUTTO</Name>\n          <Description>Brutto-Gesamtumsatz</Description>\n          <Numeric><Accuracy>2</Accuracy></Numeric>\n          <MaxLength>');
    expect(xml).toContain('<Name>BEDIENER_NAME</Name>\n          <Description>Bediener-Name</Description>\n          <AlphaNumeric />\n          <MaxLength>50</MaxLength>');
  });

  it('uses the official DSFinV-K module name as each Table\'s Name', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<URL>cashpointclosing.csv</URL>\n      <Name>Stamm_Abschluss</Name>');
    expect(xml).toContain('<URL>transactions.csv</URL>\n      <Name>Bonkopf</Name>');
  });

  it('adds a Table-level Description that is the file\'s own name, per the reference index.xml\'s convention (D-064)', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<URL>cashpointclosing.csv</URL>\n      <Name>Stamm_Abschluss</Name>\n      <Description>cashpointclosing.csv</Description>');
    expect(xml).toContain('<URL>transactions.csv</URL>\n      <Name>Bonkopf</Name>\n      <Description>transactions.csv</Description>');
  });

  it('uses the exact German Description wording from the official reference index.xml for a column (D-064)', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<Name>BON_ID</Name>\n          <Description>Vorgangs-ID</Description>');
    expect(xml).toContain('<Name>ARTIKELTEXT</Name>\n          <Description>Artikeltext</Description>\n          <AlphaNumeric />\n          <MaxLength>255</MaxLength>');
  });

  it('turns transactions.csv\'s BON_ID into a VariablePrimaryKey, ordered before the remaining VariableColumn elements (D-063)', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<VariablePrimaryKey>\n          <Name>BON_ID</Name>');
    expect(xml).toContain('</VariablePrimaryKey>');
    // BON_ID is not schluessel's first key (Z_KASSE_ID/Z_ERSTELLUNG/Z_NR come
    // first in the row object) — the primary key must still be reordered to
    // the front, per the DTD's `VariablePrimaryKey+, VariableColumn*`.
    const transactionsStart = xml.indexOf('<URL>transactions.csv</URL>');
    const transactionsXml = xml.slice(transactionsStart, xml.indexOf('</Table>', transactionsStart));
    const primaryKeyIndex = transactionsXml.indexOf('<VariablePrimaryKey>');
    const firstVariableColumnIndex = transactionsXml.indexOf('<VariableColumn>');
    expect(primaryKeyIndex).toBeGreaterThan(-1);
    expect(primaryKeyIndex).toBeLessThan(firstVariableColumnIndex);
    // transactions.csv (Bonkopf) itself must not also emit BON_ID as a
    // plain VariableColumn — only lines.csv's own (unrelated) BON_ID column
    // stays a VariableColumn, which is why this check is scoped to the
    // transactions.csv Table slice rather than the whole document.
    expect(transactionsXml).not.toContain('<VariableColumn>\n          <Name>BON_ID</Name>');
  });

  it('adds a ForeignKey from lines.csv\'s BON_ID to transactions.csv (Bonkopf), placed after all its columns (D-063)', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<ForeignKey>\n          <Name>BON_ID</Name>\n          <References>Bonkopf</References>\n        </ForeignKey>');
    // The ForeignKey must come after every VariableColumn/VariablePrimaryKey
    // and immediately before </VariableLength>, per the DTD content model.
    const linesTableStart = xml.indexOf('<URL>lines.csv</URL>');
    const linesTableXml = xml.slice(linesTableStart, xml.indexOf('</Table>', linesTableStart));
    expect(linesTableXml.indexOf('<ForeignKey>')).toBeGreaterThan(linesTableXml.lastIndexOf('</VariableColumn>'));
    expect(linesTableXml.indexOf('</ForeignKey>')).toBeLessThan(linesTableXml.indexOf('</VariableLength>'));
  });

  it('does not add a ForeignKey to transactions.csv itself (it is the referenced parent, not a child)', () => {
    const xml = buildIndexXml(minimalExport());
    const transactionsStart = xml.indexOf('<URL>transactions.csv</URL>');
    const transactionsXml = xml.slice(transactionsStart, xml.indexOf('</Table>', transactionsStart));
    expect(transactionsXml).not.toContain('<ForeignKey>');
  });
});
