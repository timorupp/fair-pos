/**
 * Unit tests for the TSE client — the real `native/tse-cli` binary is
 * gitignored and needs physical hardware, so these tests point
 * `TSE_CLI_PATH` at `test/fixtures/tseCliStub.sh` instead, which prints a
 * canned JSON response controlled via `TSE_STUB_STDOUT`/`TSE_STUB_EXIT_CODE`.
 *
 * `config.ts` is a module-level singleton evaluated once at first import, so
 * each test resets the module cache (`vi.resetModules`) and re-imports
 * dynamically after changing `process.env` — otherwise env changes made in
 * one test would be invisible to modules already cached from an earlier one.
 *
 * `tseMountPoint`/`tseClientId` are no longer environment variables (removed
 * together with the `.env` seed values — the admin UI / `system_setting` is
 * the only configuration path, see `tse/settings.ts`) — tests that need a
 * "TSE is configured" state call `configureTse()` to mutate the freshly
 * reset `config` singleton directly, the same way `applyTseSettings` does in
 * production.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'tseCliStub.sh',
);

/** Baseline env for a test — individual tests can override keys (e.g. `TSE_CLI_PATH`, `TSE_STUB_*`). */
function setBaselineEnv(): void {
  // config.ts validates these eagerly at import time even though this test
  // never touches the DB or sessions — dummy values are enough.
  process.env['SESSION_SECRET'] = 'test-secret';
  process.env['DATABASE_URL'] = 'postgres://test/unused';
  process.env['TSE_CLI_PATH'] = STUB_PATH;
  delete process.env['TSE_STUB_STDOUT'];
  delete process.env['TSE_STUB_EXIT_CODE'];
}

/** Simulates a configured TSE by mutating the freshly-reset `config` singleton — call after `vi.resetModules()`, before importing `client.js`. */
async function configureTse(): Promise<void> {
  const { config } = await import('../config.js');
  config.tseMountPoint = '/tmp/fake-tse-mount';
  config.tseClientId = 'TESTCLIENT';
}

beforeEach(() => {
  vi.resetModules();
  setBaselineEnv();
});

describe('tse/client', () => {
  it('parses a successful transaction response', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: {
        transactionNumber: 7,
        signatureCounter: 3,
        logTime: 1735689600,
        signature: 'aa',
        serialNumber: 'bb',
      },
    });
    await configureTse();
    const { startTransaction } = await import('./client.js');
    const result = await startTransaction('Kassenbeleg-V1', Buffer.from('hello'));
    expect(result).toEqual({
      transactionNumber: 7,
      signatureCounter: 3,
      logTime: 1735689600,
      signature: 'aa',
      serialNumber: 'bb',
    });
  });

  it('throws TseError with the code and message from a failed CLI call', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: false,
      error: { code: 1008, message: 'worm_transaction_finish failed' },
    });
    process.env['TSE_STUB_EXIT_CODE'] = '1';
    await configureTse();
    const { finishTransaction } = await import('./client.js');
    await expect(finishTransaction(1, 'Kassenbeleg-V1', Buffer.from('x'))).rejects.toMatchObject({
      name: 'TseError',
      code: 1008,
      message: 'worm_transaction_finish failed',
    });
  });

  it('throws a clear error when the TSE is not configured', async () => {
    // No configureTse() call — config.tseMountPoint/tseClientId stay at their default `null`.
    const { startTransaction } = await import('./client.js');
    await expect(startTransaction('Kassenbeleg-V1', Buffer.from('x'))).rejects.toThrow(
      /nicht konfiguriert/,
    );
  });

  it('parses the info command result', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: {
        hasPassedSelfTest: true,
        hasValidTime: true,
        startedTransactions: 0,
        maxStartedTransactions: 512,
        remainingSignatures: 19999000,
        maxSignatures: 20000000,
        certificateExpirationDate: 2000000000,
        timeUntilNextSelfTest: 3600,
        timeUntilNextTimeSynchronization: 7200,
        tseCertificationId: 'BSI-K-TSE-0001',
        formFactor: 'USB',
        tseSerialNumber: 'aabbcc',
      },
    });
    await configureTse();
    const { getTseInfo } = await import('./client.js');
    const info = await getTseInfo();
    expect(info.hasPassedSelfTest).toBe(true);
    expect(info.tseCertificationId).toBe('BSI-K-TSE-0001');
  });

  it('throws when the CLI produces no output at all', async () => {
    // Point at a path that will fail to execute, simulating a missing/broken binary.
    process.env['TSE_CLI_PATH'] = '/nonexistent/tseCli';
    await configureTse();
    const { getTseInfo } = await import('./client.js');
    await expect(getTseInfo()).rejects.toThrow();
  });

  it('serialises multiple calls through the same underlying queue', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: true, result: {} });
    await configureTse();
    const { maintainTse } = await import('./client.js');
    // Just verifying these don't collide/throw when issued back-to-back —
    // the actual ordering guarantee is covered by queue.test.ts.
    await Promise.all([maintainTse('1234'), maintainTse('1234'), maintainTse('1234')]);
  });
});
