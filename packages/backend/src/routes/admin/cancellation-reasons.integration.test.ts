/** Integration tests for the cancellation-reasons admin CRUD route, including event scoping (Task #95). */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;

beforeEach(async () => {
  await truncateAllTables();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

describe('Admin cancellation reasons CRUD', () => {
  it('creates, lists, updates and deletes a reason', async () => {
    const app = await getTestApp();
    const create = await app.inject({
      method: 'POST', url: '/api/admin/cancellation-reasons',
      headers: { cookie: adminCookie },
      payload: { name: 'Verschüttet', booking_type: 'cancellation' },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;

    const list = await app.inject({
      method: 'GET', url: '/api/admin/cancellation-reasons',
      headers: { cookie: adminCookie },
    });
    expect((list.json() as { name: string }[]).map((r) => r.name)).toEqual(['Verschüttet']);

    const update = await app.inject({
      method: 'PUT', url: `/api/admin/cancellation-reasons/${id}`,
      headers: { cookie: adminCookie },
      payload: { name: 'Fehlbon' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe('Fehlbon');

    const del = await app.inject({
      method: 'DELETE', url: `/api/admin/cancellation-reasons/${id}`,
      headers: { cookie: adminCookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it('rejects an invalid booking_type with 400', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/cancellation-reasons',
      headers: { cookie: adminCookie },
      payload: { name: 'X', booking_type: 'refund' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('cancellation_reason scoped to the active event (Task #95)', () => {
  it('GET only shows reasons of the active event', async () => {
    const otherEvent = await pool.query<{ id: string }>(
      `INSERT INTO event (name, start_time, end_time) VALUES ('Anderes Fest', now(), now() + interval '1 day') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO cancellation_reason (name, booking_type, event_id) VALUES ('Fremd', 'cancellation', $1)`,
      [otherEvent.rows[0]!.id],
    );

    const app = await getTestApp();
    await app.inject({
      method: 'POST', url: '/api/admin/cancellation-reasons',
      headers: { cookie: adminCookie },
      payload: { name: 'Eigen', booking_type: 'cancellation' },
    });

    const response = await app.inject({
      method: 'GET', url: '/api/admin/cancellation-reasons',
      headers: { cookie: adminCookie },
    });
    const names = (response.json() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(['Eigen']);
  });

  it('does not update or delete a reason belonging to a different event (404)', async () => {
    const otherEvent = await pool.query<{ id: string }>(
      `INSERT INTO event (name, start_time, end_time) VALUES ('Anderes Fest', now(), now() + interval '1 day') RETURNING id`,
    );
    const foreign = await pool.query<{ id: string }>(
      `INSERT INTO cancellation_reason (name, booking_type, event_id) VALUES ('Fremd', 'cancellation', $1) RETURNING id`,
      [otherEvent.rows[0]!.id],
    );
    const foreignId = foreign.rows[0]!.id;

    const app = await getTestApp();
    const putResponse = await app.inject({
      method: 'PUT', url: `/api/admin/cancellation-reasons/${foreignId}`,
      headers: { cookie: adminCookie },
      payload: { name: 'Umbenannt' },
    });
    expect(putResponse.statusCode).toBe(404);

    const deleteResponse = await app.inject({
      method: 'DELETE', url: `/api/admin/cancellation-reasons/${foreignId}`,
      headers: { cookie: adminCookie },
    });
    expect(deleteResponse.statusCode).toBe(404);
  });
});
