/**
 * Unit tests for the pure/text-parsing part of the SMART health check
 * (Task #87) — the rest (`lsblk`/`smartctl` invocation, disk-space stat)
 * needs a real filesystem/subprocess and isn't unit-tested here.
 */
import { describe, expect, it } from 'vitest';
import { classifySmartOutput } from './healthChecks.js';

describe('classifySmartOutput', () => {
  it('recognizes a healthy ATA disk', () => {
    expect(classifySmartOutput('SMART overall-health self-assessment test result: PASSED')).toBe('ok');
  });

  it('recognizes a healthy SCSI/NVMe disk', () => {
    expect(classifySmartOutput('SMART Health Status: OK')).toBe('ok');
  });

  it('recognizes a failing disk', () => {
    expect(classifySmartOutput('SMART overall-health self-assessment test result: FAILED!')).toBe('error');
  });

  it('treats unrecognized output as unknown', () => {
    expect(classifySmartOutput('Some unexpected smartctl output')).toBe('unknown');
  });
});
