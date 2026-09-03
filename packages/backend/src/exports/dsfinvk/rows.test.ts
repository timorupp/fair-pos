/** Unit tests for the DSFinV-K row builder — see docs/Rechtliche-Anforderungen.md Abschnitt 6 for field citations. */
import { describe, it, expect } from 'vitest';
import { buildDsfinvkExport, type DsfinvkSource, type SourceVorgang } from './rows.js';

function baseSource(vorgaenge: SourceVorgang[]): DsfinvkSource {
  return {
    closing: {
      zNumber: 3,
      createdAt: new Date('2026-08-05T20:00:00.000Z'),
      businessDate: '2026-08-05',
      firstVorgangId: vorgaenge[0]?.id ?? '',
      lastVorgangId: vorgaenge[vorgaenge.length - 1]?.id ?? '',
    },
    registerId: 'reg-1',
    registerName: 'Theke',
    systemSerial: 'FairPOS-2026-AAAAAAAAAA',
    tseClientId: 'FairPOS-1',
    tseSerial: 'aabbcc',
    tseCertificate: { signatureAlgorithm: 'ecdsa-plain-SHA384', logTimeFormat: 'unixTime', publicKeyBase64: 'AAA=' },
    company: {
      name: 'Testverein e.V.', street: 'Hauptstr. 1', postalCode: '12345', city: 'Musterstadt',
      taxNumber: '12/345/67890', vatId: null,
    },
    taxRates: [{ category: 'standard', rate: 19, description: 'Allgemeiner Steuersatz' }],
    vorgaenge,
  };
}

function beleg(overrides: Partial<SourceVorgang> = {}): SourceVorgang {
  return {
    id: 'v-1',
    bonTyp: 'Beleg',
    bonName: null,
    receiptNumber: 42,
    createdAt: new Date('2026-08-05T18:00:00.000Z'),
    isStornoBeleg: false,
    diningTableName: null,
    operatorUserId: 'u-1',
    operatorUserName: 'Anna',
    paymentMethod: 'cash',
    tse: {
      transactionNumber: 7, signatureCounter: 3, signatureHex: 'aa',
      startTime: new Date('2026-08-05T18:00:00.000Z'), endTime: new Date('2026-08-05T18:00:01.000Z'),
    },
    items: [{ articleId: 'art-1', articleName: 'Bier', categoryName: 'Getränke', taxRate: 19, taxCategory: 'standard', priceEuros: 5, depositPriceEuros: null, depositTaxRate: null }],
    ...overrides,
  };
}

