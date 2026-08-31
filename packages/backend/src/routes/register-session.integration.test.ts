/**
 * Integration tests for the register-session endpoints — covers the Bonkasse
 * checkout, Bedienungskasse order/checkout/cancel flow, and the "register
 * locked due to pending Z-Bon" gate.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsRegisterUser } from '../test/app-helpers.js';
import {
  assignRegisterToUser, createTestArticle, createTestPrinter,
  createTestRegister, createTestUser, seedReceiptCounter, setSystemSetting,
} from '../test/fixtures.js';
import { config } from '../config.js';

/** Test double for native/tse-cli — see tse/client.test.ts for the same fixture. */
const TSE_CLI_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'tseCliStub.sh',
);

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let userId: string;
let userCookie: string;
let registerId: string;
let serviceRegisterId: string;
let articleId: string;
let printerId: string;

beforeEach(async () => {
  await truncateAllTables();
  const app = await getTestApp();

  // config.tseMountPoint/tseClientId are mutated in-place by applyTseSettings
  // (see tse/settings.ts) and outlive truncateAllTables — reset explicitly so
  // TSE tests don't leak configuration into unrelated checkout tests.
  config.tseMountPoint = null;
  config.tseClientId = null;
  delete process.env['TSE_STUB_STDOUT'];
  delete process.env['TSE_STUB_EXIT_CODE'];

  const u = await createTestUser({ isAdmin: false });
  userId = u.id;
  userCookie = await loginAsRegisterUser(app, u.pin);

  const p = await createTestPrinter({ isDefault: true });
  printerId = p.id;

  const r = await createTestRegister({ type: 'receipt_register', printerId });
  registerId = r.id;
  await assignRegisterToUser(userId, registerId);

  const sr = await createTestRegister({ type: 'service_register' });
  serviceRegisterId = sr.id;
  await assignRegisterToUser(userId, serviceRegisterId);

  const a = await createTestArticle({ price: 5, taxRate: 19, printerId });
  articleId = a.id;

  await seedReceiptCounter(0);
  await setSystemSetting('company_name', 'Testverein');
  await setSystemSetting('system_serial', 'FairPOS-2026-TESTAAAAAA');
});

