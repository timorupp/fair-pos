/** Tests for the ESC/POS receipt renderer. Verifies framing bytes and text content — see `print/blocks.test.ts` for the shared renderer's own tests, and `print/escpos-encoding.test.ts` for `twoColumn`. */
import { describe, it, expect } from 'vitest';
import { buildReceiptEscPos } from './escpos-receipt.js';
import { buildDemoReceipt } from './demo.js';

describe('buildReceiptEscPos', () => {
  const data = buildDemoReceipt(new Date(2026, 5, 24, 12, 0, 0));

  it('begins with the ESC @ initialise sequence', async () => {
    const buf = await buildReceiptEscPos(data);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it('ends with line feeds followed by a full cut (GS V 0)', async () => {
    const buf = await buildReceiptEscPos(data);
    const tail = buf.subarray(buf.length - 3);
    expect(tail[0]).toBe(0x1d);
    expect(tail[1]).toBe(0x56);
    expect(tail[2]).toBe(0x00);
  });

  it('contains the receipt number and date in the rendered text', async () => {
    const ascii = (await buildReceiptEscPos(data)).toString('ascii');
    expect(ascii).toContain('RE-00042');
    expect(ascii).toContain('24.06.2026 12:00:00');
  });

  it('encodes German umlauts as CP858 bytes', async () => {
    const buf = await buildReceiptEscPos({
      ...data,
      companyName: 'Käse Müller GmbH',
      companyAddressLines: ['Straße der Einheit 1'],
    });
    // CP858: ä=0x84, ö=0x94, ü=0x81, ß=0xe1
    expect(buf.includes(Buffer.from([0x4b, 0x84, 0x73, 0x65]))).toBe(true); // "Käse"
    expect(buf.includes(Buffer.from([0x4d, 0x81, 0x6c]))).toBe(true);        // "Mül"
    expect(buf.includes(Buffer.from([0x53, 0x74, 0x72, 0x61, 0xe1, 0x65]))).toBe(true); // "Straße"
  });

  it('selects CP858 as the active code page at the start of the stream', async () => {
    const buf = await buildReceiptEscPos(data);
    // ESC @ + ESC t 19
    expect(buf.subarray(0, 5).equals(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x13]))).toBe(true);
  });

  it('shows the TSE-error hint when no signature is present', async () => {
    const buf = await buildReceiptEscPos(data);
    expect(buf.includes('TSE Fehler')).toBe(true);
  });

  it('embeds a QR code raster (Task #101 — now on the printout too, not just the PDF)', async () => {
    const buf = await buildReceiptEscPos(data);
    // GS v 0 — raster image command; distinct from GS V 0 (paper cut) by the lowercase 'v'.
    expect(buf.includes(Buffer.from([0x1d, 0x76, 0x30]))).toBe(true);
  });
});
