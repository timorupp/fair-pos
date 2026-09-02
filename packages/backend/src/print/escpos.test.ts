/** Unit tests for the test-print and PIN-slip ESC/POS builders. */
import { describe, it, expect } from 'vitest';
import { buildPinSlipBlocks, buildTestPrintBlocks, formatGermanTimestamp } from './escpos.js';
import { renderBlocksToEscPos } from './blocks.js';
import type { CompanyLogo } from '../logo/logo.js';

/** Renders straight through the shared block model, same as every production call site. */
const buildTestPrint = (...args: Parameters<typeof buildTestPrintBlocks>): Buffer =>
  renderBlocksToEscPos(buildTestPrintBlocks(...args));
const buildPinSlip = (...args: Parameters<typeof buildPinSlipBlocks>): Buffer =>
  renderBlocksToEscPos(buildPinSlipBlocks(...args));

describe('formatGermanTimestamp', () => {
  it('formats day, month, year and time with zero-padded fields', () => {
    const d = new Date(2026, 5, 24, 9, 5, 7); // 24.06.2026 09:05:07 local time
    expect(formatGermanTimestamp(d)).toBe('24.06.2026 09:05:07');
  });

  it('formats single-digit months and days with leading zeros', () => {
    const d = new Date(2026, 0, 3, 0, 0, 0);
    expect(formatGermanTimestamp(d)).toBe('03.01.2026 00:00:00');
  });
});

describe('buildTestPrint', () => {
  const printerName = 'Theke';
  const ts = new Date(2026, 5, 24, 12, 0, 0);

  it('begins with the ESC @ initialise sequence', () => {
    const buf = buildTestPrint(printerName, ts);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it('ends with line feeds followed by a full cut (GS V 0)', () => {
    const buf = buildTestPrint(printerName, ts);
    const tail = buf.subarray(buf.length - 3);
    expect(tail[0]).toBe(0x1d);
    expect(tail[1]).toBe(0x56);
    expect(tail[2]).toBe(0x00);
  });

  it('contains the printer name in the rendered body, umlauts included (CP858, not dropped)', () => {
    const buf = buildTestPrint('Küche', ts);
    expect(buf.toString('ascii')).toContain('Drucker:');
    expect(buf.includes(Buffer.from([0x4b, 0x81, 0x63, 0x68, 0x65]))).toBe(true); // "Küche" in CP858
  });

  it('contains the formatted timestamp in the rendered body', () => {
    const buf = buildTestPrint(printerName, ts);
    expect(buf.toString('ascii')).toContain('24.06.2026 12:00:00');
  });

  it('produces deterministic output for the same inputs', () => {
    const a = buildTestPrint(printerName, ts);
    const b = buildTestPrint(printerName, ts);
    expect(a.equals(b)).toBe(true);
  });

  it('embeds the provided logo raster when one is passed in', () => {
    const escposRaster = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const logo: CompanyLogo = {
      pdfPng: Buffer.from([1]), pdfWidth: 10, pdfHeight: 10, pdfWidthFactor: 1, escposBytes: escposRaster,
    };
    const buf = buildTestPrint(printerName, ts, logo);
    expect(buf.includes(escposRaster)).toBe(true);
  });

  it('omits the logo block when null is passed', () => {
    const noLogo = buildTestPrint(printerName, ts, null);
    const sameBaseline = buildTestPrint(printerName, ts);
    expect(noLogo.equals(sameBaseline)).toBe(true);
  });
});

describe('buildPinSlip', () => {
  const ts = new Date(2026, 5, 24, 12, 0, 0);

  it('begins with the ESC @ initialise sequence', () => {
    const buf = buildPinSlip('Anna', 'ABC-DEF-GHJ', ts);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it('ends with line feeds followed by a full cut (GS V 0)', () => {
    const buf = buildPinSlip('Anna', 'ABC-DEF-GHJ', ts);
    const tail = buf.subarray(buf.length - 3);
    expect(tail[0]).toBe(0x1d);
    expect(tail[1]).toBe(0x56);
    expect(tail[2]).toBe(0x00);
  });

  it('contains the user name and PIN in the rendered body', () => {
    const buf = buildPinSlip('Anna', 'ABC-DEF-GHJ', ts);
    const text = buf.toString('ascii');
    expect(text).toContain('Benutzer: Anna');
    expect(text).toContain('ABC-DEF-GHJ');
  });

  it('contains the formatted timestamp in the rendered body', () => {
    const buf = buildPinSlip('Anna', 'ABC-DEF-GHJ', ts);
    expect(buf.toString('ascii')).toContain('24.06.2026 12:00:00');
  });

  it('produces deterministic output for the same inputs', () => {
    const a = buildPinSlip('Anna', 'ABC-DEF-GHJ', ts);
    const b = buildPinSlip('Anna', 'ABC-DEF-GHJ', ts);
    expect(a.equals(b)).toBe(true);
  });
});
