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
import { config } from '../../config.js';
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
    const category = await createTestCategory({ name: 'Getränke', taxCategory: 'standard' });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'receipt_register' });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 1, false, '2026-08-05', 5, 5, 0, 0, 5, 0, 0, 0)
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
      `INSERT INTO order_item (invoice_id, register_id, article_id, article_name, article_category_name, tax_rate, tax_category, price, status)
       VALUES ($1, $2, $3, 'Bier', 'Getränke', 19, 'standard', 5, 'paid')`,
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

  it('emits a negative UMS_BRUTTO for a Bonstorno invoice via its already-negative order_item.price (D-068 — no isStornoBeleg flag needed anymore)', async () => {
    const category = await createTestCategory({ name: 'Getränke', taxCategory: 'standard' });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'receipt_register' });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 1, false, '2026-08-05', -5, -5, 0, 0, -5, -5, 0, 0)
       RETURNING id`,
      [register.id],
    );
    const closingId = closing.rows[0]!.id;

    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoice (
         register_id, receipt_number, receipt_type, payment_method, daily_closing_id
       ) VALUES ($1, 42, 'cancellation', 'cash', $2)
       RETURNING id`,
      [register.id, closingId],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_id, article_name, article_category_name, tax_rate, tax_category, price, status)
       VALUES ($1, $2, $3, 'Bier', 'Getränke', 19, 'standard', -5, 'paid')`,
      [invoice.rows[0]!.id, register.id, article.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const directory = await unzipper.Open.buffer(response.rawPayload);
    const transactionsFile = directory.files.find((f) => f.path === 'transactions.csv')!;
    const content = (await transactionsFile.buffer()).toString('utf-8');
    expect(content).toContain('-5.00');

    const linesFile = directory.files.find((f) => f.path === 'lines.csv')!;
    const linesContent = (await linesFile.buffer()).toString('utf-8');
    expect(linesContent).toContain('5.00000'); // STK_BR is the unsigned base price, 5 decimals (D-065), see rows.test.ts

    const linesVatFile = directory.files.find((f) => f.path === 'lines_vat.csv')!;
    const linesVatContent = (await linesVatFile.buffer()).toString('utf-8');
    expect(linesVatContent).toContain('-5.00000'); // POS_BRUTTO carries the real (negative) sign, 5 decimals (D-065)
  });

  it('emits exactly one Bonkopf row per invoice even when its order_items were placed by different staff (Bedienungskasse, multiple order rounds)', async () => {
    // Regression test: a Bedienungskasse invoice can combine order_items from
    // several order rounds placed by different servers before one of them
    // checks out — an earlier version of the loader joined order_item into
    // the invoice query and GROUP-BY'd on the (varying) user, which silently
    // multiplied one invoice into several transactions.csv rows.
    const category = await createTestCategory({ name: 'Getränke', taxCategory: 'standard' });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'service_register' });
    const waiterA = await createTestUser({ name: 'Anna' });
    const waiterB = await createTestUser({ name: 'Ben' });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 1, false, '2026-08-05', 10, 10, 0, 0, 10, 0, 0, 0)
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
      `INSERT INTO order_item (invoice_id, register_id, user_name, article_id, article_name, article_category_name, tax_rate, tax_category, price, status, created_at)
       VALUES ($1, $2, $3, $4, 'Bier', 'Getränke', 19, 'standard', 5, 'paid', now() - interval '10 minutes')`,
      [invoiceId, register.id, waiterA.name, article.id],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, user_name, article_id, article_name, article_category_name, tax_rate, tax_category, price, status, created_at)
       VALUES ($1, $2, $3, $4, 'Bier', 'Getränke', 19, 'standard', 5, 'paid', now())`,
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

  it('assigns service_order/order_cancellation rows to the correct one of two same-day closings via daily_closing_id (Task #123)', async () => {
    // Regression test for the register+business_date approximation this
    // replaced: two closings for the same register on the same calendar day
    // used to be indistinguishable by that approximation — both AVBestellung
    // rows would have shown up in both closings' exports. The persisted
    // daily_closing_id link must keep them apart.
    const register = await createTestRegister({ type: 'service_register' });
    const waiter = await createTestUser({ name: 'Clara' });
    const reason = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_reason (name, booking_type, event_id) VALUES ('Testgrund', 'cancellation', $1) RETURNING id`,
      [config.activeEventId],
    );

    const closingA = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 1, true, '2026-08-05', 0, 0, 0, 0, 0, 0, 0, 0) RETURNING id`,
      [register.id],
    );
    const closingB = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 2, true, '2026-08-05', 0, 0, 0, 0, 0, 0, 0, 0) RETURNING id`,
      [register.id],
    );

    const orderA = await pool.query<{ id: string }>(
      `INSERT INTO service_order (register_id, user_name, daily_closing_id, created_at)
       VALUES ($1, $2, $3, '2026-08-05 10:00:00') RETURNING id`,
      [register.id, waiter.name, closingA.rows[0]!.id],
    );
    const orderB = await pool.query<{ id: string }>(
      `INSERT INTO service_order (register_id, user_name, daily_closing_id, created_at)
       VALUES ($1, $2, $3, '2026-08-05 18:00:00') RETURNING id`,
      [register.id, waiter.name, closingB.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO order_cancellation (register_id, cancellation_reason_id, cancellation_reason_name, daily_closing_id, created_at)
       VALUES ($1, $2, 'Testgrund', $3, '2026-08-05 19:00:00')`,
      [register.id, reason.rows[0]!.id, closingB.rows[0]!.id],
    );

    const app = await getTestApp();
    const responseA = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingA.rows[0]!.id}`,
      headers: { cookie: adminCookie },
    });
    const responseB = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingB.rows[0]!.id}`,
      headers: { cookie: adminCookie },
    });

    const namesA = (await unzipper.Open.buffer(responseA.rawPayload)).files.find((f) => f.path === 'transactions.csv')!;
    const contentA = (await namesA.buffer()).toString('utf-8').trim().split('\r\n');
    expect(contentA).toHaveLength(2); // header + orderA only
    expect(contentA[1]).toContain('AVBestellung');

    const namesB = (await unzipper.Open.buffer(responseB.rawPayload)).files.find((f) => f.path === 'transactions.csv')!;
    const contentB = (await namesB.buffer()).toString('utf-8').trim().split('\r\n');
    expect(contentB).toHaveLength(3); // header + orderB + the cancellation
    expect(contentB.some((l) => l.includes('AVBestellung'))).toBe(true);
    expect(contentB.some((l) => l.includes('AVSonstige'))).toBe(true);

    // Sanity: orderA's id never appears in closing B's export and vice versa.
    expect(contentB.some((l) => l.includes(orderA.rows[0]!.id))).toBe(false);
    expect(contentA.some((l) => l.includes(orderB.rows[0]!.id))).toBe(false);
  });

  it('exports a training register\'s invoice as BON_TYP=AVTraining, still Kassenbeleg-V1, fully documented but excluded from businesscases.csv (Task #130)', async () => {
    const category = await createTestCategory({ name: 'Getränke', taxCategory: 'standard' });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'receipt_register', isTraining: true });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 1, true, '2026-08-05', 0, 0, 0, 0, 0, 0, 0, 0)
       RETURNING id`,
      [register.id],
    );
    const closingId = closing.rows[0]!.id;

    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, daily_closing_id)
       VALUES ($1, 42, 'training', 'cash', $2)
       RETURNING id`,
      [register.id, closingId],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_id, article_name, article_category_name, tax_rate, tax_category, price, status)
       VALUES ($1, $2, $3, 'Bier', 'Getränke', 19, 'standard', 5, 'paid')`,
      [invoice.rows[0]!.id, register.id, article.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const directory = await unzipper.Open.buffer(response.rawPayload);
    const names = directory.files.map((f) => f.path);
    const readCsv = async (name: string) => (await directory.files.find((f) => f.path === name)!.buffer()).toString('utf-8');

    const transactions = await readCsv('transactions.csv');
    expect(transactions).toContain('AVTraining');
    expect(transactions).toContain('5.00');

    const transactionsTse = await readCsv('transactions_tse.csv');
    expect(transactionsTse).toContain('Kassenbeleg-V1');

    const lines = await readCsv('lines.csv');
    expect(lines.trim().split('\r\n')).toHaveLength(2); // header + 1 article line — fully documented

    const datapayment = await readCsv('datapayment.csv');
    expect(datapayment.trim().split('\r\n')).toHaveLength(2); // header + 1 — still fully documented per-Vorgang

    // A closing consisting entirely of training bookings ends up with ZERO
    // rows in businesscases.csv/payment.csv — `buildDsfinvkZip` omits a CSV
    // file entirely once its row array is empty, so their correct absence
    // from the ZIP (not a header-only file) is itself the proof no training
    // amount leaked into the delivered aggregates.
    expect(names).not.toContain('businesscases.csv');
    expect(names).not.toContain('payment.csv');

    // cash_per_currency.csv always emits exactly one row (even 0.00) — its
    // amount must still be 0.00, not the training invoice's 5.00.
    const cashPerCurrency = await readCsv('cash_per_currency.csv');
    expect(cashPerCurrency).toContain('0.00');
    expect(cashPerCurrency).not.toContain('5.00');
  });

  it('exports a Bonstorno on a training register as BON_TYP=AVTraining (not Beleg), while still negated/isBonstorno-classified per D-068/D-069 (Task #130)', async () => {
    const category = await createTestCategory({ name: 'Getränke', taxCategory: 'standard' });
    const article = await createTestArticle({ name: 'Bier', price: 5, categoryId: category.id });
    const register = await createTestRegister({ type: 'receipt_register', isTraining: true });

    const closing = await pool.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, is_zero_closing, business_date,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero, total_cash,
         total_bonstorno, total_free, total_order_cancellations
       ) VALUES ($1, 1, true, '2026-08-05', 0, 0, 0, 0, 0, 0, 0, 0)
       RETURNING id`,
      [register.id],
    );
    const closingId = closing.rows[0]!.id;

    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, daily_closing_id)
       VALUES ($1, 42, 'cancellation', 'cash', $2)
       RETURNING id`,
      [register.id, closingId],
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_id, article_name, article_category_name, tax_rate, tax_category, price, status)
       VALUES ($1, $2, $3, 'Bier', 'Getränke', 19, 'standard', -5, 'paid')`,
      [invoice.rows[0]!.id, register.id, article.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/dsfinvk/${closingId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const directory = await unzipper.Open.buffer(response.rawPayload);
    const names = directory.files.map((f) => f.path);
    const transactionsFile = directory.files.find((f) => f.path === 'transactions.csv')!;
    const content = (await transactionsFile.buffer()).toString('utf-8');
    expect(content).toContain('AVTraining');
    expect(content).not.toContain(';Beleg;'); // BON_TYP column must not read "Beleg" for this row
    expect(content).toContain('-5.00');

    // Same reasoning as the previous test: an entirely-training closing has
    // no businesscases.csv rows at all, so `buildDsfinvkZip` omits the file
    // — including the Bonstorno's negated amount, which never reaches the
    // Z_GV_TYP aggregate either.
    expect(names).not.toContain('businesscases.csv');
  });
});
