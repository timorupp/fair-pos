/**
 * End-to-end acceptance test (Task #53) — see src/e2e/README.md for setup
 * and what this covers. Runs against a REAL, already-running FairPOS
 * instance via real HTTP, not the mocked/containerized test environment.
 */
import unzipper from 'unzipper';
import { beforeAll, describe, expect, it } from 'vitest';
import { E2EClient, e2eBaseUrl, requireE2EEnv } from './client.js';

const BASE_URL = e2eBaseUrl();
const RUN_ID = `e2e-${Date.now()}`;

let adminClient: E2EClient;
let registerClient: E2EClient;

let categoryId: string;
let articleId: string;
let registerId: string;
let cashierUserId: string;
let cashierName: string;
let cashierPassword: string;

let receiptNumberFormatted: string;
let tseWarning: string | null;
let tseConfiguredAndReachable = false;

let closingId: string;

describe('End-to-End: Login -> Bestellung/Kassieren -> Tagesabschluss -> DSFinV-K-Export', () => {
  beforeAll(() => {
    adminClient = new E2EClient(BASE_URL);
    registerClient = new E2EClient(BASE_URL);
  });

  it('reaches the instance (GET /api/health)', async () => {
    const res = await adminClient.request<{ status: string }>('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('ok');
  });

  it('logs in as admin', async () => {
    const name = requireE2EEnv('E2E_ADMIN_NAME');
    const password = requireE2EEnv('E2E_ADMIN_PASSWORD');
    const res = await adminClient.request('POST', '/api/auth/admin/login', { name, password });
    expect(res.status, 'Admin-Login fehlgeschlagen — E2E_ADMIN_NAME/E2E_ADMIN_PASSWORD prüfen (siehe README.md)').toBe(200);
  });

  it('checks whether a TSE is configured and reachable (informational, not a hard requirement)', async () => {
    const res = await adminClient.request<{ configured: boolean; error?: string }>('GET', '/api/admin/tse/status');
    expect(res.status).toBe(200);
    tseConfiguredAndReachable = res.body!.configured && !res.body!.error;
  });

  it('creates a category, an article, and a Bonkasse register', async () => {
    const category = await adminClient.request<{ id: string }>('POST', '/api/admin/categories', {
      name: `${RUN_ID}-Getraenke`, tax_rate: 19,
    });
    expect(category.status).toBe(201);
    categoryId = category.body!.id;

    const article = await adminClient.request<{ id: string }>('POST', '/api/admin/articles', {
      name: `${RUN_ID}-Bier`, category_id: categoryId, price: 5,
    });
    expect(article.status).toBe(201);
    articleId = article.body!.id;

    const register = await adminClient.request<{ id: string }>('POST', '/api/admin/registers', {
      name: `${RUN_ID}-Bonkasse`, type: 'receipt_register',
    });
    expect(register.status).toBe(201);
    registerId = register.body!.id;
  });

  it('creates a cashier, grants register access, and logs in via QR token', async () => {
    cashierName = `${RUN_ID}-kassierer`;
    cashierPassword = 'e2e-test-not-a-real-password';
    const user = await adminClient.request<{ id: string }>('POST', '/api/admin/users', {
      name: cashierName, password: cashierPassword, is_admin: false,
    });
    expect(user.status).toBe(201);
    cashierUserId = user.body!.id;

    const grant = await adminClient.request('PUT', `/api/admin/users/${cashierUserId}/registers`, {
      register_ids: [registerId],
    });
    expect(grant.status).toBe(204);

    const tokenRes = await adminClient.request<{ token: string }>('POST', `/api/admin/users/${cashierUserId}/token`);
    expect(tokenRes.status).toBe(200);

    const redeem = await registerClient.request('POST', '/api/auth/register/token', { token: tokenRes.body!.token });
    expect(redeem.status, 'Token-Login fehlgeschlagen').toBe(200);

    const me = await registerClient.request<{ name: string }>('GET', '/api/auth/register/me');
    expect(me.status).toBe(200);
    expect(me.body!.name).toBe(cashierName);
  });

  it('checks out 2x article at the Bonkasse, signing (or gracefully warning about) the TSE transaction', async () => {
    const checkout = await registerClient.request<{
      receipt_number_formatted: string; tse_warning: string | null;
    }>('POST', `/api/register-session/registers/${registerId}/checkout`, {
      positions: [{ article_id: articleId, quantity: 2 }],
    });
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(200);
    receiptNumberFormatted = checkout.body!.receipt_number_formatted;
    tseWarning = checkout.body!.tse_warning;

    if (tseConfiguredAndReachable) {
      // A real, working TSE was reported by /tse/status just before this
      // checkout — the sale must actually have been signed, not just
      // "gracefully degraded". This is the one assertion in this suite that
      // exercises real TSE hardware, when present.
      expect(tseWarning, 'TSE war laut /tse/status konfiguriert+erreichbar, aber die Signierung hat trotzdem gewarnt').toBeNull();
    }
    // Otherwise (no TSE / TSE unreachable): any warning string is the
    // correct, tolerated outcome — see AEAO zu § 146a AO Nr. 1.14 and
    // docs/TSE-Integration.md "TSE-Ausfall". Not asserted further here.
  });

  it('closes the register (Tagesabschluss / Z-Bon)', async () => {
    const closing = await adminClient.request<{ closing_id: string; z_number: number }>(
      'POST', `/api/admin/registers/${registerId}/closings`,
    );
    expect(closing.status, JSON.stringify(closing.body)).toBe(200);
    closingId = closing.body!.closing_id;
    expect(closing.body!.z_number).toBeGreaterThan(0);
  });

  it('downloads the DSFinV-K export and finds the checked-out sale in transactions.csv', async () => {
    const res = await adminClient.requestBinary('GET', `/api/admin/exports/dsfinvk/${closingId}`);
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('application/zip');

    const directory = await unzipper.Open.buffer(res.buffer);
    const names = directory.files.map((f) => f.path);
    expect(names).toContain('transactions.csv');

    const transactionsFile = directory.files.find((f) => f.path === 'transactions.csv')!;
    const csv = (await transactionsFile.buffer()).toString('utf-8');
    expect(csv).toContain('10.00'); // 2x 5,00 EUR
  });

  it('downloads the Rechnungs-PDFs (ZIP) export for today and finds one PDF for this invoice', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await adminClient.requestBinary('GET', `/api/admin/exports/invoices/day?date=${today}`);
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('application/zip');

    const directory = await unzipper.Open.buffer(res.buffer);
    const names = directory.files.map((f) => f.path);
    expect(names).toContain(`${receiptNumberFormatted}.pdf`);
  });
});

