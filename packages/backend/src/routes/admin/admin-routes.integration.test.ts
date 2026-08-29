/**
 * Integration tests for the smaller admin-CRUD routes (categories, articles,
 * users, layouts, tables, invoices/reprint, excel exports) plus the
 * `ensureSystemSerial` bootstrap. One file to keep the runtime low; the
 * dedicated routes already have their own larger files (auth/closings/reports).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { config } from '../../config.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import {
  createTestArticle, createTestCategory, createTestPrinter, createTestRegister,
  createTestUser, seedReceiptCounter, setSystemSetting,
} from '../../test/fixtures.js';
import { ensureSystemSerial, initReceiptCounter } from '../../system/bootstrap.js';
import { isValidSystemSerial } from '../../system/serial.js';
import { countActiveLockouts, recordFailedAttempt } from '../../auth/rateLimit.js';

const SUDO_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'test', 'fixtures', 'sudoStub.sh',
);

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('Admin categories', () => {
  it('creates a category', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/categories',
      headers: { cookie: adminCookie },
      payload: { name: 'Getränke', tax_rate: 19 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe('Getränke');
  });

  it('rejects duplicate category name with 409', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST', url: '/api/admin/categories',
      headers: { cookie: adminCookie }, payload: { name: 'X', tax_rate: 19 },
    });
    const dup = await app.inject({
      method: 'POST', url: '/api/admin/categories',
      headers: { cookie: adminCookie }, payload: { name: 'X', tax_rate: 19 },
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe('Admin articles', () => {
  it('lists articles with category name + tax rate joined', async () => {
    const app = await getTestApp();
    const cat = await createTestCategory({ name: 'C', taxRate: 7 });
    await createTestArticle({ name: 'A', price: 5, categoryId: cat.id });
    const response = await app.inject({
      method: 'GET', url: '/api/admin/articles',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body[0].category_name).toBe('C');
    expect(Number(body[0].tax_rate)).toBe(7);
  });
});

describe('Admin users', () => {
  it('refuses to delete the currently logged-in admin', async () => {
    const app = await getTestApp();
    const me = await app.inject({
      method: 'GET', url: '/api/auth/admin/me', headers: { cookie: adminCookie },
    });
    const myId = me.json().id;
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/users/${myId}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to create two users with the same name (409)', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST', url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: { name: 'dup', password: 'pw', is_admin: false },
    });
    const dup = await app.inject({
      method: 'POST', url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: { name: 'dup', password: 'pw', is_admin: false },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('creates a non-admin user without a password (register users authenticate via PIN, not password)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: { name: 'no-password-operator', is_admin: false },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().is_admin).toBe(false);
  });

  it('refuses to create an admin user without a password (400)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: { name: 'passwordless-admin', is_admin: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Passwort erforderlich für Administrator');
  });

  it('deletes a user with no history references (hard delete, Task #56)', async () => {
    const app = await getTestApp();
    const unused = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/users/${unused.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
  });

  it('returns 409 with a clear message instead of a raw 500 when the user has a cash transaction, and keeps the user (Task #56)', async () => {
    const app = await getTestApp();
    const cashier = await createTestUser({ isAdmin: false });
    const register = await createTestRegister();
    await pool.query(
      `INSERT INTO cash_transaction (register_id, user_id, type, amount) VALUES ($1, $2, 'deposit', 10)`,
      [register.id, cashier.id],
    );

    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/users/${cashier.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/deaktivieren/);

    const stillThere = await pool.query('SELECT id FROM "user" WHERE id = $1', [cashier.id]);
    expect(stillThere.rowCount).toBe(1);
  });

  it('refuses to deactivate the currently logged-in admin (Task #56)', async () => {
    const app = await getTestApp();
    const me = await app.inject({
      method: 'GET', url: '/api/auth/admin/me', headers: { cookie: adminCookie },
    });
    const myId = me.json().id;
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${myId}`,
      headers: { cookie: adminCookie },
      payload: { is_active: false },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to demote the currently logged-in admin (security audit follow-up)', async () => {
    const app = await getTestApp();
    const me = await app.inject({
      method: 'GET', url: '/api/auth/admin/me', headers: { cookie: adminCookie },
    });
    const myId = me.json().id;
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${myId}`,
      headers: { cookie: adminCookie },
      payload: { is_admin: false },
    });
    expect(response.statusCode).toBe(400);

    const stillAdmin = await pool.query('SELECT is_admin FROM "user" WHERE id = $1', [myId]);
    expect(stillAdmin.rows[0]?.is_admin).toBe(true);
  });

  it('deactivates a user via PUT is_active=false without deleting them (Task #56)', async () => {
    const app = await getTestApp();
    const cashier = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${cashier.id}`,
      headers: { cookie: adminCookie },
      payload: { is_active: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().is_active).toBe(false);

    const stillThere = await pool.query('SELECT is_active FROM "user" WHERE id = $1', [cashier.id]);
    expect(stillThere.rows[0]?.is_active).toBe(false);
  });
});

describe('Admin users: PIN management (Task #90)', () => {
  it('GET /api/admin/users reports has_pin without ever exposing the hash', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'GET', url: '/api/admin/users',
      headers: { cookie: adminCookie },
    });
    const row = response.json().find((u: { id: string }) => u.id === user.id);
    expect(row.has_pin).toBe(true);
    expect(row.pin_hash).toBeUndefined();
  });

  it('POST /:id/pin/generate returns a well-formed candidate without saving it', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const before = await pool.query('SELECT pin_hash FROM "user" WHERE id = $1', [user.id]);

    const response = await app.inject({
      method: 'POST', url: `/api/admin/users/${user.id}/pin/generate`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().pin).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    const after = await pool.query('SELECT pin_hash FROM "user" WHERE id = $1', [user.id]);
    expect(after.rows[0]?.pin_hash).toBe(before.rows[0]?.pin_hash); // unchanged — not saved yet
  });

  it('PUT /:id/pin saves a manually entered PIN (with or without hyphens)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${user.id}/pin`,
      headers: { cookie: adminCookie },
      payload: { pin: 'abc-defgh-j' },
    });
    expect(response.statusCode).toBe(204);

    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'ABCDEFGHJ' } });
    expect(login.statusCode).toBe(200);
    expect(login.json().id).toBe(user.id);
  });

  it('PUT /:id/pin rejects a malformed PIN with 400', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${user.id}/pin`,
      headers: { cookie: adminCookie },
      payload: { pin: 'too-short' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('PUT /:id/pin rejects a PIN already assigned to a different user with 409', async () => {
    const app = await getTestApp();
    const existing = await createTestUser({ isAdmin: false });
    const other = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${other.id}/pin`,
      headers: { cookie: adminCookie },
      payload: { pin: existing.pin },
    });
    expect(response.statusCode).toBe(409);
  });

  it('PUT /:id/pin allows re-saving a user\'s own unchanged PIN (no false self-collision)', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${user.id}/pin`,
      headers: { cookie: adminCookie },
      payload: { pin: user.pin },
    });
    expect(response.statusCode).toBe(204);
  });

  it('PUT /:id/pin accepts visually-ambiguous characters (0/O/1/I) for manual entry — only the generator avoids them', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/users/${user.id}/pin`,
      headers: { cookie: adminCookie },
      payload: { pin: 'O0I1O0I1O' },
    });
    expect(response.statusCode).toBe(204);

    const login = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: 'O0I1O0I1O' } });
    expect(login.statusCode).toBe(200);
  });

  it('POST /:id/pin/print prints a PIN slip on the default printer', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    await createTestPrinter({ isDefault: true });

    const response = await app.inject({
      method: 'POST', url: `/api/admin/users/${user.id}/pin/print`,
      headers: { cookie: adminCookie },
      payload: { pin: user.pin },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().print_job_id).toBeTruthy();

    const job = await pool.query<{ type: string }>('SELECT type FROM print_job WHERE id = $1', [response.json().print_job_id]);
    expect(job.rows[0]!.type).toBe('pin_slip');
  });

  it('POST /:id/pin/print returns 400 when no default printer is configured', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'POST', url: `/api/admin/users/${user.id}/pin/print`,
      headers: { cookie: adminCookie },
      payload: { pin: user.pin },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /:id/pin/print rejects a malformed PIN with 400', async () => {
    const app = await getTestApp();
    const user = await createTestUser({ isAdmin: false });
    const response = await app.inject({
      method: 'POST', url: `/api/admin/users/${user.id}/pin/print`,
      headers: { cookie: adminCookie },
      payload: { pin: 'too-short' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Admin layouts', () => {
  it('removes out-of-bounds slots when the grid is shrunk', async () => {
    const app = await getTestApp();
    const layout = await pool.query<{ id: string }>(
      `INSERT INTO register_layout (name, grid_cols, grid_rows) VALUES ('L', 4, 4) RETURNING id`,
    );
    const article = await createTestArticle();
    await pool.query(
      `INSERT INTO register_layout_slot (register_layout_id, article_id, grid_row, grid_col, color)
       VALUES ($1, $2, 3, 3, '#ff0000')`,
      [layout.rows[0]!.id, article.id],
    );
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/layouts/${layout.rows[0]!.id}`,
      headers: { cookie: adminCookie },
      payload: { grid_cols: 2, grid_rows: 2 },
    });
    expect(response.statusCode).toBe(200);
    const slots = await pool.query(
      `SELECT * FROM register_layout_slot WHERE register_layout_id = $1`,
      [layout.rows[0]!.id],
    );
    expect(slots.rowCount).toBe(0);
  });

  it('duplicates a layout including all slots', async () => {
    const app = await getTestApp();
    const layout = await pool.query<{ id: string }>(
      `INSERT INTO register_layout (name, grid_cols, grid_rows) VALUES ('Src', 3, 3) RETURNING id`,
    );
    const article = await createTestArticle();
    await pool.query(
      `INSERT INTO register_layout_slot (register_layout_id, article_id, grid_row, grid_col, color)
       VALUES ($1, $2, 0, 0, '#000000'), ($1, $2, 1, 1, '#ffffff')`,
      [layout.rows[0]!.id, article.id],
    );
    const dup = await app.inject({
      method: 'POST', url: `/api/admin/layouts/${layout.rows[0]!.id}/duplicate`,
      headers: { cookie: adminCookie },
    });
    expect(dup.statusCode).toBe(201);
    const slots = await pool.query(
      `SELECT * FROM register_layout_slot WHERE register_layout_id = $1`,
      [dup.json().id],
    );
    expect(slots.rowCount).toBe(2);
  });
});

describe('Admin tables (floor plan)', () => {
  it('generates a fresh grid and cascades when a column is deleted', async () => {
    const app = await getTestApp();
    const gen = await app.inject({
      method: 'POST', url: '/api/admin/tables/generate',
      headers: { cookie: adminCookie },
      payload: {
        cols: { count: 2, label_type: 'alpha', order: 'asc' },
        rows: { count: 2, label_type: 'numeric', order: 'asc' },
        replace: true,
      },
    });
    expect(gen.statusCode).toBe(200);
    expect(gen.json().length).toBe(4);

    const del = await app.inject({
      method: 'DELETE', url: '/api/admin/tables/columns/A',
      headers: { cookie: adminCookie },
    });
    expect(del.statusCode).toBe(204);
    // Only the rows in column B should remain.
    const remaining = await pool.query(`SELECT col_label FROM dining_table`);
    for (const row of remaining.rows) expect(row.col_label).toBe('B');
  });

  it('rejects duplicate column labels with 409', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST', url: '/api/admin/tables/columns',
      headers: { cookie: adminCookie }, payload: { label: 'Z' },
    });
    const dup = await app.inject({
      method: 'POST', url: '/api/admin/tables/columns',
      headers: { cookie: adminCookie }, payload: { label: 'Z' },
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe('Admin invoices reprint', () => {
  it('enqueues a print job for an existing invoice', async () => {
    const app = await getTestApp();
    const printer = await createTestPrinter();
    const register = await createTestRegister({ type: 'receipt_register', printerId: printer.id });
    await setSystemSetting('company_name', 'Verein');
    await setSystemSetting('system_serial', 'FairPOS-2026-TESTAAAAAA');
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', 'token-xyz', now()) RETURNING id`,
      [register.id],
    );

    const response = await app.inject({
      method: 'POST', url: `/api/admin/invoices/${inv.rows[0]!.id}/reprint`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const jobs = await pool.query(`SELECT * FROM print_job WHERE reference_id = $1`, [inv.rows[0]!.id]);
    expect(jobs.rowCount).toBe(1);
  });

  it('serves a PDF for an existing invoice via the admin endpoint', async () => {
    const app = await getTestApp();
    const printer = await createTestPrinter();
    const register = await createTestRegister({ type: 'receipt_register', printerId: printer.id });
    await setSystemSetting('company_name', 'Verein');
    await setSystemSetting('system_serial', 'FairPOS-2026-TESTAAAAAA');
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token, created_at)
       VALUES ($1, 1, 'sales_receipt', 'cash', 'tok-pdf', now()) RETURNING id`,
      [register.id],
    );
    const response = await app.inject({
      method: 'GET', url: `/api/admin/invoices/${inv.rows[0]!.id}/pdf`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    // The first four bytes of every PDF are the literal "%PDF".
    expect(response.rawPayload.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('returns 401 on the admin PDF endpoint without a session', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/invoices/00000000-0000-0000-0000-000000000000/pdf',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when no printer at all is available (none assigned, none default)', async () => {
    const app = await getTestApp();
    // Crucially: do NOT create any printer at all — so the register has no
    // own printer AND no system-default printer to fall back to.
    const register = await createTestRegister({ type: 'receipt_register', printerId: null });
    const inv = await pool.query<{ id: string }>(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method, receipt_token)
       VALUES ($1, 1, 'sales_receipt', 'cash', 'token') RETURNING id`,
      [register.id],
    );
    const response = await app.inject({
      method: 'POST', url: `/api/admin/invoices/${inv.rows[0]!.id}/reprint`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Admin excel exports', () => {
  it('returns an .xlsx file for the day export', async () => {
    const app = await getTestApp();
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const response = await app.inject({
      method: 'GET', url: `/api/admin/exports/excel/day?date=${dateStr}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.rawPayload.subarray(0, 4).toString('ascii')).toContain('PK');
  });

  it('rejects an invalid date format with 400', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/exports/excel/day?date=not-a-date',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Bootstrap: ensureSystemSerial / initReceiptCounter', () => {
  it('creates a fresh system_serial when absent and is idempotent on second call', async () => {
    const first = await ensureSystemSerial();
    expect(isValidSystemSerial(first)).toBe(true);
    const second = await ensureSystemSerial();
    expect(second).toBe(first);
  });

  it('replaces a malformed system_serial with a fresh one', async () => {
    await setSystemSetting('system_serial', 'GARBAGE');
    const serial = await ensureSystemSerial();
    expect(isValidSystemSerial(serial)).toBe(true);
  });

  it('seeds receipt_counter from MAX(invoice.receipt_number) on first run', async () => {
    const printer = await createTestPrinter();
    const register = await createTestRegister({ type: 'receipt_register', printerId: printer.id });
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method)
       VALUES ($1, 42, 'sales_receipt', 'cash')`,
      [register.id],
    );
    await initReceiptCounter();
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM system_setting WHERE key = 'receipt_counter'`,
    );
    expect(Number(result.rows[0]!.value)).toBe(42);
  });

  it('does not overwrite an existing receipt_counter on subsequent boots', async () => {
    await seedReceiptCounter(1000);
    await initReceiptCounter();
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM system_setting WHERE key = 'receipt_counter'`,
    );
    expect(Number(result.rows[0]!.value)).toBe(1000);
  });
});

describe('PUT /api/admin/system/time', () => {
  beforeEach(() => { config.sudoPath = SUDO_STUB_PATH; });
  afterAll(() => { config.sudoPath = null; });

  it('sets the system time via the sudo/timedatectl stub', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/system/time',
      headers: { cookie: adminCookie },
      payload: { time: '2026-08-24T18:35:00' },
    });
    expect(response.statusCode).toBe(204);
  });

  it('rejects malformed input with 500 and a clear message, without calling sudo', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/system/time',
      headers: { cookie: adminCookie },
      payload: { time: 'not-a-date' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatch(/Ungültiges Datumsformat/);
  });

  it('returns 400 when no time value is sent', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/system/time',
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('PUT /api/admin/system/timezone', () => {
  beforeEach(() => { config.sudoPath = SUDO_STUB_PATH; });
  afterAll(() => { config.sudoPath = null; });

  it('sets the system timezone via the sudo/timedatectl stub', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/system/timezone',
      headers: { cookie: adminCookie },
      payload: { timezone: 'Europe/Berlin' },
    });
    expect(response.statusCode).toBe(204);
  });

  it('rejects an unknown timezone with 500 and a clear message, without calling sudo', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/system/timezone',
      headers: { cookie: adminCookie },
      payload: { timezone: 'Not/A_Real_Zone' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatch(/Unbekannte Zeitzone/);
  });

  it('returns 400 when no timezone is sent', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/system/timezone',
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/admin/system/shutdown', () => {
  beforeEach(() => { config.sudoPath = SUDO_STUB_PATH; });
  afterAll(() => { config.sudoPath = null; });

  it('shuts down via the sudo/systemctl stub', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/system/shutdown',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
  });

  it('returns 500 with a clear message when the underlying command fails (e.g. missing sudoers rule)', async () => {
    process.env['SUDO_STUB_FAIL'] = '1';
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/system/shutdown',
      headers: { cookie: adminCookie },
    });
    delete process.env['SUDO_STUB_FAIL'];
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatch(/Server konnte nicht heruntergefahren werden/);
  });
});

describe('IP-Sperren des PIN-Logins (Task #90)', () => {
  it('GET /api/admin/system/status reports the number of active lockouts', async () => {
    const app = await getTestApp();
    recordFailedAttempt('9.9.9.1');
    recordFailedAttempt('9.9.9.1');
    recordFailedAttempt('9.9.9.1'); // locked
    recordFailedAttempt('9.9.9.2'); // not locked (only 1 failure)

    const response = await app.inject({
      method: 'GET', url: '/api/admin/system/status',
      headers: { cookie: adminCookie },
    });
    expect(response.json().ip_lockout_count).toBe(1);
  });

  it('POST /api/admin/system/reset-ip-lockouts clears every active lockout', async () => {
    const app = await getTestApp();
    recordFailedAttempt('9.9.9.3');
    recordFailedAttempt('9.9.9.3');
    recordFailedAttempt('9.9.9.3');
    expect(countActiveLockouts()).toBe(1);

    const response = await app.inject({
      method: 'POST', url: '/api/admin/system/reset-ip-lockouts',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
    expect(countActiveLockouts()).toBe(0);
  });
});
