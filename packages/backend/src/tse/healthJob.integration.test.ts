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
  config.tseAutoMaintainEnabled = true;
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

  it('does not retry maintain on every consecutive unhealthy tick (Task #109 cooldown)', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    await pool.query(
      `INSERT INTO system_setting (key, value) VALUES ('tse_time_admin_pin', '123456')`,
    );
    process.env['TSE_STUB_LOG_FILE'] = '/tmp/tsecli-cooldown-calls.log';
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/tsecli-cooldown-calls.log', '');
    // info always reports unhealthy; maintain (a separate CLI invocation)
    // always fails with a non-PIN error (default stub code 1).
    process.env['TSE_STUB_STDOUT'] = infoEnvelope(false, true);
    process.env['TSE_STUB_MAINTAIN_FAILS'] = '1';

    await tick(); // first unhealthy tick — attempts maintain immediately
    await tick(); // second consecutive unhealthy tick — cooldown should skip the retry

    const calls = fs.readFileSync('/tmp/tsecli-cooldown-calls.log', 'utf8').trim().split('\n').filter(Boolean);
    const maintainCalls = calls.filter((c) => c.includes(' maintain '));
    expect(maintainCalls).toHaveLength(1);
    delete process.env['TSE_STUB_LOG_FILE'];
    delete process.env['TSE_STUB_MAINTAIN_FAILS'];
  });

  it('disables auto-maintain and stops retrying once maintain fails with a PIN authentication error', async () => {
    config.tseMountPoint = '/mnt/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    await pool.query(
      `INSERT INTO system_setting (key, value) VALUES ('tse_time_admin_pin', '123456')`,
    );
    process.env['TSE_STUB_LOG_FILE'] = '/tmp/tsecli-pin-disable-calls.log';
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/tsecli-pin-disable-calls.log', '');

    // info() succeeds (reports unhealthy); maintain() fails with
    // WORM_ERROR_AUTHENTICATION_FAILED (0x1100 = 4352).
    process.env['TSE_STUB_STDOUT'] = infoEnvelope(false, true);
    process.env['TSE_STUB_MAINTAIN_FAILS'] = '1';
    process.env['TSE_STUB_MAINTAIN_ERROR_CODE'] = '4352';

    await tick();

    expect(config.tseAutoMaintainEnabled).toBe(false);
    const setting = await pool.query<{ value: string }>(
      `SELECT value FROM system_setting WHERE key = 'tse_auto_maintain_enabled'`,
    );
    expect(setting.rows[0]?.value).toBe('false');

    const rows = await logRows();
    expect(rows.some((r) => r.severity === 'error' && /deaktiviert/.test(r.message))).toBe(true);

    // A further tick, still unhealthy, must not attempt maintain again —
    // config.tseAutoMaintainEnabled is now false.
    fs.writeFileSync('/tmp/tsecli-pin-disable-calls.log', '');
    await tick();
    const calls = fs.readFileSync('/tmp/tsecli-pin-disable-calls.log', 'utf8').trim().split('\n').filter(Boolean);
    expect(calls.some((c) => c.includes(' maintain '))).toBe(false);
    delete process.env['TSE_STUB_LOG_FILE'];
    delete process.env['TSE_STUB_MAINTAIN_FAILS'];
    delete process.env['TSE_STUB_MAINTAIN_ERROR_CODE'];
  });
});
