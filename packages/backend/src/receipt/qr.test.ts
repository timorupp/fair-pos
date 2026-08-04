/** Unit tests for the QR-code payload builder. */
import { describe, it, expect } from 'vitest';
import { buildQrPayload } from './qr.js';
import type { ReceiptData } from './types.js';

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
    logoPng: null,
    logoWidth: 0,
    logoHeight: 0,
    logoWidthFactor: 0,
    logoEscPos: null,
    positions: [],
    totalGross: 0,
    taxBreakdown: [],
    tseSerial: null,
    tseTransactionNumber: null,
    tseSignatureCounter: null,
    tseSignature: null,
    tseStartTime: null,
    tseEndTime: null,
    ...overrides,
  };
}

describe('buildQrPayload', () => {
  it('joins fields with a semicolon in the documented order', () => {
    const payload = buildQrPayload(baseData());
    const parts = payload.split(';');
    expect(parts[0]).toBe('FairPOS-2026-A3B7K2M9XQ');
    expect(parts[1]).toBe('RE-00042');
    expect(parts[2]).toBe('24.06.2026 12:00:00');
  });

  it('emits empty fields for missing TSE values (pre-TSE phase)', () => {
    const parts = buildQrPayload(baseData()).split(';');
    expect(parts.slice(3)).toEqual(['', '', '', '', '', '']);
  });

  it('includes TSE values when present', () => {
    const parts = buildQrPayload(baseData({
      tseSerial: 'SWISSBIT-XYZ',
      tseTransactionNumber: 12345,
      tseSignatureCounter: 99,
      tseSignature: 'abc123signature',
      tseStartTime: new Date(2026, 5, 24, 11, 59, 50),
      tseEndTime: new Date(2026, 5, 24, 12, 0, 5),
    })).split(';');
    expect(parts[3]).toBe('SWISSBIT-XYZ');
    expect(parts[4]).toBe('12345');
    expect(parts[5]).toBe('99');
    expect(parts[6]).toBe('abc123signature');
    expect(parts[7]).toBe('24.06.2026 11:59:50');
    expect(parts[8]).toBe('24.06.2026 12:00:05');
  });
});
