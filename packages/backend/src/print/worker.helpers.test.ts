/** Unit tests for the print-worker helpers. */
import { describe, it, expect } from 'vitest';
import { shouldRetry, decodeContent, encodeContent, MAX_ATTEMPTS } from './worker.helpers.js';

describe('shouldRetry', () => {
  it('retries when attempts is below the limit', () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(MAX_ATTEMPTS - 1)).toBe(true);
  });

  it('does not retry when attempts has reached the limit', () => {
    expect(shouldRetry(MAX_ATTEMPTS)).toBe(false);
    expect(shouldRetry(MAX_ATTEMPTS + 5)).toBe(false);
  });
});

describe('decodeContent / encodeContent', () => {
  it('round-trips arbitrary bytes through base64', () => {
    const original = Buffer.from([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x1d, 0x56, 0x00]);
    const encoded = encodeContent(original);
    const decoded = decodeContent(encoded);
    expect(decoded.equals(original)).toBe(true);
  });

  it('encodes an empty buffer to an empty string', () => {
    expect(encodeContent(Buffer.alloc(0))).toBe('');
  });

  it('decodes a known base64 string into the expected bytes', () => {
    // "Hi\n" → base64 "SGkK"
    expect(decodeContent('SGkK').equals(Buffer.from('Hi\n', 'ascii'))).toBe(true);
  });
});
