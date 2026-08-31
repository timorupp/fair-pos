/** Integration tests for the event-management admin endpoint (Task #94: System-Administrator only). */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let seededEventId: string;

beforeEach(async () => {
  seededEventId = await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('GET /api/admin/events', () => {
  it('lists events for a System-Administrator, including the seeded default event (Task #95)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/events',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const events = response.json() as { id: string }[];
    expect(events.map((e) => e.id)).toEqual([seededEventId]);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/events' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a Veranstaltungs-Administrator (System-Administrator only, Task #94)', async () => {
    const eventAdmin = await createTestUser({ isEventAdmin: true, password: 'pw' });
    const eventAdminCookie = await loginAsAdmin(await getTestApp(), eventAdmin.pin, eventAdmin.password);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/events',
      headers: { cookie: eventAdminCookie },
    });
    expect(response.statusCode).toBe(403);
  });
});
