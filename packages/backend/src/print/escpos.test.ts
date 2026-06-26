/** Unit tests for the ESC/POS builders. */
import { describe, it, expect } from 'vitest';
import { buildTestPrint, formatGermanTimestamp } from './escpos.js';

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

  it('contains the printer name in the rendered body', () => {
    const buf = buildTestPrint('Küche', ts);
    // Buffer is ASCII-encoded, so 'ü' becomes a replacement; check the ASCII subset.
    expect(buf.toString('ascii')).toContain('Drucker:');
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

  it('embeds the provided logo block when one is passed in', () => {
    // Distinctive placeholder that wouldn't appear anywhere in the regular slip.
    const logo = Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]);
    const buf = buildTestPrint(printerName, ts, logo);
    expect(buf.includes(logo)).toBe(true);
  });

  it('omits the logo block when null is passed', () => {
    const noLogo = buildTestPrint(printerName, ts, null);
    const sameBaseline = buildTestPrint(printerName, ts);
    expect(noLogo.equals(sameBaseline)).toBe(true);
  });
});
