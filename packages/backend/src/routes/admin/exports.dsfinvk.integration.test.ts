/**
 * Integration test for the DSFinV-K export endpoint — verifies the DB-load →
 * row-build → ZIP wiring end to end. The row-building rules themselves are
 * unit-tested in exports/dsfinvk/rows.test.ts; this only checks that the
 * route produces a well-formed ZIP containing the expected files for a
 * realistic Kassenabschluss.
 */
import unzipper from 'unzipper';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import {
  createTestArticle, createTestCategory, createTestRegister, createTestUser, setSystemSetting,
} from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
  await setSystemSetting('company_name', 'Testverein e.V.');
  await setSystemSetting('company_street', 'Hauptstr. 1');
  await setSystemSetting('company_postal_code', '12345');
  await setSystemSetting('company_city', 'Musterstadt');
  await setSystemSetting('company_tax_number', '12/345/67890');
  await setSystemSetting('system_serial', 'FairPOS-2026-TESTAAAAAA');
});

/** Extracts the set of file names contained in a ZIP buffer. */
async function zipEntryNames(buf: Buffer): Promise<string[]> {
  const directory = await unzipper.Open.buffer(buf);
  return directory.files.map((f) => f.path);
}

describe('GET /api/admin/exports/dsfinvk/:closingId', () => {
  it('returns 404 for an unknown closing', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('builds a ZIP with the Kassenbeleg-V1 transaction reflected in transactions.csv and lines.csv', async () => {
    const category = await createTestCategory({ name: 'Getränke', taxRate: 19 });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'receipt_register' });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash, total_cancellations
       ) VALUES ($1, 1, false, '2026-08-05', 5, 5, 0, 0, 5, 0)
       RETURNING id`,
      [register.id],
    );
    const closingId = closing.rows[0]!.id;

    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoice (
         register_id, receipt_number, receipt_type, payment_method, daily_closing_id,
         tse_transaction_number, tse_signature_counter, tse_signature, tse_start_time, tse_end_time, tse_serial_number
       ) VALUES ($1, 42, 'sales_receipt', 'cash', $2, 7, 3, 'aabb', now(), now(), 'ccdd')
       RETURNING id`,
      [register.id, closingId],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_id, article_name, article_category_name, tax_rate, price, status)
       VALUES ($1, $2, $3, 'Bier', 'Getränke', 19, 5, 'paid')`,
      [invoice.rows[0]!.id, register.id, article.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');

    const buf = response.rawPayload;
    const names = await zipEntryNames(buf);
    expect(names).toContain('index.xml');
    expect(names).toContain('transactions.csv');
    expect(names).toContain('lines.csv');
    expect(names).toContain('transactions_tse.csv');

    const directory = await unzipper.Open.buffer(buf);
    const transactionsFile = directory.files.find((f) => f.path === 'transactions.csv')!;
    const content = (await transactionsFile.buffer()).toString('utf-8');
    expect(content).toContain('Beleg');
    expect(content).toContain('5.00');
  });

  it('emits exactly one Bonkopf row per invoice even when its order_items were placed by different staff (Bedienungskasse, multiple order rounds)', async () => {
    // Regression test: a Bedienungskasse invoice can combine order_items from
    // several order rounds placed by different servers before one of them
    // checks out — an earlier version of the loader joined order_item into
    // the invoice query and GROUP-BY'd on the (varying) user, which silently
    // multiplied one invoice into several transactions.csv rows.
    const category = await createTestCategory({ name: 'Getränke', taxRate: 19 });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'service_register' });
    const waiterA = await createTestUser({ name: 'Anna' });
    const waiterB = await createTestUser({ name: 'Ben' });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash, total_cancellations
       ) VALUES ($1, 1, false, '2026-08-05', 10, 10, 0, 0, 10, 0)
       RETURNING id`,
      [register.id],
    );
    const closingId = closing.rows[0]!.id;

    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, daily_closing_id)
       VALUES ($1, 42, 'sales_receipt', 'cash', $2) RETURNING id`,
      [register.id, closingId],
    );
    const invoiceId = invoice.rows[0]!.id;

    // Two order_items on the same invoice, placed by two different waiters
    // (as if from two separate order rounds), then both checked out together.
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, user_name, article_id, article_name, article_category_name, tax_rate, price, status, created_at)
       VALUES ($1, $2, $3, $4, 'Bier', 'Getränke', 19, 5, 'paid', now() - interval '10 minutes')`,
      [invoiceId, register.id, waiterA.name, article.id],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, user_name, article_id, article_name, article_category_name, tax_rate, price, status, created_at)
       VALUES ($1, $2, $3, $4, 'Bier', 'Getränke', 19, 5, 'paid', now())`,
      [invoiceId, register.id, waiterB.name, article.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const directory = await unzipper.Open.buffer(response.rawPayload);
    const transactionsFile = directory.files.find((f) => f.path === 'transactions.csv')!;
    const lines = (await transactionsFile.buffer()).toString('utf-8').trim().split('\r\n');
    // Header + exactly one data row for the one invoice.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('10.00'); // UMS_BRUTTO across both positions
    // The deterministic representative operator is the earliest order_item's — Anna's.
    expect(lines[1]).toContain('Anna');

    const linesFile = directory.files.find((f) => f.path === 'lines.csv')!;
    const lineRows = (await linesFile.buffer()).toString('utf-8').trim().split('\r\n');
    expect(lineRows).toHaveLength(3); // header + 2 article positions
  });
});
