/** Integration tests for the nginx TLS certificate admin endpoints (Task #66). */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config.js';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';
import { MISMATCHED_KEY, TEST_CERT, TEST_KEY } from '../../test/fixtures/testCert.js';

const SUDO_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'test', 'fixtures', 'sudoStub.sh',
);

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let tempDir: string;

beforeEach(async () => {
  await truncateAllTables();
  const app = await getTestApp();
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(app, admin.pin, admin.password);

  tempDir = await mkdtemp(path.join(tmpdir(), 'fairpos-tlscert-test-'));
  config.tlsStagingDir = tempDir;
  config.tlsCertPath = path.join(tempDir, 'installed.crt');
  config.sudoPath = SUDO_STUB_PATH;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env['SUDO_STUB_FAIL'];
  delete process.env['SUDO_STUB_LOG_FILE'];
});

afterAll(() => {
  config.tlsStagingDir = '/var/lib/fairpos/ssl-staging';
  config.tlsCertPath = '/etc/nginx/ssl/fairpos.crt';
  config.sudoPath = null;
});

describe('GET /api/admin/tls-cert', () => {
  it('returns installed: null when no certificate file exists yet', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tls-cert',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().installed).toBeNull();
  });

  it('returns the parsed subject/validity of an installed certificate', async () => {
    await writeFile(config.tlsCertPath, TEST_CERT);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/tls-cert',
      headers: { cookie: adminCookie },
    });
    expect(response.json().installed.subject).toBe('CN=fairpos-test.local');
  });
});

describe('POST /api/admin/tls-cert', () => {
  it('validates, stages, and installs a matching certificate/key pair via the sudo stub', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tls-cert',
      headers: { cookie: adminCookie },
      payload: { cert: TEST_CERT, key: TEST_KEY },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().installed.subject).toBe('CN=fairpos-test.local');
  });

  it('rejects a mismatched key/certificate pair with 400, without calling sudo', async () => {
    const logFile = path.join(tempDir, 'sudo.log');
    process.env['SUDO_STUB_LOG_FILE'] = logFile;
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tls-cert',
      headers: { cookie: adminCookie },
      payload: { cert: TEST_CERT, key: MISMATCHED_KEY },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/passt nicht/);
  });

  it('returns 400 when cert or key is missing', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tls-cert',
      headers: { cookie: adminCookie },
      payload: { cert: TEST_CERT },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 500 with a clear message when the install script fails (e.g. nginx -t rejected it)', async () => {
    process.env['SUDO_STUB_FAIL'] = '1';
    const app = await getTestApp();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/tls-cert',
      headers: { cookie: adminCookie },
      payload: { cert: TEST_CERT, key: TEST_KEY },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatch(/nicht installiert werden/);
  });
});

describe('Authentication required', () => {
  it('rejects an unauthenticated request', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/tls-cert' });
    expect(response.statusCode).toBe(401);
  });
});
