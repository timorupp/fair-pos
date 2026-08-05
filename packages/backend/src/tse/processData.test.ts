/** Unit tests for the TSE processData builders — see docs/Rechtliche-Anforderungen.md Abschnitt 6.5 for the verbatim Anhang I citations these encode. */
import { describe, it, expect } from 'vitest';
import {
  buildKassenbelegProcessData, buildAvBelegabbruchProcessData,
  buildAvBestellungProcessData, buildAvSonstigeProcessData,
} from './processData.js';

function text(buf: Buffer): string {
  return buf.toString('utf-8');
}

describe('buildKassenbelegProcessData', () => {
  it('matches Anhang I\'s own worked example (100€ Umsatz 19%, Bar bezahlt)', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'sales_receipt',
      positions: [{ quantity: 1, unitPriceEuros: 100, depositPriceEuros: null, taxRatePercent: 19 }],
    });
    expect(text(out)).toBe('Beleg^100.00_0.00_0.00_0.00_0.00^100.00:Bar');
  });

  it('matches Anhang I\'s two-tax-rate example (50€ Umsatz 19%, 50€ Umsatz 7%, Visa)', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'card',
      receiptType: 'sales_receipt',
      positions: [
        { quantity: 1, unitPriceEuros: 50, depositPriceEuros: null, taxRatePercent: 19 },
        { quantity: 1, unitPriceEuros: 50, depositPriceEuros: null, taxRatePercent: 7 },
      ],
    });
    expect(text(out)).toBe('Beleg^50.00_50.00_0.00_0.00_0.00^100.00:Unbar');
  });

  it('sums quantity across a position (aggregated line, e.g. admin Bonstorno)', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'sales_receipt',
      positions: [{ quantity: 3, unitPriceEuros: 2, depositPriceEuros: null, taxRatePercent: 19 }],
    });
    expect(text(out)).toBe('Beleg^6.00_0.00_0.00_0.00_0.00^6.00:Bar');
  });

  it('folds a positive deposit into the same tax-rate bucket as the article', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'sales_receipt',
      positions: [{ quantity: 1, unitPriceEuros: 5, depositPriceEuros: 2, taxRatePercent: 19 }],
    });
    expect(text(out)).toBe('Beleg^7.00_0.00_0.00_0.00_0.00^7.00:Bar');
  });

  it('buckets a 0% position into the fifth (steuerfrei) slot', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'sales_receipt',
      positions: [{ quantity: 1, unitPriceEuros: 10, depositPriceEuros: null, taxRatePercent: 0 }],
    });
    expect(text(out)).toBe('Beleg^0.00_0.00_0.00_0.00_10.00^10.00:Bar');
  });

  it('negates every amount for a cancellation (Bonstorno) receipt', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'cancellation',
      positions: [{ quantity: 1, unitPriceEuros: 20, depositPriceEuros: null, taxRatePercent: 19 }],
    });
    expect(text(out)).toBe('Beleg^-20.00_0.00_0.00_0.00_0.00^-20.00:Bar');
  });

  it('omits the Zahlungen field entirely when the total is 0.00', () => {
    const out = buildKassenbelegProcessData({
      paymentMethod: 'cash',
      receiptType: 'sales_receipt',
      positions: [],
    });
    expect(text(out)).toBe('Beleg^0.00_0.00_0.00_0.00_0.00^');
  });
});

describe('buildAvBelegabbruchProcessData', () => {
  it('returns the fixed payload Anhang I\'s own worked example gives', () => {
    expect(text(buildAvBelegabbruchProcessData())).toBe('AVBelegabbruch^0.00_0.00_0.00_0.00_0.00^');
  });
});

describe('buildAvBestellungProcessData', () => {
  it('formats one position as <Menge>;"<Bezeichnung>";<Preis>', () => {
    const out = buildAvBestellungProcessData({
      positions: [{ name: 'Eiskaffee', quantity: 1, unitPriceEuros: 2.99, depositPriceEuros: null }],
    });
    expect(text(out)).toBe('1;"Eiskaffee";2.99');
  });

  it('joins multiple positions with a carriage return', () => {
    const out = buildAvBestellungProcessData({
      positions: [
        { name: 'Eisbecher', quantity: 2, unitPriceEuros: 3.99, depositPriceEuros: null },
        { name: 'Eiskaffee', quantity: 1, unitPriceEuros: 2.99, depositPriceEuros: null },
      ],
    });
    expect(text(out)).toBe('2;"Eisbecher";3.99\r1;"Eiskaffee";2.99');
  });

  it('doubles embedded quotes in the Bezeichnung, per Anhang I\'s CSV-quoting rule', () => {
    const out = buildAvBestellungProcessData({
      positions: [{ name: 'Schnitzel "Wiener Art"', quantity: 1, unitPriceEuros: 12, depositPriceEuros: null }],
    });
    expect(text(out)).toBe('1;"Schnitzel ""Wiener Art""";12.00');
  });

  it('folds a deposit into the line price', () => {
    const out = buildAvBestellungProcessData({
      positions: [{ name: 'Bier', quantity: 1, unitPriceEuros: 5, depositPriceEuros: 2 }],
    });
    expect(text(out)).toBe('1;"Bier";7.00');
  });
});

describe('buildAvSonstigeProcessData', () => {
  it('produces a readable text summary including the cancellation reason and total', () => {
    const out = buildAvSonstigeProcessData({
      bookingType: 'cancellation',
      cancellationReasonName: 'Fehlbon',
      positions: [{ name: 'Bier', quantity: 2, unitPriceEuros: 5 }],
    });
    expect(text(out)).toBe('Storno (Fehlbon): 2x Bier (5.00 EUR) — Summe 10.00 EUR');
  });

  it('labels a free_of_charge booking distinctly from a cancellation', () => {
    const out = buildAvSonstigeProcessData({
      bookingType: 'free_of_charge',
      cancellationReasonName: 'Freibier Vorstand',
      positions: [{ name: 'Bier', quantity: 1, unitPriceEuros: 5 }],
    });
    expect(text(out)).toMatch(/^Kostenfreie Abgabe \(Freibier Vorstand\)/);
  });
});
