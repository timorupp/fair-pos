/** Tests for the ESC/POS receipt renderer. Verifies framing bytes, text content and the two-column helper. */
import { describe, it, expect } from 'vitest';
import { buildReceiptEscPos, twoColumn } from './escpos-receipt.js';
import { buildDemoReceipt } from './demo.js';

describe('twoColumn', () => {
  it('pads with spaces so left + right fill the width', () => {
    expect(twoColumn('Bier', '5,00', 20)).toBe('Bier            5,00');
    expect(twoColumn('Bier', '5,00', 20).length).toBe(20);
  });

  it('keeps at least one space between left and right when content is tight', () => {
    const result = twoColumn('Sehr langer Artikelname', '12,34', 25);
    expect(result.length).toBe(25);
    expect(result).toMatch(/12,34$/);
  });

  it('truncates the left side when the row would overflow', () => {
    const result = twoColumn('Sehr langer Artikelname der nicht passt', '1,00', 20);
    expect(result.length).toBe(20);
    expect(result).toMatch(/1,00$/);
  });
});

describe('buildReceiptEscPos', () => {
  const data = buildDemoReceipt(new Date(2026, 5, 24, 12, 0, 0));

  it('begins with the ESC @ initialise sequence', () => {
    const buf = buildReceiptEscPos(data);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it('ends with line feeds followed by a full cut (GS V 0)', () => {
    const buf = buildReceiptEscPos(data);
    const tail = buf.subarray(buf.length - 3);
    expect(tail[0]).toBe(0x1d);
    expect(tail[1]).toBe(0x56);
    expect(tail[2]).toBe(0x00);
  });

  it('contains the receipt number and date in the rendered text', () => {
    const ascii = buildReceiptEscPos(data).toString('ascii');
    expect(ascii).toContain('RE-00042');
    expect(ascii).toContain('24.06.2026 12:00:00');
  });

  it('encodes German umlauts as CP858 bytes', () => {
    const buf = buildReceiptEscPos({
      ...data,
      companyName: 'Käse Müller GmbH',
      companyAddressLines: ['Straße der Einheit 1'],
    });
    // CP858: ä=0x84, ö=0x94, ü=0x81, ß=0xe1
    expect(buf.includes(Buffer.from([0x4b, 0x84, 0x73, 0x65]))).toBe(true); // "Käse"
    expect(buf.includes(Buffer.from([0x4d, 0x81, 0x6c]))).toBe(true);        // "Mül"
    expect(buf.includes(Buffer.from([0x53, 0x74, 0x72, 0x61, 0xe1, 0x65]))).toBe(true); // "Straße"
  });

  it('selects CP858 as the active code page at the start of the stream', () => {
    const buf = buildReceiptEscPos(data);
    // ESC @ + ESC t 19
    expect(buf.subarray(0, 5).equals(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x13]))).toBe(true);
  });

  it('shows the TSE-not-active hint when no signature is present', () => {
    const buf = buildReceiptEscPos(data);
    expect(buf.includes('TSE noch nicht aktiv')).toBe(true);
  });
});
