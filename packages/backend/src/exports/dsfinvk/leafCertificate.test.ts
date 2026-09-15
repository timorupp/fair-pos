import { describe, expect, it } from 'vitest';
import { extractLeafCertificateChunks } from './leafCertificate.js';

/** Wraps base64 DER bytes into a PEM certificate block, 64-char-wrapped like real PEM output. */
function toPem(bodyBase64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < bodyBase64.length; i += 64) lines.push(bodyBase64.slice(i, i + 64));
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

describe('extractLeafCertificateChunks', () => {
  it('returns empty chunks for an empty input', () => {
    expect(extractLeafCertificateChunks('')).toEqual({ zertifikatI: '', zertifikatII: '' });
  });

  it('returns empty chunks when the PEM contains no certificate block', () => {
    const pem = 'not a certificate at all';
    expect(extractLeafCertificateChunks(Buffer.from(pem, 'utf-8').toString('base64')))
      .toEqual({ zertifikatI: '', zertifikatII: '' });
  });

  it('extracts a single short leaf certificate entirely into zertifikatI', () => {
    const leafBody = 'A'.repeat(300);
    const pem = toPem(leafBody);
    const result = extractLeafCertificateChunks(Buffer.from(pem, 'utf-8').toString('base64'));
    expect(result.zertifikatI).toBe(leafBody);
    expect(result.zertifikatII).toBe('');
  });

  it('splits a leaf certificate longer than 1000 characters across zertifikatI/II', () => {
    const leafBody = 'B'.repeat(1500);
    const pem = toPem(leafBody);
    const result = extractLeafCertificateChunks(Buffer.from(pem, 'utf-8').toString('base64'));
    expect(result.zertifikatI).toBe(leafBody.slice(0, 1000));
    expect(result.zertifikatII).toBe(leafBody.slice(1000, 1500));
    expect(result.zertifikatI.length).toBe(1000);
    expect(result.zertifikatII.length).toBe(500);
  });

  it('uses only the first (leaf) certificate when the chain has multiple entries', () => {
    const leafBody = 'C'.repeat(200);
    const issuerBody = 'D'.repeat(200);
    const pem = toPem(leafBody) + toPem(issuerBody);
    const result = extractLeafCertificateChunks(Buffer.from(pem, 'utf-8').toString('base64'));
    expect(result.zertifikatI).toBe(leafBody);
    expect(result.zertifikatI).not.toContain('D');
  });
});
