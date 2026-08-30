import { describe, expect, it } from 'vitest';
import {
  formatPinForDisplay, generateRandomPin, hashPin, isValidPinFormat, normalizePin,
} from './pin.js';

describe('normalizePin', () => {
  it('strips hyphens', () => {
    expect(normalizePin('ABC-123-XYZ')).toBe('ABC123XYZ');
  });

  it('strips spaces', () => {
    expect(normalizePin('ABC 123 XYZ')).toBe('ABC123XYZ');
  });

  it('uppercases lowercase input', () => {
    expect(normalizePin('abc123xyz')).toBe('ABC123XYZ');
  });

  it('accepts pasted input with mixed separators and case', () => {
    expect(normalizePin('aBc-123 xYz')).toBe('ABC123XYZ');
  });
});

describe('isValidPinFormat', () => {
  it('accepts a well-formed 9-character normalized PIN', () => {
    expect(isValidPinFormat('ABCDEFGHJ')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidPinFormat('ABC')).toBe(false);
    expect(isValidPinFormat('ABCDEFGHJK')).toBe(false);
  });

  it('accepts ambiguous characters (0, O, 1, I) — only the generator avoids them, manual entry may use any of A-Z+0-9', () => {
    expect(isValidPinFormat('ABCDEFGH0')).toBe(true);
    expect(isValidPinFormat('ABCDEFGHO')).toBe(true);
    expect(isValidPinFormat('ABCDEFGH1')).toBe(true);
    expect(isValidPinFormat('ABCDEFGHI')).toBe(true);
  });

  it('rejects non-alphanumeric characters', () => {
    expect(isValidPinFormat('ABCDEFG-H')).toBe(false);
  });

  it('rejects lowercase (normalizePin should be applied first)', () => {
    expect(isValidPinFormat('abcdefghj')).toBe(false);
  });
});

describe('formatPinForDisplay', () => {
  it('groups into three hyphen-separated triples', () => {
    expect(formatPinForDisplay('ABCDEFGHJ')).toBe('ABC-DEF-GHJ');
  });
});

describe('hashPin', () => {
  it('is deterministic — the same normalized PIN always hashes the same', () => {
    expect(hashPin('ABCDEFGHJ')).toBe(hashPin('ABCDEFGHJ'));
  });

  it('produces different hashes for different PINs', () => {
    expect(hashPin('ABCDEFGHJ')).not.toBe(hashPin('KLMNPQRST'));
  });

  it('returns a 64-character hex string (SHA-256 digest)', () => {
    expect(hashPin('ABCDEFGHJ')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateRandomPin', () => {
  it('always produces a well-formed PIN', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidPinFormat(generateRandomPin())).toBe(true);
    }
  });

  it('does not repeat across many generations (collision would be astronomically unlikely)', () => {
    const pins = new Set(Array.from({ length: 200 }, () => generateRandomPin()));
    expect(pins.size).toBe(200);
  });

  it('never produces the visually-ambiguous characters (0, O, 1, I), unlike manual entry', () => {
    for (let i = 0; i < 100; i++) {
      const pin = generateRandomPin();
      expect(pin).not.toMatch(/[01OI]/);
    }
  });
});
