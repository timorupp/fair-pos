/** Unit tests for the lsblk-tree-walking logic behind the TSE mount-candidate dropdown/Auto-erkennen button. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { collectCandidates, listTseMountCandidates, detectTse, type LsblkNode } from './detect.js';
import { config } from '../config.js';

const TSE_CLI_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'tseCliStub.sh',
);

describe('collectCandidates', () => {
  it('picks up a mounted USB disk with no partitions', () => {
    const nodes: LsblkNode[] = [
      { name: 'sdb', mountpoint: '/media/usb0', tran: 'usb', rm: true },
    ];
    expect(collectCandidates(nodes)).toEqual([{ mountPoint: '/media/usb0', device: 'sdb' }]);
  });

  it('inherits the parent disk\'s tran/rm down to a mounted partition that reports neither itself', () => {
    // Real lsblk output: `tran`/`rm` are usually only set on the top-level
    // disk node, not on its partitions.
    const nodes: LsblkNode[] = [
      {
        name: 'sdb', mountpoint: null, tran: 'usb', rm: true,
        children: [{ name: 'sdb1', mountpoint: '/media/usb0', tran: null, rm: null }],
      },
    ];
    expect(collectCandidates(nodes)).toEqual([{ mountPoint: '/media/usb0', device: 'sdb1' }]);
  });

  it('ignores a mounted internal (non-removable, non-USB) disk', () => {
    const nodes: LsblkNode[] = [
      {
        name: 'sda', mountpoint: null, tran: null, rm: false,
        children: [{ name: 'sda1', mountpoint: '/', tran: null, rm: false }],
      },
    ];
    expect(collectCandidates(nodes)).toEqual([]);
  });

  it('ignores a removable disk that is not currently mounted', () => {
    const nodes: LsblkNode[] = [
      { name: 'sdc', mountpoint: null, tran: 'usb', rm: true },
    ];
    expect(collectCandidates(nodes)).toEqual([]);
  });

  it('handles the `rm` field as either a JSON boolean or the string "1", depending on lsblk version', () => {
    const nodes: LsblkNode[] = [
      { name: 'sdb', mountpoint: '/media/a', tran: null, rm: '1' },
      { name: 'sdc', mountpoint: '/media/b', tran: null, rm: true },
    ];
    expect(collectCandidates(nodes)).toEqual([
      { mountPoint: '/media/a', device: 'sdb' },
      { mountPoint: '/media/b', device: 'sdc' },
    ]);
  });

  it('collects multiple independent removable mounts (multi-club scenario)', () => {
    const nodes: LsblkNode[] = [
      { name: 'sdb', mountpoint: '/media/usb0', tran: 'usb', rm: true },
      { name: 'sdc', mountpoint: '/media/usb1', tran: 'usb', rm: true },
    ];
    expect(collectCandidates(nodes)).toEqual([
      { mountPoint: '/media/usb0', device: 'sdb' },
      { mountPoint: '/media/usb1', device: 'sdc' },
    ]);
  });
});

describe('listTseMountCandidates', () => {
  it('runs the real lsblk binary and returns a well-formed (possibly empty) list without throwing', async () => {
    const candidates = await listTseMountCandidates();
    expect(Array.isArray(candidates)).toBe(true);
    for (const c of candidates) {
      expect(typeof c.mountPoint).toBe('string');
      expect(typeof c.device).toBe('string');
    }
  });
});

describe('detectTse', () => {
  beforeEach(() => {
    config.tseCliPath = TSE_CLI_STUB_PATH;
    delete process.env['TSE_STUB_STDOUT'];
    delete process.env['TSE_STUB_EXIT_CODE'];
  });

  it('reports a candidate as found when the (stubbed) info call for it succeeds', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({
      ok: true,
      result: {
        hasPassedSelfTest: true, hasValidTime: true,
        startedTransactions: 0, maxStartedTransactions: 10,
        remainingSignatures: 100, maxSignatures: 100,
        certificateExpirationDate: 0, timeUntilNextSelfTest: 0, timeUntilNextTimeSynchronization: 0,
        tseCertificationId: 'BSI-X', formFactor: 'USB', tseSerialNumber: 'aabb',
        signatureAlgorithm: 'ecdsa-plain-SHA384', logTimeFormat: 'unixTime', publicKey: '',
      },
    });
    const result = await detectTse(async () => [{ mountPoint: '/media/usb0', device: 'sdb1' }]);
    expect(result.found).toMatchObject({ mountPoint: '/media/usb0' });
    expect(result.found?.info.tseSerialNumber).toBe('aabb');
    expect(result.triedAndRejected).toEqual([]);
  });

  it('reports every candidate as rejected when none of them is a real TSE', async () => {
    process.env['TSE_STUB_STDOUT'] = JSON.stringify({ ok: false, error: { code: 1, message: 'not a TSE' } });
    process.env['TSE_STUB_EXIT_CODE'] = '1';
    const candidates = [
      { mountPoint: '/media/usb0', device: 'sdb1' },
      { mountPoint: '/media/usb1', device: 'sdc1' },
    ];
    const result = await detectTse(async () => candidates);
    expect(result.found).toBeNull();
    expect(result.triedAndRejected).toEqual(candidates);
  });

  it('returns no candidates cleanly when nothing is mounted', async () => {
    const result = await detectTse(async () => []);
    expect(result).toEqual({ found: null, triedAndRejected: [] });
  });
});
