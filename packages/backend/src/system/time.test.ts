/**
 * Unit tests for the manual system-time-set helper (Task #60). Uses
 * `test/fixtures/sudoStub.sh` instead of the real, sudoers-gated `sudo`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { normalizeSetTimeInput, setSystemTime, setSystemTimezone } from './time.js';

const SUDO_STUB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'sudoStub.sh',
);
const LOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.sudo-stub-log.tmp');

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

describe('normalizeSetTimeInput', () => {
  it('converts the datetime-local "T" separator into a space for timedatectl', () => {
    expect(normalizeSetTimeInput('2026-08-24T18:35:00')).toBe('2026-08-24 18:35:00');
  });

  it('rejects a value without seconds', () => {
    expect(() => normalizeSetTimeInput('2026-08-24T18:35')).toThrow(/Ungültiges Datumsformat/);
  });

  it('rejects garbage input', () => {
    expect(() => normalizeSetTimeInput('not-a-date')).toThrow(/Ungültiges Datumsformat/);
  });
});

describe('setSystemTime', () => {
  it('calls sudo timedatectl set-time with the normalized value', async () => {
    await setSystemTime('2026-08-24T18:35:00');
    const log = readFileSync(LOG_FILE, 'utf-8').trim();
    expect(log).toBe('timedatectl set-time 2026-08-24 18:35:00');
  });

  it('rejects with a clear message when the underlying command fails (e.g. missing sudoers rule)', async () => {
    process.env['SUDO_STUB_FAIL'] = '1';
    await expect(setSystemTime('2026-08-24T18:35:00')).rejects.toThrow(/Systemzeit konnte nicht gesetzt werden/);
  });

  it('rejects malformed input before ever invoking sudo', async () => {
    await expect(setSystemTime('invalid')).rejects.toThrow(/Ungültiges Datumsformat/);
    expect(() => readFileSync(LOG_FILE, 'utf-8')).toThrow(); // stub never ran, log file never created
  });
});

describe('setSystemTimezone', () => {
  it('calls sudo timedatectl set-timezone with a valid IANA timezone', async () => {
    await setSystemTimezone('Europe/Berlin');
    const log = readFileSync(LOG_FILE, 'utf-8').trim();
    expect(log).toBe('timedatectl set-timezone Europe/Berlin');
  });

  it('rejects an unknown timezone before ever invoking sudo', async () => {
    await expect(setSystemTimezone('Not/A_Real_Zone')).rejects.toThrow(/Unbekannte Zeitzone/);
    expect(() => readFileSync(LOG_FILE, 'utf-8')).toThrow(); // stub never ran, log file never created
  });

  it('rejects with a clear message when the underlying command fails (e.g. missing sudoers rule)', async () => {
    process.env['SUDO_STUB_FAIL'] = '1';
    await expect(setSystemTimezone('Europe/Berlin')).rejects.toThrow(/Zeitzone konnte nicht gesetzt werden/);
  });
});
