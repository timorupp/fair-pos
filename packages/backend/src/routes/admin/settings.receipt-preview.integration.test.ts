/**
 * Integration tests for GET /api/admin/settings/receipt-preview.
 *
 * Regression test for a bug found during the live production install
 * (2026-08-25): `buildDemoReceipt()` always hardcoded `logoPng: null`, so the
 * "Bon-Vorschau" button in Unternehmensdaten never showed the configured
 * logo, even with a logo uploaded and the "logo_on_receipt" checkbox on.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser, setSystemSetting } from '../../test/fixtures.js';
import { storeCompanyLogo } from '../../logo/logo.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

/** A tiny valid PNG, generated on the fly so no binary fixture file is needed. */
async function tinyLogoPng(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 0, b: 0 } } })
    .png()
    .toBuffer();
}

/** Fetches the preview PDF via the authenticated admin endpoint. */
async function fetchPreview() {
  const app = await getTestApp();
  return app.inject({
    method: 'GET', url: '/api/admin/settings/receipt-preview',
    headers: { cookie: adminCookie },
  });
}

describe('GET /api/admin/settings/receipt-preview', () => {
  it('renders a PDF with no logo configured (baseline, must not regress)', async () => {
    const response = await fetchPreview();
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('embeds the logo when a logo is stored AND logo_on_receipt is enabled', async () => {
    await storeCompanyLogo(await tinyLogoPng());

    await setSystemSetting('logo_on_receipt', 'true');
    const withLogo = await fetchPreview();

    await setSystemSetting('logo_on_receipt', 'false');
    const flagOff = await fetchPreview();

    expect(withLogo.statusCode).toBe(200);
    // Crude but real evidence the logo's PNG bytes actually got embedded —
    // a PDF with an inline raster image is meaningfully larger than one
    // without. Guards against a "fix" that always embeds the logo
    // regardless of the flag: the flag-off run must stay small.
    expect(withLogo.rawPayload.length).toBeGreaterThan(flagOff.rawPayload.length + 500);
  });

  it('renders identically whether no logo is stored at all, or one is stored but the flag stays off (default)', async () => {
    const noLogoAtAll = await fetchPreview();

    await storeCompanyLogo(await tinyLogoPng());
    // logo_on_receipt intentionally left unset — defaults to disabled (Anforderungen.md: "Default-Flags: aus").
    const logoStoredFlagOff = await fetchPreview();

    expect(logoStoredFlagOff.statusCode).toBe(200);
    expect(logoStoredFlagOff.rawPayload.length).toBe(noLogoAtAll.rawPayload.length);
  });
});
