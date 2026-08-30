/** Integration tests for DELETE /api/admin/printers/:id — see Task #57. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestPrinter, createTestRegister, createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('DELETE /api/admin/printers/:id', () => {
  it('deletes an unused printer', async () => {
    const printer = await createTestPrinter();
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/printers/${printer.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);
  });

  it('returns 404 for a printer that does not exist', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: '/api/admin/printers/00000000-0000-0000-0000-000000000000',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 409 with a clear message instead of a raw 500 when a register still references the printer', async () => {
    const printer = await createTestPrinter();
    await createTestRegister({ printerId: printer.id });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'DELETE', url: `/api/admin/printers/${printer.id}`,
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/verwendet/);

    const stillThere = await pool.query('SELECT id FROM printer WHERE id = $1', [printer.id]);
    expect(stillThere.rowCount).toBe(1);
  });
});
