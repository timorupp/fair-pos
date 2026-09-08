/**
 * Unit tests for the `index.xml` builder — verifies the generated markup
 * against the official `gdpdu-01-09-2004.dtd` grammar (Task #122).
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
    'lines.csv': [],
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
    expect(xml).not.toContain('<URL>vat.csv</URL>');
    expect(xml).not.toContain('<URL>lines.csv</URL>');
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

  it('marks Z_NR/BON_NR/UMS_BRUTTO as Numeric and text fields as AlphaNumeric', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<Name>Z_NR</Name>\n          <Numeric />');
    expect(xml).toContain('<Name>BON_NR</Name>\n          <Numeric />');
    expect(xml).toContain('<Name>UMS_BRUTTO</Name>\n          <Numeric><Accuracy>2</Accuracy></Numeric>');
    expect(xml).toContain('<Name>BEDIENER_NAME</Name>\n          <AlphaNumeric />');
  });

  it('uses the official DSFinV-K module name as each Table\'s Name', () => {
    const xml = buildIndexXml(minimalExport());
    expect(xml).toContain('<URL>cashpointclosing.csv</URL>\n      <Name>Stamm_Abschluss</Name>');
    expect(xml).toContain('<URL>transactions.csv</URL>\n      <Name>Bonkopf</Name>');
  });
});
