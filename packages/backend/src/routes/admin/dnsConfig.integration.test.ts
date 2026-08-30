/** Integration tests for the Split-Horizon-DNS admin endpoints (Task #92). */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';

const SUDO_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'test', 'fixtures', 'sudoStub.sh',
);

const VALID_PAYLOAD = {
  domain: 'kasse.mein-verein.de',
  upstreamPrimary: '9.9.9.9',
  upstreamSecondary: '1.1.1.1',
  targetIp: '192.168.1.50',
  ttl: 300,
};

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let tempDir: string;

beforeEach(async () => {
  await truncateAllTables();
  const app = await getTestApp();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(app, admin.pin, admin.password);

  tempDir = await mkdtemp(path.join(tmpdir(), 'fairpos-dnsconfig-test-'));
  config.dnsStagingDir = tempDir;
  config.sudoPath = SUDO_STUB_PATH;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env['SUDO_STUB_FAIL'];
  delete process.env['SUDO_STUB_LOG_FILE'];
});

afterAll(() => {
  config.dnsStagingDir = '/var/lib/fairpos/dns-staging';
  config.sudoPath = null;
});

describe('GET /api/admin/dns-config', () => {
  it('returns configured: false and empty fields when nothing is saved yet', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      domain: '', upstreamPrimary: '', upstreamSecondary: '', targetIp: '', ttl: 300, configured: false,
    });
  });
});

describe('POST /api/admin/dns-config', () => {
  it('validates, stages, and installs via the sudo stub, then persists and reports configured: true', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...VALID_PAYLOAD, configured: true });
  });

  it('rejects an invalid domain with 400, without persisting anything', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
      payload: { ...VALID_PAYLOAD, domain: 'not-a-domain' },
    });
    expect(response.statusCode).toBe(400);

    const getResponse = await app.inject({
      method: 'GET', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
    });
    expect(getResponse.json().configured).toBe(false);
  });

  it('returns 500 with a clear message and does not persist when the install script fails (e.g. dnsmasq --test rejected it)', async () => {
    process.env['SUDO_STUB_FAIL'] = '1';
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatch(/nicht angewendet werden/);

    const getResponse = await app.inject({
      method: 'GET', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
    });
    expect(getResponse.json().configured).toBe(false);
  });
});

describe('DELETE /api/admin/dns-config', () => {
  it('removes a previously-saved configuration', async () => {
    const app = await getTestApp();
    await app.inject({
      method: 'POST', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
      payload: VALID_PAYLOAD,
    });

    const response = await app.inject({
      method: 'DELETE', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: 'GET', url: '/api/admin/dns-config',
      headers: { cookie: adminCookie },
    });
    expect(getResponse.json().configured).toBe(false);
  });
});

describe('POST /api/admin/dns-config/detect-ip', () => {
  it('returns a detected IPv4 address', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/dns-config/detect-ip',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  });
});

describe('POST /api/admin/dns-config/test', () => {
  it('returns 400 when no configuration is saved yet', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/dns-config/test',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('Authentication required', () => {
  it('rejects an unauthenticated request', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/dns-config' });
    expect(response.statusCode).toBe(401);
  });
});