describe('Bonkasse: POST /api/register-session/registers/:id/checkout', () => {
  it('creates an invoice with the next receipt number and inserts order_items per unit', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 3 }] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.receipt_number).toBe(1);
    expect(body.receipt_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const items = await pool.query(
      `SELECT id FROM order_item WHERE invoice_id = $1`, [body.invoice_id],
    );
    expect(items.rowCount).toBe(3);
  });

  it('vergibt fortlaufende Belegnummern bei aufeinanderfolgenden Checkouts', async () => {
    const app = await getTestApp();
    const r1 = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    const r2 = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(r1.json().receipt_number).toBe(1);
    expect(r2.json().receipt_number).toBe(2);
  });

  it('rejects checkout to a register the user is not assigned to with 403', async () => {
    const app = await getTestApp();
    const otherReg = await createTestRegister({ type: 'receipt_register' });
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${otherReg.id}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects empty positions array with 400', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects non-integer quantities with 400', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1.5 }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('enqueues one self-pickup slip per article-unit on the register printer', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 3 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().slips_enqueued).toBe(3);
    expect(response.json().slip_printer_missing).toBe(false);
    const jobs = await pool.query<{ printer_id: string; type: string }>(
      `SELECT printer_id, type FROM print_job WHERE type = 'order_slip'`,
    );
    expect(jobs.rowCount).toBe(3);
    // All three slips go to the SAME printer (the register's), not split per article.
    const printerIds = new Set(jobs.rows.map((r) => r.printer_id));
    expect(printerIds.size).toBe(1);
  });

  it('emits an article slip with inline deposit line when print_deposit_receipt=false', async () => {
    const depositArticle = await createTestArticle({
      price: 5, depositPrice: 2, printDepositReceipt: false, printerId,
    });
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: depositArticle.id, quantity: 2 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().slips_enqueued).toBe(2);    // one article slip per unit, no extra deposit slip
    const jobs = await pool.query<{ content: string }>(
      `SELECT content FROM print_job WHERE type = 'order_slip'`,
    );
    expect(jobs.rowCount).toBe(2);
    for (const row of jobs.rows) {
      // `content` is base64 — decode and inspect the bytes. We can't use
      // `toString('ascii')` here because the slip is CP858-encoded (the €
      // sign is byte 0xd5), so non-ASCII bytes would turn into '?'.
      const buf = Buffer.from(row.content, 'base64');
      expect(buf.includes('SELBSTABHOLER')).toBe(true);
      // The article line and the Pfand line are now right-aligned two-column
      // rows. Spaces sit between the label and the amount, so we check the
      // pieces separately. The CP858 € byte is 0xd5.
      expect(buf.includes('+ Pfand')).toBe(true);
      expect(buf.includes(Buffer.from('2.00 ' + '\xd5', 'binary'))).toBe(true);
    }
  });

  it('emits article slip + separate Pfandbon when print_deposit_receipt=true', async () => {
    const depositArticle = await createTestArticle({
      price: 5, depositPrice: 2, printDepositReceipt: true, printerId,
    });
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: depositArticle.id, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().slips_enqueued).toBe(2);
    const jobs = await pool.query<{ content: string }>(
      `SELECT content FROM print_job WHERE type = 'order_slip' ORDER BY created_at`,
    );
    expect(jobs.rowCount).toBe(2);
    const decoded = jobs.rows.map((r) => Buffer.from(r.content, 'base64'));
    // Article slip first (no inline deposit line), Pfandbon second.
    expect(decoded[0]!.includes('SELBSTABHOLER')).toBe(true);
    expect(decoded[0]!.includes('Pfand')).toBe(false);
    expect(decoded[1]!.includes('PFAND')).toBe(true);
    // "2.00 " followed by the CP858 € byte (0xd5).
    expect(decoded[1]!.includes(Buffer.from('2.00 ' + '\xd5', 'binary'))).toBe(true);
  });

  it('still completes checkout when no printer is available, surfaces flag', async () => {
    // Detach the register's printer and ensure no default printer exists.
    await pool.query(`UPDATE register SET printer_id = NULL WHERE id = $1`, [registerId]);
    await pool.query(`UPDATE printer SET is_default = false`);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 2 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().slips_enqueued).toBe(0);
    expect(response.json().slip_printer_missing).toBe(true);
    const jobs = await pool.query(
      `SELECT id FROM print_job WHERE type = 'order_slip'`,
    );
    expect(jobs.rowCount).toBe(0);
  });
});

describe('GET /api/register-session/registers/:id — layout slots (Task #91 follow-up)', () => {
  it('excludes hidden slots entirely and includes the custom label of visible ones', async () => {
    const layout = await pool.query<{ id: string }>(
      `INSERT INTO register_layout (name, grid_cols, grid_rows, event_id) VALUES ('L', 2, 2, $1) RETURNING id`,
      [config.activeEventId],
    );
    const layoutId = layout.rows[0]!.id;
    const hiddenArticle = await createTestArticle({ name: 'Versteckt' });
    await pool.query(
      `INSERT INTO register_layout_slot (register_layout_id, article_id, grid_row, grid_col, color, label, hidden)
       VALUES ($1, $2, 0, 0, '#111111', 'Meine Taste', false),
              ($1, $3, 1, 1, '#222222', null, true)`,
      [layoutId, articleId, hiddenArticle.id],
    );
    await pool.query(`UPDATE register SET layout_id = $1 WHERE id = $2`, [layoutId, registerId]);

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/register-session/registers/${registerId}`,
      headers: { cookie: userCookie },
    });
    expect(response.statusCode).toBe(200);
    const slots = response.json().layout.slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].article_id).toBe(articleId);
    expect(slots[0].label).toBe('Meine Taste');
  });

  it('only lists articles of the active event (Task #95)', async () => {
    const otherEvent = await pool.query<{ id: string }>(
      `INSERT INTO event (name, start_time, end_time) VALUES ('Anderes Fest', now(), now() + interval '1 day') RETURNING id`,
    );
    await createTestArticle({ name: 'Fremd', eventId: otherEvent.rows[0]!.id });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/register-session/registers/${registerId}`,
      headers: { cookie: userCookie },
    });
    expect(response.statusCode).toBe(200);
    const names = (response.json().articles as { name: string }[]).map((a) => a.name);
    expect(names).not.toContain('Fremd');
  });
});

