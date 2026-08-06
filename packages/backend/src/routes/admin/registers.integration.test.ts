/** Integration tests for DELETE /api/admin/registers/:id — see Task #54. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestRegister, createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.name, 'pw');
});

describe('DELETE /api/admin/registers/:id', () => {
  it('deletes an unused register', async () => {
    const register = await createTestRegister();
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/registers/${register.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
  });

  it('returns 404 for a register that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: '/api/admin/registers/00000000-0000-0000-0000-000000000000',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 409 with a clear message instead of a raw 500 when the register already has an invoice', async () => {
    const register = await createTestRegister();
    await pool.query(
      `INSERT INTO invoice (register_id, receipt_number, receipt_type, payment_method)
       VALUES ($1, 1, 'sales_receipt', 'cash')`,
      [register.id],
    );

    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/registers/${register.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/Transaktionen/);

    // The register (and its invoice) must still exist — the delete was rejected, not partially applied.
    const stillThere = await pool.query('SELECT id FROM register WHERE id = $1', [register.id]);
    expect(stillThere.rowCount).toBe(1);
  });
});

describe('register.is_active (Task #55)', () => {
  it('creates a register active by default', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/registers',
      headers: { cookie: adminCookie },
      payload: { name: 'K1', type: 'receipt_register' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().is_active).toBe(true);
  });

  it('archives a register via PUT is_active=false without deleting it', async () => {
    const register = await createTestRegister();
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: `/api/admin/registers/${register.id}`,
      headers: { cookie: adminCookie },
      payload: { is_active: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().is_active).toBe(false);

    const stillThere = await pool.query('SELECT is_active FROM register WHERE id = $1', [register.id]);
    expect(stillThere.rows[0]?.is_active).toBe(false);
  });
});
