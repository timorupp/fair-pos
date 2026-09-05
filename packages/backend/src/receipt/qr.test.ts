/** Unit tests for the QR-code payload builder — see docs/Rechtliche-Anforderungen.md Abschnitt 6.5/8 for the field-order citation. */
import { afterEach, describe, it, expect } from 'vitest';
import { buildQrPayload } from './qr.js';
import type { ReceiptData, ReceiptPosition } from './types.js';
import { config } from '../config.js';
import { resetTseCertificateInfoCache } from '../tse/certificateInfo.js';

function position(overrides: Partial<ReceiptPosition> = {}): ReceiptPosition {
  return {
    name: 'Bier', quantity: 1, unitPrice: 5, unitDeposit: null,
    taxRate: 19, taxCategory: 'standard', depositTaxRate: null, lineGross: 5,
    ...overrides,
  };
}

function baseData(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    companyName: 'Verein',
    companyAddressLines: ['Hauptstr. 1', '12345 Musterort'],
    taxNumber: '123/456/78901',
    vatId: null,
    systemSerial: 'FairPOS-2026-A3B7K2M9XQ',
    receiptNumber: 'RE-00042',
    createdAt: new Date(2026, 5, 24, 12, 0, 0),
    registerName: 'Theke',
    paymentMethod: 'cash',
    isCancellation: false,
    tableName: null,
    firstOrderTime: null,
    logoPng: null,
    logoWidth: 0,
    logoHeight: 0,
    logoWidthFactor: 0,
    logoEscPos: null,
    positions: [position()],
    totalGross: 5,
    taxBreakdown: [],
    tseTransactionNumber: null,
    tseSignatureCounter: null,
    tseSignature: null,
    tseStartTime: null,
    tseEndTime: null,
    ...overrides,
  };
}

describe('buildQrPayload', () => {
  afterEach(() => {
    config.tseClientId = null;
    resetTseCertificateInfoCache();
  });

  it('emits the twelve Anhang I fields in the documented order', async () => {
    config.tseClientId = 'FairPOS-1';
    const parts = (await buildQrPayload(baseData())).split(';');
    expect(parts).toHaveLength(12);
    expect(parts[0]).toBe('V0');
    expect(parts[1]).toBe('FairPOS-1');
    expect(parts[2]).toBe('Kassenbeleg-V1');
    expect(parts[3]).toBe('Beleg^5.00_0.00_0.00_0.00_0.00^5.00:Bar');
  });

  it('emits empty fields for missing TSE values (unconfigured/outage)', async () => {
    const parts = (await buildQrPayload(baseData())).split(';');
    expect(parts.slice(4)).toEqual(['', '', '', '', '', '', '', '']);
    expect(parts[1]).toBe(''); // no tseClientId configured
  });

  it('includes TSE transaction fields, in ISO-8601-with-millis format, when present', async () => {
    const parts = (await buildQrPayload(baseData({
      tseTransactionNumber: 12345,
      tseSignatureCounter: 99,
      tseSignature: 'aabb',
      tseStartTime: new Date('2026-06-24T11:59:50.000Z'),
      tseEndTime: new Date('2026-06-24T12:00:05.000Z'),
    }))).split(';');
    expect(parts[4]).toBe('12345');
    expect(parts[5]).toBe('99');
    expect(parts[6]).toBe('2026-06-24T11:59:50.000Z');
    expect(parts[7]).toBe('2026-06-24T12:00:05.000Z');
    expect(parts[10]).toBe(Buffer.from('aabb', 'hex').toString('base64'));
  });

  it('negates the processData amounts for a cancellation receipt', async () => {
    const parts = (await buildQrPayload(baseData({ isCancellation: true }))).split(';');
    expect(parts[3]).toBe('Beleg^-5.00_0.00_0.00_0.00_0.00^-5.00:Bar');
  });
});