describe('GET /api/register-session/invoices/:id/qr.png', () => {
  it('renders a PNG for a valid invoice', async () => {
    const app = await getTestApp();
    const checkout = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    const invoiceId = checkout.json().invoice_id;

    const response = await app.inject({
      method: 'GET', url: `/api/register-session/invoices/${invoiceId}/qr.png`,
      headers: { cookie: userCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
  });

  it('404s for an invoice belonging to a register the user has no access to', async () => {
    const app = await getTestApp();
    const checkout = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    const invoiceId = checkout.json().invoice_id;

    const otherUser = await createTestUser({ isAdmin: false });
    const otherCookie = await loginAsRegisterUser(app, otherUser.pin);
    const response = await app.inject({
      method: 'GET', url: `/api/register-session/invoices/${invoiceId}/qr.png`,
      headers: { cookie: otherCookie },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Bonkasse checkout: TSE-Signierung', () => {
  it('stores the TSE signature on the invoice when signing succeeds', async () => {
    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: { transactionNumber: 7, signatureCounter: 3, logTime: 1735689600, signature: 'aa', serialNumber: 'bb' },
    });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tse_warning).toBeNull();

    const invoice = await pool.query(
      `SELECT tse_transaction_number, tse_signature, tse_signature_counter, tse_serial_number
         FROM invoice WHERE id = $1`,
      [response.json().invoice_id],
    );
    expect(invoice.rows[0]).toMatchObject({
      tse_transaction_number: '7', tse_signature: 'aa', tse_signature_counter: '3', tse_serial_number: 'bb',
    });
  });

  it('does NOT block the sale when the TSE call fails — invoice is created without a signature and a warning is returned', async () => {
    // AEAO zu § 146a Nr. 1.14.3: continued operation without a working TSE is
    // explicitly tolerated as long as only the TSE (not the whole system)
    // fails — see docs/TSE-Integration.md → "TSE-Ausfall".
    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1234, message: 'boom' } });
    process.env['TSE_STUB_EXIT_CODE'] = '1';

    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tse_warning).toBeTruthy();

    const invoice = await pool.query(
      `SELECT tse_transaction_number, tse_signature FROM invoice WHERE id = $1`,
      [response.json().invoice_id],
    );
    expect(invoice.rows[0]).toMatchObject({ tse_transaction_number: null, tse_signature: null });

    const items = await pool.query(
      `SELECT id FROM order_item WHERE invoice_id = $1`, [response.json().invoice_id],
    );
    expect(items.rowCount).toBe(1);
  });

  it('surfaces a warning when the TSE is not configured at all — sale still succeeds', async () => {
    // Missing configuration is treated the same as an outage: no TSE data
    // means no signature either way, so the operator gets the same warning.
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tse_warning).toMatch(/nicht verfügbar/);
  });
});

