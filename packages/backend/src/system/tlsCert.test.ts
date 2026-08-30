/**
 * Unit tests for the pure/in-memory parts of TLS certificate handling
 * (Task #66) — validation never touches the filesystem or `sudo`, so it's
 * fully unit-testable.
 */
import { describe, expect, it, vi } from 'vitest';
import { MISMATCHED_KEY, TEST_CERT, TEST_KEY } from '../test/fixtures/testCert.js';
import { validateCertKeyPair } from './tlsCert.js';

describe('validateCertKeyPair', () => {
  it('accepts a matching, currently-valid certificate/key pair', () => {
    const info = validateCertKeyPair(TEST_CERT, TEST_KEY);
    expect(info.subject).toBe('CN=fairpos-test.local');
    expect(info.validTo).toBeTruthy();
  });

  it('rejects a garbled certificate', () => {
    expect(() => validateCertKeyPair('not a cert', TEST_KEY)).toThrow(/PEM-Format/);
  });

  it('rejects a garbled private key', () => {
    expect(() => validateCertKeyPair(TEST_CERT, 'not a key')).toThrow(/PEM-Format/);
  });

  it('rejects a private key that does not match the certificate', () => {
    expect(() => validateCertKeyPair(TEST_CERT, MISMATCHED_KEY)).toThrow(/passt nicht/);
  });

  it('rejects an already-expired certificate', () => {
    // TEST_CERT is valid until 2036-08-26 — jump the clock past that instead
    // of generating a separately-expired fixture.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2037-01-01'));
    try {
      expect(() => validateCertKeyPair(TEST_CERT, TEST_KEY)).toThrow(/abgelaufen/);
    } finally {
      vi.useRealTimers();
    }
  });
});
