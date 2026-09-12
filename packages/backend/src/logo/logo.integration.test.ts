/**
 * Integration tests for `logo_version` (Task #112) — content-addressed
 * dedup needs a real Postgres unique constraint, not something worth
 * mocking.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';
import { ensureLogoVersion, loadLogoVersion, type CompanyLogo } from './logo.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);
beforeEach(async () => { await truncateAllTables(); });

function makeLogo(overrides: Partial<CompanyLogo> = {}): CompanyLogo {
  return {
    pdfPng: Buffer.from('fake-png-bytes'),
    pdfWidth: 400,
    pdfHeight: 200,
    pdfWidthFactor: 1,
    escposBytes: Buffer.from('fake-escpos-bytes'),
    ...overrides,
  };
}

describe('ensureLogoVersion', () => {
  it('returns null when no logo is given', async () => {
    expect(await ensureLogoVersion(null)).toBeNull();
  });

  it('creates a new row for a first-seen logo and returns its id', async () => {
    const id = await ensureLogoVersion(makeLogo());
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const loaded = await loadLogoVersion(id!);
    expect(loaded).not.toBeNull();
    expect(loaded!.pdfPng.toString()).toBe('fake-png-bytes');
    expect(loaded!.escposBytes.toString()).toBe('fake-escpos-bytes');
    expect(loaded!.pdfWidth).toBe(400);
    expect(loaded!.pdfHeight).toBe(200);
    expect(loaded!.pdfWidthFactor).toBe(1);
  });

  it('reuses the same row for identical content instead of duplicating it (dedup)', async () => {
    const idA = await ensureLogoVersion(makeLogo());
    const idB = await ensureLogoVersion(makeLogo());
    expect(idB).toBe(idA);
  });

  it('creates a distinct row when the pixel content differs', async () => {
    const idA = await ensureLogoVersion(makeLogo());
    const idB = await ensureLogoVersion(makeLogo({ pdfPng: Buffer.from('different-png-bytes') }));
    expect(idB).not.toBe(idA);
  });

  it('creates a distinct row when only pdfWidthFactor differs (e.g. a zoom change) — same bytes, different rendered size', async () => {
    const idA = await ensureLogoVersion(makeLogo({ pdfWidthFactor: 1 }));
    const idB = await ensureLogoVersion(makeLogo({ pdfWidthFactor: 0.5 }));
    expect(idB).not.toBe(idA);
  });
});