describe('Bedienungskasse: order + checkout flow', () => {
  let tableId: string;

  beforeEach(async () => {
    await pool.query(`INSERT INTO floor_plan_column (label, col_order, event_id) VALUES ('A', 0, $1)`, [config.activeEventId]);
    await pool.query(`INSERT INTO floor_plan_row    (label, row_order, event_id) VALUES ('1', 0, $1)`, [config.activeEventId]);
    const t = await pool.query<{ id: string }>(
      `INSERT INTO dining_table (name, col_label, row_label, status, event_id)
       VALUES ('A1', 'A', '1', 'active', $1) RETURNING id`,
      [config.activeEventId],
    );
    tableId = t.rows[0]!.id;
  });

  it('places an order and creates one open order_item per unit', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 2 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    const items = await pool.query(
      `SELECT id FROM order_item WHERE dining_table_id = $1 AND status = 'open'`, [tableId],
    );
    expect(items.rowCount).toBe(2);
  });

  it('checkout converts selected open items to paid and creates an invoice', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 3 }] },
    });
    const openItems = await app.inject({
      method: 'GET',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/open-items`,
      headers: { cookie: userCookie },
    });
    const groupKey = openItems.json().groups[0].group_key;

    const checkoutResult = await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/checkout`,
      headers: { cookie: userCookie },
      payload: { quantities: [{ group_key: groupKey, count: 2 }] },
    });
    expect(checkoutResult.statusCode).toBe(200);
    expect(checkoutResult.json().items_charged).toBe(2);

    const paid = await pool.query(
      `SELECT COUNT(*)::int AS n FROM order_item WHERE dining_table_id = $1 AND status = 'paid'`,
      [tableId],
    );
    expect(paid.rows[0]!.n).toBe(2);
    const stillOpen = await pool.query(
      `SELECT COUNT(*)::int AS n FROM order_item WHERE dining_table_id = $1 AND status = 'open'`,
      [tableId],
    );
    expect(stillOpen.rows[0]!.n).toBe(1);
  });

  it('cancel marks selected items as cancelled with the reason', async () => {
    const app = await getTestApp();
    const reason = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_reason (name, booking_type, event_id)
       VALUES ('Test-Storno', 'cancellation', $1) RETURNING id`,
      [config.activeEventId],
    );
    await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 2 }] },
    });
    const open = await app.inject({
      method: 'GET',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/open-items`,
      headers: { cookie: userCookie },
    });
    const groupKey = open.json().groups[0].group_key;

    const cancel = await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/cancel`,
      headers: { cookie: userCookie },
      payload: {
        quantities: [{ group_key: groupKey, count: 1 }],
        cancellation_reason_id: reason.rows[0]!.id,
      },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().items_cancelled).toBe(1);

    const cancelled = await pool.query(
      `SELECT COUNT(*)::int AS n FROM order_item WHERE dining_table_id = $1 AND status = 'cancelled'`,
      [tableId],
    );
    expect(cancelled.rows[0]!.n).toBe(1);
  });
});

describe('Bedienungskasse: TSE-Signierung (AVBestellung / Kassenbeleg-V1 / AVSonstige)', () => {
  let tableId: string;

  beforeEach(async () => {
    await pool.query(`INSERT INTO floor_plan_column (label, col_order, event_id) VALUES ('A', 0, $1)`, [config.activeEventId]);
    await pool.query(`INSERT INTO floor_plan_row    (label, row_order, event_id) VALUES ('1', 0, $1)`, [config.activeEventId]);
    const t = await pool.query<{ id: string }>(
      `INSERT INTO dining_table (name, col_label, row_label, status, event_id)
       VALUES ('A1', 'A', '1', 'active', $1) RETURNING id`,
      [config.activeEventId],
    );
    tableId = t.rows[0]!.id;
  });

  it('signs one AVBestellung per Bestellvorgang and stores it on service_order, not per position', async () => {
    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: { transactionNumber: 1, signatureCounter: 1, logTime: 1735689600, signature: 'aa', serialNumber: 'bb' },
    });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 3 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tse_warning).toBeNull();

    const orders = await pool.query(`SELECT tse_transaction_number, tse_signature FROM service_order`);
    expect(orders.rowCount).toBe(1);
    expect(orders.rows[0]).toMatchObject({ tse_transaction_number: '1', tse_signature: 'aa' });
  });

  it('places the order without blocking when the TSE is not configured, and warns', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tse_warning).toMatch(/nicht verfügbar/);
    const items = await pool.query(`SELECT id FROM order_item WHERE dining_table_id = $1`, [tableId]);
    expect(items.rowCount).toBe(1);
  });

  it('signs the split-checkout as Kassenbeleg-V1 and stores it on the invoice', async () => {
    const appSetup = await getTestApp();
    await appSetup.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 2 }] },
    });
    const openItems = await appSetup.inject({
      method: 'GET',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/open-items`,
      headers: { cookie: userCookie },
    });
    const groupKey = openItems.json().groups[0].group_key;

    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: { transactionNumber: 2, signatureCounter: 2, logTime: 1735689600, signature: 'cc', serialNumber: 'dd' },
    });

    const checkout = await appSetup.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/checkout`,
      headers: { cookie: userCookie },
      payload: { quantities: [{ group_key: groupKey, count: 2 }] },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().tse_warning).toBeNull();

    const inv = await pool.query(
      `SELECT tse_transaction_number, tse_signature FROM invoice WHERE id = $1`,
      [checkout.json().invoice_id],
    );
    expect(inv.rows[0]).toMatchObject({ tse_transaction_number: '2', tse_signature: 'cc' });
  });

  it('does not block the split-checkout when a configured TSE fails, and warns', async () => {
    const appSetup = await getTestApp();
    await appSetup.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    const openItems = await appSetup.inject({
      method: 'GET',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/open-items`,
      headers: { cookie: userCookie },
    });
    const groupKey = openItems.json().groups[0].group_key;

    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1, message: 'boom' } });
    process.env['TSE_STUB_EXIT_CODE'] = '1';

    const checkout = await appSetup.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/checkout`,
      headers: { cookie: userCookie },
      payload: { quantities: [{ group_key: groupKey, count: 1 }] },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json().tse_warning).toMatch(/nicht verfügbar/);
    const paid = await pool.query(`SELECT COUNT(*)::int AS n FROM order_item WHERE status = 'paid'`);
    expect(paid.rows[0]!.n).toBe(1);
  });

  it('signs a cancellation as AVSonstige and stores it on order_cancellation', async () => {
    const appSetup = await getTestApp();
    const reason = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_reason (name, booking_type, event_id)
       VALUES ('Test-Storno', 'cancellation', $1) RETURNING id`,
      [config.activeEventId],
    );
    await appSetup.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/orders`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    const open = await appSetup.inject({
      method: 'GET',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/open-items`,
      headers: { cookie: userCookie },
    });
    const groupKey = open.json().groups[0].group_key;

    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: { transactionNumber: 3, signatureCounter: 3, logTime: 1735689600, signature: 'ee', serialNumber: 'ff' },
    });

    const cancel = await appSetup.inject({
      method: 'POST',
      url: `/api/register-session/registers/${serviceRegisterId}/tables/${tableId}/cancel`,
      headers: { cookie: userCookie },
      payload: { quantities: [{ group_key: groupKey, count: 1 }], cancellation_reason_id: reason.rows[0]!.id },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().tse_warning).toBeNull();

    const cancellations = await pool.query(`SELECT tse_transaction_number, tse_signature FROM order_cancellation`);
    expect(cancellations.rowCount).toBe(1);
    expect(cancellations.rows[0]).toMatchObject({ tse_transaction_number: '3', tse_signature: 'ee' });
  });
});