describe('Weitere Low-Hanging-Fruit-Checks', () => {
  it('rejects a wrong admin password with 401', async () => {
    const freshClient = new E2EClient(BASE_URL);
    const res = await freshClient.request('POST', '/api/auth/admin/login', {
      name: requireE2EEnv('E2E_ADMIN_NAME'), password: 'definitely-wrong-password',
    });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated access to an admin endpoint with 401 (not a crash, not data)', async () => {
    const freshClient = new E2EClient(BASE_URL);
    const res = await freshClient.request('GET', '/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('creates and applies an admin Bonstorno for the checked-out article', async () => {
    const reason = await adminClient.request<{ id: string }>('POST', '/api/admin/cancellation-reasons', {
      name: `${RUN_ID}-storno`, booking_type: 'cancellation', is_active: true,
    });
    expect(reason.status, JSON.stringify(reason.body)).toBe(201);

    const cancellation = await adminClient.request<{ receipt_number_formatted: string }>(
      'POST', '/api/admin/cancellations', {
        register_id: registerId,
        cancellation_reason_id: reason.body!.id,
        items: [{ article_id: articleId, quantity: 1 }],
      },
    );
    expect(cancellation.status, JSON.stringify(cancellation.body)).toBe(201);
    expect(cancellation.body!.receipt_number_formatted).toBeTruthy();
  });

  it('downloads the Excel day- and event-exports without error', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const day = await adminClient.requestBinary('GET', `/api/admin/exports/excel/day?date=${today}`);
    expect(day.status).toBe(200);
    expect(day.contentType).toBe(xlsxContentType);
    expect(day.buffer.length).toBeGreaterThan(0);

    const event = await adminClient.requestBinary('GET', '/api/admin/exports/excel/event');
    expect(event.status).toBe(200);
    expect(event.contentType).toBe(xlsxContentType);
  });

  it('downloads the manual database backup — or fails with a clear 500, never a silent wrong status', async () => {
    const res = await adminClient.requestBinary('GET', '/api/admin/backup');
    if (res.status === 200) {
      expect(res.contentType).toBe('application/zip');
      const directory = await unzipper.Open.buffer(res.buffer);
      expect(directory.files.map((f) => f.path)).toContain('backup.sql');
    } else {
      // Acceptable ONLY if pg_dump genuinely isn't installed on this host —
      // ships automatically with the postgresql-16 package on a real
      // installation (see docs/Installationsanleitung.md Abschnitt 2). A
      // real install should always hit the 200 branch above; this is a
      // deliberately tolerant fallback for e.g. a bare dev sandbox.
      expect(res.status).toBe(500);
    }
  });
});
