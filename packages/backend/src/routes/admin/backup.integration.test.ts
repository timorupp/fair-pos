/**
 * Integration tests for the manual database backup endpoint. Uses a stub
 * `pg_dump` script (see test/fixtures/pgDumpStub.sh) rather than the real
 * binary, which isn't guaranteed to be installed in every dev/CI
 * environment — the stub still exercises the full route → createDatabaseDump
 * → buildBackupZip → HTTP response chain, with real arg-passing to a real
 * subprocess (just not the real pg_dump).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import unzipper from 'unzipper';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAllTables } from '../../test/db-fixture.js';
import { closeTestApp, getTestApp, loginAsAdmin } from '../../test/app-helpers.js';
import { createTestUser } from '../../test/fixtures.js';
import { config } from '../../config.js';

const PG_DUMP_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test',
  'fixtures',
  'pgDumpStub.sh',
);

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let adminCookie: string;
let logFile: string | null = null;

beforeEach(async () => {
  await truncateAllTables();
  config.pgDumpPath = PG_DUMP_STUB_PATH;
  delete process.env['PG_DUMP_STUB_FAIL'];
  delete process.env['PG_DUMP_STUB_LOG_FILE'];
  logFile = null;
  const admin = await createTestUser({ isAdmin: true, password: 'pw' });
  adminCookie = await loginAsAdmin(await getTestApp(), admin.pin, admin.password);
});

afterEach(() => {
  if (logFile) fs.rmSync(logFile, { force: true });
});

describe('GET /api/admin/backup', () => {
  it('returns a ZIP with backup.sql (the pg_dump output) and a README', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/backup',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="fairpos_backup_.*\.zip"/);

    const directory = await unzipper.Open.buffer(response.rawPayload);
    const names = directory.files.map((f) => f.path);
    expect(names).toContain('backup.sql');
    expect(names).toContain('README.txt');

    const sqlFile = directory.files.find((f) => f.path === 'backup.sql')!;
    const sql = (await sqlFile.buffer()).toString('utf-8');
    expect(sql).toContain('CREATE TABLE example');
  });

  it('passes the database password via PGPASSWORD, not as a command-line argument', async () => {
    logFile = path.join(os.tmpdir(), `pg-dump-stub-log-${process.pid}.txt`);
    process.env['PG_DUMP_STUB_LOG_FILE'] = logFile;

    const app = await getTestApp();
    await app.inject({ method: 'GET', url: '/api/admin/backup', headers: { cookie: adminCookie } });

    const logged = fs.readFileSync(logFile, 'utf-8');
    expect(logged).toContain('PGPASSWORD=');
    const [argsPart] = logged.split(' PGPASSWORD=');
    const passwordValue = logged.split('PGPASSWORD=')[1]?.trim();
    expect(passwordValue).toBeTruthy();
    // Structural check, not a substring diff against the password (the test
    // DB's generated user/password can coincidentally overlap in value) —
    // the argument list must be exactly `-h <host> -p <port> -U <user>
    // <database>`, seven tokens, none of which is a password-bearing flag.
    const tokens = argsPart!.trim().split(/\s+/);
    expect(tokens).toHaveLength(7);
    expect(tokens[0]).toBe('-h');
    expect(tokens[2]).toBe('-p');
    expect(tokens[4]).toBe('-U');
  });

  it('returns 500 with an error message when pg_dump fails', async () => {
    process.env['PG_DUMP_STUB_FAIL'] = '1';
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/backup',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatch(/pg_dump fehlgeschlagen/);
  });

  it('rejects the request without an admin session', async () => {
    const app = await getTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/admin/backup' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a Veranstaltungs-Administrator (System-Administrator only, Task #94)', async () => {
    const eventAdmin = await createTestUser({ isEventAdmin: true, password: 'pw' });
    const eventAdminCookie = await loginAsAdmin(await getTestApp(), eventAdmin.pin, eventAdmin.password);
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET', url: '/api/admin/backup',
      headers: { cookie: eventAdminCookie },
    });
    expect(response.statusCode).toBe(403);
  });
});