describe('Register-Sperre durch ausstehende Tagesabschlüsse', () => {
  it('blocks Bonkasse checkout with 409 when a past calendar day needs a Z-Bon', async () => {
    const app = await getTestApp();
    // Plant a past invoice yesterday with no closing → register has 1 pending day.
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, created_at)
       VALUES ($1, 999, 'sales_receipt', 'cash', $2)`,
      [registerId, `${dateStr} 18:00:00`],
    );
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      headers: { cookie: userCookie },
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().locked).toBe(true);
    expect(response.json().pending_days).toContain(dateStr);
  });
});

describe('Archivierte Kassen (Task #55)', () => {
  it('excludes an archived register from GET /me', async () => {
    await pool.query('UPDATE register SET is_active = false WHERE id = $1', [registerId]);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/register-session/me',
      headers: { cookie: userCookie },
    });
    expect(response.statusCode).toBe(200);
    const ids = response.json().registers.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(registerId);
    expect(ids).toContain(serviceRegisterId);
  });

  it('returns 404 for GET /registers/:id on an archived register even though the user is still assigned', async () => {
    await pool.query('UPDATE register SET is_active = false WHERE id = $1', [registerId]);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: `/api/register-session/registers/${registerId}`,
      headers: { cookie: userCookie },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('Deaktivierte Benutzer (Task #56)', () => {
  it('logs a deactivated operator out of an already-open register session immediately', async () => {
    await pool.query('UPDATE "user" SET is_active = false WHERE id = $1', [userId]);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/register-session/me',
      headers: { cookie: userCookie },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('Authentication required', () => {
  it('all register-session endpoints reject requests without a register_session', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: `/api/register-session/registers/${registerId}/checkout`,
      payload: { positions: [{ article_id: articleId, quantity: 1 }] },
    });
    expect(response.statusCode).toBe(401);
  });
});
