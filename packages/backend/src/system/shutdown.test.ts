/**
 * Unit tests for the server-shutdown helper (Task #61). Uses
 * `test/fixtures/sudoStub.sh` instead of the real, sudoers-gated `sudo`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { shutdownServer } from './shutdown.js';

const SUDO_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'sudoStub.sh',
);
const LOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.sudo-stub-shutdown-log.tmp');

beforeEach(() => {
  config.sudoPath = SUDO_STUB_PATH;
  delete process.env['SUDO_STUB_FAIL'];
  process.env['SUDO_STUB_LOG_FILE'] = LOG_FILE;
});

afterEach(() => {
  config.sudoPath = null;
  delete process.env['SUDO_STUB_FAIL'];
  delete process.env['SUDO_STUB_LOG_FILE'];
  try { unlinkSync(LOG_FILE); } catch { /* not created by every test */ }
});

describe('shutdownServer', () => {
  it('calls sudo systemctl poweroff', async () => {
    await shutdownServer();
    const log = readFileSync(LOG_FILE, 'utf-8').trim();
    expect(log).toBe('systemctl poweroff');
  });

  it('rejects with a clear message when the underlying command fails (e.g. missing sudoers rule)', async () => {
    process.env['SUDO_STUB_FAIL'] = '1';
    await expect(shutdownServer()).rejects.toThrow(/Server konnte nicht heruntergefahren werden/);
  });
});
