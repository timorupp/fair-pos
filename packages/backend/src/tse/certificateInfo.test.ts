/**
 * Unit tests for the cached TSE certificate/algorithm fields. Uses the same
 * `TSE_CLI_PATH`-stub pattern as `client.test.ts` — see that file's header
 * comment for the module-reset rationale.
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

/** Baseline env for a test — individual tests can override `TSE_STUB_*`. */
function setBaselineEnv(): void {
  process.env['SESSION_SECRET'] = 'test-secret';
  process.env['PIN_HASH_SECRET'] = 'test-pin-secret';
  process.env['DATABASE_URL'] = 'postgres://test/unused';
  process.env['TSE_CLI_PATH'] = STUB_PATH;
  delete process.env['TSE_STUB_STDOUT'];
  delete process.env['TSE_STUB_EXIT_CODE'];
}

/** Simulates a configured TSE by mutating the freshly-reset `config` singleton. */
async function configureTse(): Promise<void> {
  const { config } = await import('../config.js');
  config.tseMountPoint = '/tmp/fake-tse-mount';
  config.tseClientId = 'TESTCLIENT';
}

beforeEach(() => {
  vi.resetModules();
  setBaselineEnv();
});

describe('tse/certificateInfo', () => {
  it('reads and caches signatureAlgorithm/logTimeFormat/publicKey/certificateChain from the info command', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: {
        hasPassedSelfTest: true, hasValidTime: true,
        startedTransactions: 0, maxStartedTransactions: 512,
        remainingSignatures: 100, maxSignatures: 100,
        certificateExpirationDate: 0, timeUntilNextSelfTest: 0, timeUntilNextTimeSynchronization: 0,
        tseCertificationId: 'BSI-K-TSE-0001', formFactor: 'USB', tseSerialNumber: 'aabbcc',
        signatureAlgorithm: 'ecdsa-plain-SHA384', logTimeFormat: 'unixTime',
        publicKey: 'cHVibGljS2V5', certificateChain: 'Y2VydENoYWlu',
      },
    });
    await configureTse();
    const { getTseCertificateInfo } = await import('./certificateInfo.js');
    const info = await getTseCertificateInfo();
    expect(info).toEqual({
      signatureAlgorithm: 'ecdsa-plain-SHA384',
      logTimeFormat: 'unixTime',
      publicKeyBase64: 'cHVibGljS2V5',
      certificateChainBase64: 'Y2VydENoYWlu',
    });
  });

  it('leaves certificateChainBase64 empty when the CLI could not read it (e.g. self-test not yet passed)', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: {
        hasPassedSelfTest: false, hasValidTime: false,
        startedTransactions: 0, maxStartedTransactions: 512,
        remainingSignatures: 100, maxSignatures: 100,
        certificateExpirationDate: 0, timeUntilNextSelfTest: 0, timeUntilNextTimeSynchronization: 0,
        tseCertificationId: 'BSI-K-TSE-0001', formFactor: 'USB', tseSerialNumber: 'aabbcc',
        signatureAlgorithm: 'ecdsa-plain-SHA384', logTimeFormat: 'unixTime',
        publicKey: 'cHVibGljS2V5', certificateChain: '',
      },
    });
    await configureTse();
    const { getTseCertificateInfo } = await import('./certificateInfo.js');
    const info = await getTseCertificateInfo();
    expect(info?.certificateChainBase64).toBe('');
  });

  it('returns null and does not cache when the TSE is unreachable', async () => {
    process.env['TSE_STUB_EXIT_CODE'] = '1';
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 3, message: 'worm_init failed' } });
    await configureTse();
    const { getTseCertificateInfo } = await import('./certificateInfo.js');
    expect(await getTseCertificateInfo()).toBeNull();
  });

  it('caches the result — a second call does not invoke the CLI again', async () => {
    process.env['TSE_STUB_LOG_FILE'] = '/tmp/tsecli-cert-info-calls.log';
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/tsecli-cert-info-calls.log', '');
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: {
        hasPassedSelfTest: true, hasValidTime: true,
        startedTransactions: 0, maxStartedTransactions: 512,
        remainingSignatures: 100, maxSignatures: 100,
        certificateExpirationDate: 0, timeUntilNextSelfTest: 0, timeUntilNextTimeSynchronization: 0,
        tseCertificationId: 'BSI-K-TSE-0001', formFactor: 'USB', tseSerialNumber: 'aabbcc',
        signatureAlgorithm: 'ecdsa-plain-SHA384', logTimeFormat: 'unixTime',
        publicKey: 'cHVibGljS2V5', certificateChain: 'Y2VydENoYWlu',
      },
    });
    await configureTse();
    const { getTseCertificateInfo } = await import('./certificateInfo.js');
    await getTseCertificateInfo();
    await getTseCertificateInfo();
    const calls = fs.readFileSync('/tmp/tsecli-cert-info-calls.log', 'utf8').trim().split('\n').filter(Boolean);
    expect(calls).toHaveLength(1);
    delete process.env['TSE_STUB_LOG_FILE'];
  });
});
