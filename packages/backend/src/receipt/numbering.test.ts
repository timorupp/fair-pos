/** Unit tests for the receipt-token generator. */
import { describe, it, expect } from 'vitest';
import { generateReceiptToken } from './numbering.js';

describe('generateReceiptToken', () => {
  it('produces a URL-safe string', () => {
    expect(generateReceiptToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces 43 characters (32 bytes base64url, no padding)', () => {
    expect(generateReceiptToken()).toHaveLength(43);
  });

  it('returns distinct tokens on consecutive calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(generateReceiptToken());
    expect(tokens.size).toBe(100);
  });
});
