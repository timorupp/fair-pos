/**
 * Integration tests for `signTseTransaction` — exercises the real DB-backed
 * outage bookkeeping (tse/outage.ts) together with the CLI-subprocess client
 * (against the stub script, see tse/client.test.ts for the pure-unit coverage
 * of that part). Needs a real Postgres because `signTseTransaction` writes to
 * `tse_outage` on every failure/recovery.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client.js';
import { truncateAllTables } from '../test/db-fixture.js';
import { getTestApp, closeTestApp } from '../test/app-helpers.js';
import { config } from '../config.js';
import { signTseTransaction } from './signing.js';
import { recordTseFailure } from './outage.js';

const TSE_CLI_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'tseCliStub.sh',
);

// buildApp() is never used here, but getTestApp() is the established way this
// codebase brings up the shared DB pool + a fully migrated schema for a test file.
beforeAll(async () => { await getTestApp(); });
afterAll(closeTestApp);

let logFile: string | null = null;

beforeEach(async () => {
  await truncateAllTables();
  config.tseMountPoint = null;
  config.tseClientId = null;
  delete process.env['TSE_STUB_STDOUT'];
  delete process.env['TSE_STUB_EXIT_CODE'];
  delete process.env['TSE_STUB_FAIL_EXCEPT_ABORT'];
  delete process.env['TSE_STUB_LOG_FILE'];
  logFile = null;
});

afterEach(() => {
  if (logFile) fs.rmSync(logFile, { force: true });
});

async function openOutageCount(): Promise<number> {
  const result = await pool.query(`SELECT id FROM tse_outage WHERE ended_at IS NULL`);
  return result.rowCount!;
}

/** Points TSE_STUB_LOG_FILE at a fresh temp file and returns its logged CLI invocations (one per line). */
function readCliInvocations(): string[] {
  if (!logFile || !fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
}

describe('signTseTransaction', () => {
  it('reports a warning and opens an outage row when the TSE is not configured', async () => {
    const result = await signTseTransaction('Kassenbeleg-V1', Buffer.from('x'));
    expect(result.signature).toBeNull();
    expect(result.warning).toMatch(/nicht konfiguriert/);

    const outages = await pool.query<{ reason: string }>(`SELECT reason FROM tse_outage WHERE ended_at IS NULL`);
    expect(outages.rows).toHaveLength(1);
    expect(outages.rows[0]!.reason).toMatch(/nicht konfiguriert/);
  });

  it('does not open a second outage row for repeated failures', async () => {
    await signTseTransaction('Kassenbeleg-V1', Buffer.from('x'));
    await signTseTransaction('Kassenbeleg-V1', Buffer.from('y'));
    expect(await openOutageCount()).toBe(1);
  });

  it('stays at exactly one open row under genuinely concurrent failures (DB-enforced, not just app-level)', async () => {
    // Regression test for a check-then-insert race: without the partial
    // unique index (migration 0006), two calls whose "is one already open?"
    // check both run before either INSERT commits could each insert a row.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => recordTseFailure(`Ausfall ${i}`)),
    );
    expect(await openOutageCount()).toBe(1);
  });

  it('returns a populated signature and closes any open outage on success', async () => {
    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;

    // Start with an open outage from a previous (unconfigured) attempt.
    await pool.query(`INSERT INTO tse_outage (reason) VALUES ('vorheriger Ausfall')`);
    expect(await openOutageCount()).toBe(1);

    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: { transactionNumber: 1, signatureCounter: 1, logTime: 1735689600, signature: 'aa', serialNumber: 'bb' },
    });

    const result = await signTseTransaction('AVBestellung', Buffer.from('x'));
    expect(result.warning).toBeNull();
    expect(result.signature).toMatchObject({ transactionNumber: 1, signature: 'aa', serialNumber: 'bb' });
    expect(await openOutageCount()).toBe(0);
  });

  it('reports a warning and opens an outage row when a configured TSE call fails', async () => {
    config.tseMountPoint = '/tmp/fake-tse';
    config.tseClientId = 'FairPOS-Test';
    config.tseCliPath = TSE_CLI_STUB_PATH;
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1, message: 'boom' } });
    process.env['TSE_STUB_EXIT_CODE'] = '1';

    const result = await signTseTransaction('AVSonstige', Buffer.from('x'));
    expect(result.signature).toBeNull();
    expect(result.warning).toMatch(/nicht erreichbar/);
    expect(await openOutageCount()).toBe(1);
  });

  describe('AVBelegabbruch cleanup when start succeeds but finish fails', () => {
    it('does not attempt a cleanup call when start itself already fails (nothing to abort)', async () => {
      config.tseMountPoint = '/tmp/fake-tse';
      config.tseClientId = 'FairPOS-Test';
      config.tseCliPath = TSE_CLI_STUB_PATH;
      logFile = path.join(os.tmpdir(), `tse-stub-log-${process.pid}-1.txt`);
      process.env['TSE_STUB_LOG_FILE'] = logFile;
      process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1, message: 'boom' } });
      process.env['TSE_STUB_EXIT_CODE'] = '1';

      const result = await signTseTransaction('Kassenbeleg-V1', Buffer.from('x'));
      expect(result.signature).toBeNull();

      const calls = readCliInvocations();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain(' start ');
    });

    it('sends a follow-up AVBelegabbruch finish to close the dangling transaction', async () => {
      config.tseMountPoint = '/tmp/fake-tse';
      config.tseClientId = 'FairPOS-Test';
      config.tseCliPath = TSE_CLI_STUB_PATH;
      logFile = path.join(os.tmpdir(), `tse-stub-log-${process.pid}-2.txt`);
      process.env['TSE_STUB_LOG_FILE'] = logFile;
      process.env['TSE_STUB_FAIL_EXCEPT_ABORT'] = '1';

      const result = await signTseTransaction('Kassenbeleg-V1', Buffer.from('x'));
      expect(result.signature).toBeNull();
      expect(result.warning).toMatch(/nicht erreichbar/);

      const calls = readCliInvocations();
      expect(calls).toHaveLength(3);
      expect(calls[0]).toContain(' start ');
      expect(calls[1]).toContain(' finish ');
      expect(calls[1]).not.toContain('AVBelegabbruch');
      expect(calls[2]).toContain(' finish ');
      expect(calls[2]).toContain('AVBelegabbruch');
      expect(await openOutageCount()).toBe(1);
    });

    it('does not throw when the AVBelegabbruch cleanup call also fails', async () => {
      config.tseMountPoint = '/tmp/fake-tse';
      config.tseClientId = 'FairPOS-Test';
      config.tseCliPath = TSE_CLI_STUB_PATH;
      logFile = path.join(os.tmpdir(), `tse-stub-log-${process.pid}-3.txt`);
      process.env['TSE_STUB_LOG_FILE'] = logFile;
      // start succeeds, but every finish call (the original one AND the
      // AVBelegabbruch cleanup attempt) fails.
      process.env['TSE_STUB_FAIL_ALL_FINISH'] = '1';

      await expect(signTseTransaction('Kassenbeleg-V1', Buffer.from('x'))).resolves.toMatchObject({
        signature: null,
        warning: expect.stringMatching(/nicht erreichbar/),
      });

      const calls = readCliInvocations();
      expect(calls).toHaveLength(3);
      expect(calls[2]).toContain('AVBelegabbruch');
    });
  });
});
