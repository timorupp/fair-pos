/**
 * Integration tests for TSE connection settings + status.
 *
 * The real `tseCli` binary is gitignored and needs physical hardware (see
 * docs/TSE-Integration.md), so these tests can't exercise a successful
 * `info` call — that CLI-parsing behaviour is already covered by
 * `tse/client.test.ts`'s unit tests against a stub script. What's new here and
 * not covered elsewhere is: (a) `GET /api/admin/settings` round-trips the TSE
 * keys, (b) saving them via `PUT /api/admin/settings` takes effect
 * immediately — no backend restart — because `applyTseSettings` mutates the
 * in-memory `config` synchronously, and (c) `/api/admin/tse/status` reports
 * `configured: false` before that and `configured: true` (with a CLI-level
 * error, since no real binary exists here) after.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';
import { config } from '../../config.js';

/** Test double for native/tse-cli — see tse/client.test.ts for the same fixture. */
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

beforeEach(async () => {
  await truncateAllTables();
  // `config.tseMountPoint`/`tseClientId` are mutated in-place by
  // `applyTseSettings` (see tse/settings.ts) and outlive `truncateAllTables`,
  // which only clears DB rows — reset them explicitly so tests don't leak
  // TSE configuration into each other via the shared `config` singleton.
  config.tseMountPoint = null;
  config.tseClientId = null;
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.name, 'pw');
});

describe('TSE connection settings + status', () => {
  it('reports not configured before any TSE setting is saved', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/status',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: false });
  });

  it('persists tse_mount_point/tse_client_id/tse_time_admin_pin and round-trips them via GET', async () => {
    const app = await getTestApp();
    const put = await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: {
        tse_mount_point: '/mnt/fake-tse',
        tse_client_id: 'FairPOS-Test',
        tse_time_admin_pin: '123456',
      },
    });
    expect(put.statusCode).toBe(204);

    const get = await app.inject({
      method: 'GET', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
    });
    const settings = get.json();
    expect(settings['tse_mount_point']).toBe('/mnt/fake-tse');
    expect(settings['tse_client_id']).toBe('FairPOS-Test');
    expect(settings['tse_time_admin_pin']).toBe('123456');
  });

  it('applies a saved mount point/client id immediately, without a restart', async () => {
    const app = await getTestApp();

    const before = await app.inject({
      method: 'GET', url: '/api/admin/tse/status',
      headers: { cookie: adminCookie },
    });
    expect(before.json()).toEqual({ configured: false });

    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });

    // Same running app instance, no restart — the CLI binary genuinely
    // doesn't exist in this environment, so the live `info` call fails, but
    // `configured` must already reflect the just-saved settings.
    const after = await app.inject({
      method: 'GET', url: '/api/admin/tse/status',
      headers: { cookie: adminCookie },
    });
    const body = after.json();
    expect(body.configured).toBe(true);
    expect(body.error).toBeTruthy();
  });

  it('GET /candidates lists removable mount points via the real lsblk binary without throwing', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/candidates',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    // This test environment has no removable USB device attached, so an
    // empty list is the expected (and only reliably assertable) outcome —
    // the actual candidate-selection logic is unit-tested against synthetic
    // lsblk output in tse/detect.test.ts.
    expect(response.json()).toEqual({ candidates: [] });
  });

  it('POST /detect reports no match when nothing is mounted (real environment, no TSE attached)', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/detect',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ mountPoint: null, candidatesTried: 0 });
  });

  it('rejects /candidates and /detect without an admin session', async () => {
    const app = await getTestApp();
    const candidates = await app.inject({ method: 'GET', url: '/api/admin/tse/candidates' });
    expect(candidates.statusCode).toBe(401);
    const detect = await app.inject({ method: 'POST', url: '/api/admin/tse/detect' });
    expect(detect.statusCode).toBe(401);
  });
});

describe('POST /api/admin/tse/maintain', () => {
  it('rejects when the TSE is not configured', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/maintain',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects when configured but no TimeAdmin PIN is saved', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/maintain',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('succeeds against the stub CLI when fully configured', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: {
        tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test', tse_time_admin_pin: '123456',
      },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/maintain',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/tse/maintain' });
    expect(response.statusCode).toBe(401);
  });
});
