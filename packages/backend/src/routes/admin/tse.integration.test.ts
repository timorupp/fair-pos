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
import { pool } from '../../db/client.js';

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
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
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

  it('computes certificateExpiresTodayOrEarlier against server time, not the browser (Task #132 follow-up)', async () => {
    config.tseCliPath = TSE_CLI_STUB_PATH;
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    const expiredSecondsAgo = Math.floor(Date.now() / 1000) - 24 * 3600;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true, result: { hasPassedSelfTest: true, hasValidTime: true, certificateExpirationDate: expiredSecondsAgo },
    });

    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/status',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.configured).toBe(true);
    expect(body.certificateExpiresTodayOrEarlier).toBe(true);
    delete process.env['TSE_STUB_STDOUT'];
    config.tseCliPath = null;
  });

  describe('POST /test-signature (Task #133)', () => {
    it('returns 400 when the TSE is not configured', async () => {
      const app = await getTestApp();
      const response = await app.inject({
        method: 'POST', url: '/api/admin/tse/test-signature',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(400);
    });

    it('runs a real start/finish cycle and returns the signature detail on success', async () => {
      config.tseCliPath = TSE_CLI_STUB_PATH;
      config.tseMountPoint = '/mnt/fake-tse';
      config.tseClientId = 'FairPOS-Test';
      process.env['TSE_STUB_STDOUT'] = JSON.stringify({
        ok: true,
        result: { transactionNumber: 42, signatureCounter: 7, logTime: 1735689600, signature: 'aabbcc', serialNumber: 'ddeeff' },
      });

      const app = await getTestApp();
      const response = await app.inject({
        method: 'POST', url: '/api/admin/tse/test-signature',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        transactionNumber: 42, signatureCounter: 7, signature: 'aabbcc', serialNumber: 'ddeeff',
      });
      delete process.env['TSE_STUB_STDOUT'];
      config.tseCliPath = null;
    });

    it('uses AVBelegabbruch content for finish, so the test never creates a persisted Vorgang', async () => {
      config.tseCliPath = TSE_CLI_STUB_PATH;
      config.tseMountPoint = '/mnt/fake-tse';
      config.tseClientId = 'FairPOS-Test';
      process.env['TSE_STUB_LOG_FILE'] = '/tmp/tsecli-test-signature-calls.log';
      const fs = await import('node:fs');
      fs.writeFileSync('/tmp/tsecli-test-signature-calls.log', '');
      process.env['TSE_STUB_STDOUT'] = JSON.stringify({
        ok: true,
        result: { transactionNumber: 1, signatureCounter: 1, logTime: 1735689600, signature: 'aa', serialNumber: 'bb' },
      });

      const app = await getTestApp();
      await app.inject({
        method: 'POST', url: '/api/admin/tse/test-signature',
        headers: { cookie: adminCookie },
      });

      const calls = fs.readFileSync('/tmp/tsecli-test-signature-calls.log', 'utf8').trim().split('\n').filter(Boolean);
      const finishCall = calls.find((c) => c.includes(' finish '))!;
      const processDataB64 = finishCall.trim().split(' ').pop()!;
      const processData = Buffer.from(processDataB64, 'base64').toString('utf-8');
      expect(processData).toMatch(/^AVBelegabbruch/);

      delete process.env['TSE_STUB_STDOUT'];
      delete process.env['TSE_STUB_LOG_FILE'];
      config.tseCliPath = null;
    });

    it('returns 502 with the real TSE error detail on failure', async () => {
      config.tseCliPath = TSE_CLI_STUB_PATH;
      config.tseMountPoint = '/mnt/fake-tse';
      config.tseClientId = 'FairPOS-Test';
      process.env['TSE_STUB_EXIT_CODE'] = '1';
      process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 4098, message: 'no valid time set' } });

      const app = await getTestApp();
      const response = await app.inject({
        method: 'POST', url: '/api/admin/tse/test-signature',
        headers: { cookie: adminCookie },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().error).toMatch(/4098/);

      delete process.env['TSE_STUB_STDOUT'];
      delete process.env['TSE_STUB_EXIT_CODE'];
      config.tseCliPath = null;
    });
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

    const log = await pool.query(
      `SELECT severity, category FROM system_log`,
    );
    expect(log.rows).toEqual([{ severity: 'info', category: 'tse_health' }]);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/tse/maintain' });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/admin/tse/export (Task #103)', () => {
  it('rejects when the TSE is not configured', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/export',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('downloads the raw TAR archive from the stub CLI and logs the export', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_EXPORT_CONTENT'] = 'FAKE-TSE-TAR-CONTENT';
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/export',
      headers: { cookie: adminCookie },
    });
    delete process.env['TSE_STUB_EXPORT_CONTENT'];

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-tar');
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="fairpos_tse_export_.*\.tar"/);
    expect(response.body).toBe('FAKE-TSE-TAR-CONTENT');

    const log = await pool.query(`SELECT severity, category FROM system_log`);
    expect(log.rows).toEqual([{ severity: 'info', category: 'tse_export' }]);
  });

  it('allows a Veranstaltungs-Administrator too — the TSE may belong to their event', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_EXPORT_CONTENT'] = 'FAKE-TSE-TAR-CONTENT';
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const eventAdmin = await createTestUser({ isEventAdmin: true, password: 'pw' });
    const eventAdminCookie = await loginAsAdmin(await getTestApp(), eventAdmin.pin, eventAdmin.password);

    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/export',
      headers: { cookie: eventAdminCookie },
    });
    delete process.env['TSE_STUB_EXPORT_CONTENT'];

    expect(response.statusCode).toBe(200);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/tse/export' });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/admin/tse/setup (Task #131)', () => {
  it('rejects when the TSE is not configured', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/setup',
      headers: { cookie: adminCookie },
      payload: { credentialSeed: 'SwissbitSwissbit', adminPuk: '123456', adminPin: '12345', timeAdminPin: '12345' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a missing/invalid client-id before ever calling the CLI', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/setup',
      headers: { cookie: adminCookie },
      payload: { clientId: 'invalid client id!', credentialSeed: 'SwissbitSwissbit', adminPuk: '123456', adminPin: '12345', timeAdminPin: '12345' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Client-ID/);
  });

  it('rejects a 5-digit admin-puk before ever calling the CLI', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/setup',
      headers: { cookie: adminCookie },
      payload: { clientId: 'FairPOS-Test', credentialSeed: 'SwissbitSwissbit', adminPuk: '12345', adminPin: '12345', timeAdminPin: '12345' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/6-stellig/);
  });

  it('rejects a non-numeric pin', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/setup',
      headers: { cookie: adminCookie },
      payload: { clientId: 'FairPOS-Test', credentialSeed: 'SwissbitSwissbit', adminPuk: '123456', adminPin: 'abcde', timeAdminPin: '12345' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/5-stellig/);
  });

  it('succeeds against the stub CLI when fully configured and validly formatted, persists the client-id, and logs it', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/setup',
      headers: { cookie: adminCookie },
      payload: { clientId: 'FairPOS-Test', credentialSeed: 'SwissbitSwissbit', adminPuk: '123456', adminPin: '12345', timeAdminPin: '12345' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, clientId: 'FairPOS-Test' });

    const setting = await pool.query(`SELECT value FROM system_setting WHERE key = 'tse_client_id'`);
    expect(setting.rows).toEqual([{ value: 'FairPOS-Test' }]);
    expect(config.tseClientId).toBe('FairPOS-Test');

    const log = await pool.query(`SELECT severity, category FROM system_log`);
    expect(log.rows).toEqual([{ severity: 'info', category: 'tse_setup' }]);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/tse/setup' });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/admin/tse/unblock (Task #109/#131)', () => {
  it('rejects an invalid user value', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/unblock',
      headers: { cookie: adminCookie },
      payload: { user: 'bogus', puk: '123456', newPin: '12345' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a malformed puk before ever calling the CLI', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/unblock',
      headers: { cookie: adminCookie },
      payload: { user: 'timeAdmin', puk: '1234567', newPin: '12345' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/6-stellig/);
  });

  it('succeeds against the stub CLI and logs which user was unblocked', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/unblock',
      headers: { cookie: adminCookie },
      payload: { user: 'timeAdmin', puk: '123456', newPin: '54321' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const log = await pool.query<{ severity: string; category: string; message: string }>(
      `SELECT severity, category, message FROM system_log`,
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ severity: 'info', category: 'tse_setup' });
    expect(log.rows[0]!.message).toMatch(/TimeAdmin-PIN entsperrt/);
  });

  it('reports remainingRetries from the stub CLI on a failed attempt', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: false,
      error: { code: 4352, message: 'worm_user_unblock failed', remainingRetries: 1 },
    });
    process.env['TSE_STUB_EXIT_CODE'] = '1';
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/unblock',
      headers: { cookie: adminCookie },
      payload: { user: 'admin', puk: '999999', newPin: '54321' },
    });
    delete process.env['TSE_STUB_STDOUT'];
    delete process.env['TSE_STUB_EXIT_CODE'];

    expect(response.statusCode).toBe(502);
    expect(response.json().remainingRetries).toBe(1);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/tse/unblock' });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/admin/tse/factory-reset (Task #131)', () => {
  it('rejects when the TSE is not configured', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/factory-reset',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('succeeds against the stub CLI and logs a warning-level entry', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tse/factory-reset',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);

    const log = await pool.query(`SELECT severity, category FROM system_log`);
    expect(log.rows).toEqual([{ severity: 'warning', category: 'tse_setup' }]);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/admin/tse/factory-reset' });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/admin/tse/dump-process-data (Task #102/#131)', () => {
  it('rejects when the TSE is not configured', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/dump-process-data',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });

  it('downloads the dump file from the stub CLI and logs the download', async () => {
    const app = await getTestApp();
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_DUMP_CONTENT'] = 'id\ttype\tprocessData\n1\tstart\tAAA\n';
    await app.inject({
      method: 'PUT', url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { tse_mount_point: '/mnt/fake-tse', tse_client_id: 'FairPOS-Test' },
    });
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tse/dump-process-data',
      headers: { cookie: adminCookie },
    });
    delete process.env['TSE_STUB_DUMP_CONTENT'];

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="fairpos_tse_process_data_.*\.txt"/);
    expect(response.body).toBe('id\ttype\tprocessData\n1\tstart\tAAA\n');

    const log = await pool.query(`SELECT severity, category FROM system_log`);
    expect(log.rows).toEqual([{ severity: 'info', category: 'tse_export' }]);
  });

  it('rejects without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/tse/dump-process-data' });
    expect(response.statusCode).toBe(401);
  });
});
