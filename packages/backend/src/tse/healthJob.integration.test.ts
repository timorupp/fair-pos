/**
 * Integration tests for the periodic TSE health check (Task #64). Needs a
 * real Postgres because `tick()` reads `tse_time_admin_pin` from
 * `system_setting` and writes to `system_log` — both exercised here against
 * the stub CLI (see tse/client.test.ts for the pure-unit coverage of the CLI
 * parsing itself).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';
import { config } from '../config.js';
import { resetTseHealthState, tick } from './healthJob.js';

const TSE_CLI_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'tseCliStub.sh',
);

/** Minimal `info` envelope — only the two fields `tick()` actually reads. */
function infoEnvelope(hasPassedSelfTest: boolean, hasValidTime: boolean): string {
  return JSON.stringify({ ok: true, result: { hasPassedSelfTest, hasValidTime } });
}

beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

beforeEach(async () => {
  await truncateAllTables();
  config.tseMountPoint = null;
  config.tseClientId = null;
  config.tseCliPath = TSE_CLI_STUB_PATH;
  resetTseHealthState();
  delete process.env['TSE_STUB_STDOUT'];
  delete process.env['TSE_STUB_EXIT_CODE'];
});

async function logRows(): Promise<{ severity: string; category: string; message: string }[]> {
  const result = await pool.query(
    `SELECT severity, category, message FROM system_log ORDER BY created_at`,
  );
  return result.rows;
}

describe('tick()', () => {
  it('does nothing when the TSE is not configured', async () => {
    await tick();
    expect(await logRows()).toEqual([]);
  });

  it('logs nothing on a healthy tick', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    process.env['TSE_STUB_STDOUT'] = infoEnvelope(true, true);
    await tick();
    expect(await logRows()).toEqual([]);
  });

  it('logs a warning once when the TSE becomes unreachable, not on every subsequent tick', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    process.env['TSE_STUB_EXIT_CODE'] = '1';
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1, message: 'boom' } });

    await tick();
    await tick();

    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ severity: 'warning', category: 'tse_health' });
  });

  it('logs an INFO recovery entry when the TSE becomes healthy again after an outage', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    process.env['TSE_STUB_EXIT_CODE'] = '1';
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1, message: 'boom' } });
    await tick();

    delete process.env['TSE_STUB_EXIT_CODE'];
    process.env['TSE_STUB_STDOUT'] = infoEnvelope(true, true);
    await tick();

    const rows = await logRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ severity: 'info', category: 'tse_health' });
  });

  it('warns without attempting maintain when the self-test/time-sync is due but no TimeAdmin PIN is configured', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    process.env['TSE_STUB_STDOUT'] = infoEnvelope(false, true);

    await tick();

    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ severity: 'warning', category: 'tse_health' });
    expect(rows[0]!.message).toMatch(/TimeAdmin-PIN/);
  });

  it('runs maintain and logs INFO on success when a problem is found and a PIN is configured', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    await pool.query(
      `INSERT INTO system_setting (key, value) VALUES ('tse_time_admin_pin', '123456')`,
    );
    process.env['TSE_STUB_STDOUT'] = infoEnvelope(false, true);

    await tick();

    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ severity: 'info', category: 'tse_health' });
  });
});