describe('buildDsfinvkExport', () => {
  it('builds a Bonkopf row with BON_TYP=Beleg and the correct UMS_BRUTTO', () => {
    const out = buildDsfinvkExport(baseSource([beleg()]));
    expect(out['transactions.csv']).toHaveLength(1);
    expect(out['transactions.csv'][0]).toMatchObject({
      BON_ID: 'v-1', BON_NR: 42, BON_TYP: 'Beleg', BON_STORNO: '0', UMS_BRUTTO: '5.00',
      BEDIENER_ID: 'u-1', BEDIENER_NAME: 'Anna',
    });
  });

  it('takes BON_START/BON_ENDE from createdAt, never from the TSE timestamps (Anhang I: must come from the recording system)', () => {
    const v = beleg({
      createdAt: new Date('2026-08-05T18:00:00.000Z'),
      tse: {
        transactionNumber: 7, signatureCounter: 3, signatureHex: 'aa',
        startTime: new Date('2026-08-05T17:59:00.000Z'), endTime: new Date('2026-08-05T18:05:00.000Z'),
      },
    });
    const out = buildDsfinvkExport(baseSource([v]));
    expect(out['transactions.csv'][0]).toMatchObject({
      BON_START: '2026-08-05T18:00:00.000Z', BON_ENDE: '2026-08-05T18:00:00.000Z',
    });
  });

  it('splits into Umsatz + Pfand lines when a position carries a positive deposit', () => {
    const v = beleg({
      items: [{ articleId: 'art-1', articleName: 'Bier', categoryName: 'Getränke', taxRate: 19, taxCategory: 'standard', priceEuros: 5, depositPriceEuros: 2, depositTaxRate: 19 }],
    });
    const out = buildDsfinvkExport(baseSource([v]));
    expect(out['lines.csv']).toHaveLength(2);
    expect(out['lines.csv'][0]).toMatchObject({ GV_TYP: 'Umsatz', STK_BR: '5.00', POS_ZEILE: '1' });
    expect(out['lines.csv'][1]).toMatchObject({ GV_TYP: 'Pfand', STK_BR: '2.00', POS_ZEILE: '2' });
  });

  it('uses PfandRueckzahlung for a negative deposit (Leergutrückgabe)', () => {
    const v = beleg({
      items: [{ articleId: 'art-1', articleName: 'Leergut', categoryName: 'Getränke', taxRate: 19, taxCategory: 'standard', priceEuros: 0, depositPriceEuros: -2, depositTaxRate: 19 }],
    });
    const out = buildDsfinvkExport(baseSource([v]));
    const pfandLine = out['lines.csv'].find((l) => l.GV_TYP.startsWith('Pfand'));
    expect(pfandLine).toMatchObject({ GV_TYP: 'PfandRueckzahlung', STK_BR: '2.00' });
  });

  it('taxes the Pfand line at UST_SCHLUESSEL 1 (Regelsteuersatz) even when the article itself is reduced-rate (Task #113)', () => {
    const v = beleg({
      items: [{ articleId: 'art-1', articleName: 'Essen im Pfandglas', categoryName: 'Speisen', taxRate: 7, taxCategory: 'reduced', priceEuros: 5, depositPriceEuros: 2, depositTaxRate: 19 }],
    });
    const out = buildDsfinvkExport(baseSource([v]));
    const articleVat = out['lines_vat.csv'].find((r) => r.POS_ZEILE === '1');
    const pfandVat = out['lines_vat.csv'].find((r) => r.POS_ZEILE === '2');
    expect(articleVat!.UST_SCHLUESSEL).toBe(2); // reduced
    expect(pfandVat!.UST_SCHLUESSEL).toBe(1);   // standard, independent of the article
  });

  it('negates amounts for a Bonstorno (isStornoBeleg)', () => {
    const v = beleg({ isStornoBeleg: true });
    const out = buildDsfinvkExport(baseSource([v]));
    expect(out['transactions.csv'][0]!.UMS_BRUTTO).toBe('-5.00');
    expect(out['lines.csv'][0]!.STK_BR).toBe('5.00'); // STK_BR is the unsigned base price
    expect(out['lines_vat.csv'][0]!.POS_BRUTTO).toBe('-5.00');
  });

  it('does not emit a datapayment.csv row for AVBestellung/AVSonstige (no payment yet)', () => {
    const order: SourceVorgang = {
      ...beleg(), id: 'so-1', bonTyp: 'AVBestellung', receiptNumber: null, paymentMethod: null, tse: null,
    };
    const out = buildDsfinvkExport(baseSource([order]));
    expect(out['datapayment.csv']).toHaveLength(0);
    expect(out['payment.csv']).toHaveLength(0);
    expect(out['transactions.csv'][0]).toMatchObject({ BON_TYP: 'AVBestellung', BON_NR: 0 });
  });

  it('records an AVSonstige cancellation with its BON_NAME filled from the cancellation reason', () => {
    const cancellation: SourceVorgang = {
      ...beleg(), id: 'oc-1', bonTyp: 'AVSonstige', bonName: 'Fehlbon', receiptNumber: null, paymentMethod: null,
    };
    const out = buildDsfinvkExport(baseSource([cancellation]));
    expect(out['transactions.csv'][0]).toMatchObject({ BON_TYP: 'AVSonstige', BON_NAME: 'Fehlbon' });
  });

  it('converts the hex TSE signature to base64 in transactions_tse.csv', () => {
    const out = buildDsfinvkExport(baseSource([beleg({ tse: {
      transactionNumber: 1, signatureCounter: 1, signatureHex: 'aabb',
      startTime: new Date(), endTime: new Date(),
    } })]));
    expect(out['transactions_tse.csv'][0]!.TSE_TA_SIG).toBe(Buffer.from('aabb', 'hex').toString('base64'));
  });

  it('sets TSE_TA_VORGANGSART to the literal TSE processType, not the BON_TYP (Anhang E)', () => {
    const belegOut = buildDsfinvkExport(baseSource([beleg()]));
    expect(belegOut['transactions_tse.csv'][0]!.TSE_TA_VORGANGSART).toBe('Kassenbeleg-V1');

    const order: SourceVorgang = { ...beleg(), id: 'so-1', bonTyp: 'AVBestellung', receiptNumber: null, paymentMethod: null };
    const orderOut = buildDsfinvkExport(baseSource([order]));
    expect(orderOut['transactions_tse.csv'][0]!.TSE_TA_VORGANGSART).toBe('Bestellung-V1');

    const cancellation: SourceVorgang = { ...beleg(), id: 'oc-1', bonTyp: 'AVSonstige', bonName: 'Fehlbon', receiptNumber: null, paymentMethod: null };
    const cancellationOut = buildDsfinvkExport(baseSource([cancellation]));
    expect(cancellationOut['transactions_tse.csv'][0]!.TSE_TA_VORGANGSART).toBe('SonstigerVorgang');
  });

  it('fills tse.csv\'s signature-algorithm/log-time-format/public-key fields from the cached TSE certificate info', () => {
    const out = buildDsfinvkExport(baseSource([beleg()]));
    expect(out['tse.csv'][0]).toMatchObject({
      TSE_SIG_ALGO: 'ecdsa-plain-SHA384', TSE_ZEITFORMAT: 'unixTime', TSE_PUBLIC_KEY: 'AAA=',
    });
  });

  it('leaves tse.csv\'s certificate fields empty when the certificate info is unavailable', () => {
    const source = baseSource([beleg()]);
    source.tseCertificate = null;
    const out = buildDsfinvkExport(source);
    expect(out['tse.csv'][0]).toMatchObject({ TSE_SIG_ALGO: '', TSE_ZEITFORMAT: '', TSE_PUBLIC_KEY: '' });
  });

  it('marks TSE_TA_FEHLER when no TSE signature is present, without throwing', () => {
    const out = buildDsfinvkExport(baseSource([beleg({ tse: null })]));
    expect(out['transactions_tse.csv'][0]!.TSE_TA_FEHLER).toMatch(/TSE-Ausfall/);
    expect(out['transactions_tse.csv'][0]!.TSE_TANR).toBe('');
  });

  it('aggregates payment totals across multiple Belege', () => {
    const out = buildDsfinvkExport(baseSource([
      beleg({ id: 'v-1' }),
      beleg({ id: 'v-2', paymentMethod: 'card' }),
    ]));
    expect(out['payment.csv']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ZAHLART_TYP: 'Bar', Z_ZAHLART_BETRAG: '5.00' }),
        expect.objectContaining({ ZAHLART_TYP: 'Unbar', Z_ZAHLART_BETRAG: '5.00' }),
      ]),
    );
    expect(out['cash_per_currency.csv'][0]).toMatchObject({ ZAHLART_WAEH: 'EUR', ZAHLART_BETRAG_WAEH: '5.00' });
  });

  it('omits tse.csv when no TSE serial is known', () => {
    const source = baseSource([beleg()]);
    source.tseSerial = null;
    const out = buildDsfinvkExport(source);
    expect(out['tse.csv']).toHaveLength(0);
  });

  it('emits one allocation_groups.csv row per Vorgang with a dining table', () => {
    const out = buildDsfinvkExport(baseSource([beleg({ diningTableName: 'A1' })]));
    expect(out['allocation_groups.csv']).toEqual([
      expect.objectContaining({ BON_ID: 'v-1', ABRECHNUNGSKREIS: 'A1' }),
    ]);
  });

  it('maps the standard/reduced/zero tax categories to UST_SCHLUESSEL 1/2/5', () => {
    const v = beleg({
      items: [
        { articleId: 'a', articleName: 'A', categoryName: 'C', taxRate: 19, taxCategory: 'standard', priceEuros: 10, depositPriceEuros: null, depositTaxRate: null },
        { articleId: 'b', articleName: 'B', categoryName: 'C', taxRate: 7, taxCategory: 'reduced', priceEuros: 10, depositPriceEuros: null, depositTaxRate: null },
        { articleId: 'c', articleName: 'C', categoryName: 'C', taxRate: 0, taxCategory: 'zero', priceEuros: 10, depositPriceEuros: null, depositTaxRate: null },
      ],
    });
    const out = buildDsfinvkExport(baseSource([v]));
    const schluessel = out['lines_vat.csv'].map((r) => r.UST_SCHLUESSEL);
    expect(schluessel).toEqual([1, 2, 5]);
  });
});
