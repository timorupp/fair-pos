/**
 * Integration tests for the Bonstorno admin endpoint.
 *
 * Covers the happy path (cancellation invoice + order_items created with
 * negative impact on the day's cash bucket) plus the validation guards
 * (missing reason, wrong booking_type, empty items).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import {
  createTestArticle, createTestPrinter, createTestRegister, createTestUser,
  seedReceiptCounter,
} from '../../test/fixtures.js';
import { computeClosingTotals, type ClosingItem, type ClosingInvoice } from '../../closing/totals.js';
import { config } from '../../config.js';

const TSE_CLI_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test',
  'fixtures',
  'tseCliStub.sh',
);

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let registerId: string;
let articleId: string;
let cancellationReasonId: string;
let freeOfChargeReasonId: string;

beforeEach(async () => {
  await truncateAllTables();
  config.tseMountPoint = null;
  config.tseClientId = null;
  delete process.env['TSE_STUB_STDOUT'];
  delete process.env['TSE_STUB_EXIT_CODE'];
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);

  const printer = await createTestPrinter();
  const reg = await createTestRegister({ type: 'receipt_register', printerId: printer.id });
  registerId = reg.id;

  const art = await createTestArticle({ name: 'Bier', price: 4, taxRate: 19 });
  articleId = art.id;

  const cancelReason = await pool.query<{ id: string }>(
    `INSERT INTO cancellation_reason (name, booking_type)
     VALUES ('Retoure', 'cancellation') RETURNING id`,
  );
  cancellationReasonId = cancelReason.rows[0]!.id;

  const freeReason = await pool.query<{ id: string }>(
    `INSERT INTO cancellation_reason (name, booking_type)
     VALUES ('Mitarbeiter', 'free_of_charge') RETURNING id`,
  );
  freeOfChargeReasonId = freeReason.rows[0]!.id;

  await seedReceiptCounter(0);
});

describe('POST /api/admin/cancellations', () => {
  it('creates a cancellation invoice with N order_items', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        note: 'Original Beleg 23',
        items: [{ article_id: articleId, quantity: 3 }],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.receipt_number).toBe(1);

    const inv = await pool.query<{ receipt_type: string; cancellation_note: string | null }>(
      `SELECT receipt_type, cancellation_note FROM invoice WHERE id = $1`, [body.invoice_id],
    );
    expect(inv.rows[0]!.receipt_type).toBe('cancellation');
    expect(inv.rows[0]!.cancellation_note).toBe('Original Beleg 23');

    const items = await pool.query(
      `SELECT id FROM order_item WHERE invoice_id = $1`, [body.invoice_id],
    );
    expect(items.rowCount).toBe(3);
  });

  it('reduces total_cash via the cancellation receipt_type', async () => {
    // Seed one sale of 10 EUR, then cancel 4 EUR worth → cash should land at 6.
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method)
       VALUES ($1, 100, 'sales_receipt', 'cash')`,
      [registerId],
    );
    const sale = await pool.query<{ id: string }>(
      `SELECT id FROM invoice WHERE receipt_number = 100`,
    );
    await pool.query(
      `INSERT INTO order_item (invoice_id, register_id, article_id, article_name, article_category_name, tax_rate, price, status)
       VALUES ($1, $2, $3, 'X', 'C', 19, 10, 'paid')`,
      [sale.rows[0]!.id, registerId, articleId],
    );

    const app = await getTestApp();
    await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items: [{ article_id: articleId, quantity: 1 }],   // 4 EUR
      },
    });

    // Aggregate the two invoices through the same code path the Z-Bon uses.
    const invs = await pool.query<{
      id: string; payment_method: 'cash' | 'card'; receipt_type: ClosingInvoice['receipt_type'];
    }>(`SELECT id, payment_method, receipt_type FROM invoice WHERE register_id = $1`, [registerId]);
    const allItems = await pool.query<{
      invoice_id: string; status: ClosingItem['status'];
      tax_rate: string; price: string; deposit_price: string | null;
    }>(`SELECT invoice_id, status, tax_rate::text, price::text, deposit_price::text
          FROM order_item WHERE register_id = $1`, [registerId]);
    const itemsByInvoice = new Map<string, ClosingItem[]>();
    for (const r of allItems.rows) {
      const list = itemsByInvoice.get(r.invoice_id) ?? [];
      list.push({ status: r.status, tax_rate: Number(r.tax_rate), price: Number(r.price),
                  deposit_price: r.deposit_price ? Number(r.deposit_price) : null });
      itemsByInvoice.set(r.invoice_id, list);
    }
    const totals = computeClosingTotals(invs.rows.map((i) => ({ ...i, items: itemsByInvoice.get(i.id) ?? [] })));
    expect(totals.total_cash).toBe(6);
  });

  it('rejects a reason whose booking_type is not cancellation', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: freeOfChargeReasonId,
        items: [{ article_id: articleId, quantity: 1 }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty item list with 400', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items: [],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a non-integer or zero quantity', async () => {
    const app = await getTestApp();
    const r1 = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items: [{ article_id: articleId, quantity: 0 }],
      },
    });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items: [{ article_id: articleId, quantity: 1.5 }],
      },
    });
    expect(r2.statusCode).toBe(400);
  });

  it('signs the Bonstorno as Kassenbeleg-V1 and stores the TSE fields when configured', async () => {
    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: { transactionNumber: 5, signatureCounter: 2, logTime: 1735689600, signature: 'cc', serialNumber: 'dd' },
    });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items: [{ article_id: articleId, quantity: 1 }],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().tse_warning).toBeNull();

    const inv = await pool.query(
      `SELECT tse_transaction_number, tse_signature FROM invoice WHERE id = $1`,
      [response.json().invoice_id],
    );
    expect(inv.rows[0]).toMatchObject({ tse_transaction_number: '5', tse_signature: 'cc' });
  });

  it('does not block a Bonstorno when the TSE is not configured — invoice still created, warning returned', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/cancellations',
      headers: { cookie: adminCookie },
      payload: {
        register_id: registerId,
        cancellation_reason_id: cancellationReasonId,
        items: [{ article_id: articleId, quantity: 1 }],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().tse_warning).toMatch(/nicht verfügbar/);
  });
});
