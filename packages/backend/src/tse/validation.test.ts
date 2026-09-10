import { describe, expect, it } from 'vitest';
import { isValidClientId, isValidPin, isValidPuk } from './validation.js';

describe('isValidPuk', () => {
  it('accepts exactly 6 digits', () => {
    expect(isValidPuk('123456')).toBe(true);
  });
  it('rejects 5 digits', () => {
    expect(isValidPuk('12345')).toBe(false);
  });
  it('rejects 7 digits', () => {
    expect(isValidPuk('1234567')).toBe(false);
  });
  it('rejects non-digit characters', () => {
    expect(isValidPuk('12345a')).toBe(false);
  });
  it('rejects an empty string', () => {
    expect(isValidPuk('')).toBe(false);
  });
});

describe('isValidPin', () => {
  it('accepts exactly 5 digits', () => {
    expect(isValidPin('12345')).toBe(true);
  });
  it('rejects 6 digits', () => {
    expect(isValidPin('123456')).toBe(false);
  });
  it('rejects 4 digits', () => {
    expect(isValidPin('1234')).toBe(false);
  });
  it('rejects non-digit characters', () => {
    expect(isValidPin('1234a')).toBe(false);
  });
});

describe('isValidClientId', () => {
  it('accepts letters, digits, hyphen, underscore', () => {
    expect(isValidClientId('FairPOS-1')).toBe(true);
    expect(isValidClientId('Client_02')).toBe(true);
  });
  it('rejects special characters', () => {
    expect(isValidClientId('FairPOS 1')).toBe(false);
    expect(isValidClientId('FairPOS!')).toBe(false);
    expect(isValidClientId('a/b')).toBe(false);
  });
  it('rejects an empty string', () => {
    expect(isValidClientId('')).toBe(false);
  });
  it('accepts exactly 30 characters, rejects 31', () => {
    expect(isValidClientId('a'.repeat(30))).toBe(true);
    expect(isValidClientId('a'.repeat(31))).toBe(false);
  });
});
