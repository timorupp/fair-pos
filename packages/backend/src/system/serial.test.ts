/** Unit tests for the system-serial generator. */
import { describe, it, expect } from 'vitest';
import { generateSystemSerial, isValidSystemSerial } from './serial.js';

describe('generateSystemSerial', () => {
  it('produces the documented FairPOS-{year}-{10×[A-Z0-9]} format', () => {
    const serial = generateSystemSerial(2026);
    expect(serial).toMatch(/^FairPOS-2026-[A-Z0-9]{10}$/);
  });

  it('embeds the year passed in', () => {
    expect(generateSystemSerial(2030)).toMatch(/^FairPOS-2030-/);
  });

  it('is deterministic for a fixed byte source (so the installer test can fixture it)', () => {
    const bytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const a = generateSystemSerial(2026, () => bytes);
    const b = generateSystemSerial(2026, () => bytes);
    expect(a).toBe(b);
  });

  it('uses all alphabet characters across many invocations (sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const serial = generateSystemSerial(2026);
      const suffix = serial.split('-')[2]!;
      for (const ch of suffix) seen.add(ch);
    }
    // With 200 × 10 = 2000 characters drawn from 36, we should see most of them.
    expect(seen.size).toBeGreaterThan(30);
  });

  it('produces different suffixes on consecutive calls (randomness wired up)', () => {
    const serials = new Set<string>();
    for (let i = 0; i < 50; i++) serials.add(generateSystemSerial(2026));
    expect(serials.size).toBe(50);
  });
});

describe('isValidSystemSerial', () => {
  it('accepts a freshly generated serial', () => {
    expect(isValidSystemSerial(generateSystemSerial(2026))).toBe(true);
  });

  it('rejects lowercase characters in the suffix', () => {
    expect(isValidSystemSerial('FairPOS-2026-aBCDEFGHIJ')).toBe(false);
  });

  it('rejects wrong suffix length', () => {
    expect(isValidSystemSerial('FairPOS-2026-ABCDEFGHI')).toBe(false);
    expect(isValidSystemSerial('FairPOS-2026-ABCDEFGHIJK')).toBe(false);
  });

  it('rejects a non-numeric year', () => {
    expect(isValidSystemSerial('FairPOS-20XX-ABCDEFGHIJ')).toBe(false);
  });

  it('rejects the placeholder string', () => {
    expect(isValidSystemSerial('(noch nicht initialisiert)')).toBe(false);
  });
});
