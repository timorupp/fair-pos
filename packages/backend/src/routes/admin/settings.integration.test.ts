/** Integration tests for PUT /api/admin/settings — Task #94's System-/Veranstaltungs-Administrator key split. */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let eventAdminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
  const eventAdmin = await createTestUser({ isEventAdmin: true, password: 'pw' });
  eventAdminCookie = await loginAsAdmin(await getTestApp(), eventAdmin.pin, eventAdmin.password);
});

describe('PUT /api/admin/settings', () => {
  it('lets a System-Administrator write a System-Administrator-only key (receipt_prefix)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { receipt_prefix: 'RE-' },
    });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: 'GET', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
    });
    expect(getResponse.json()['receipt_prefix']).toBe('RE-');
  });

  it('silently ignores a System-Administrator-only key from a Veranstaltungs-Administrator, without erroring', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: eventAdminCookie },
      payload: { receipt_prefix: 'RE-', company_name: 'Verein B' },
    });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: 'GET', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
    });
    expect(getResponse.json()['receipt_prefix']).toBeUndefined();
    expect(getResponse.json()['company_name']).toBe('Verein B');
  });

  it('lets a Veranstaltungs-Administrator write company data (Task #94: mietender Verein braucht eigene Bon-Daten)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: eventAdminCookie },
      payload: { company_name: 'Verein B', logo_zoom_percent: '150' },
    });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: 'GET', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
    });
    expect(getResponse.json()['company_name']).toBe('Verein B');
  });
});
