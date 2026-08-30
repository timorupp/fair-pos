/**
 * Unit tests for the pure/text-parsing part of the SMART health check
 * (Task #87) — the rest (`lsblk`/`smartctl` invocation, disk-space stat)
 * needs a real filesystem/subprocess and isn't unit-tested here.
 */
import { describe, expect, it } from 'vitest';
import { classifySmartOutput, parseSmartCheckOutput, parseSsdWearPercent } from './healthChecks.js';

/** Real (anonymized-irrelevant) smartctl -a attribute table excerpt from an ADATA SU800NS38, captured live 2026-08-30. */
const ADATA_ATTRIBUTE_TABLE = `
ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE
  1 Raw_Read_Error_Rate     0x0000   100   100   000    Old_age   Offline      -       0
  9 Power_On_Hours          0x0000   100   100   000    Old_age   Offline      -       1082
177 Wear_Leveling_Count     0x0000   100   100   050    Old_age   Offline      -       14
181 Program_Fail_Cnt_Total  0x0000   100   100   000    Old_age   Offline      -       0
232 Available_Reservd_Space 0x0000   100   100   000    Old_age   Offline      -       100
`;

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

  it('does not misread the WHEN_FAILED attribute-table column header as a failure (regression, 2026-08-30)', () => {
    const fullOutput = 'SMART overall-health self-assessment test result: PASSED\n' + ADATA_ATTRIBUTE_TABLE;
    expect(classifySmartOutput(fullOutput)).toBe('ok');
  });
});

describe('parseSmartCheckOutput', () => {
  it('parses multiple disks, one per marker block', () => {
    const output = [
      '=== /dev/sda ===',
      'SMART overall-health self-assessment test result: PASSED',
      '=== /dev/sdb ===',
      'SMART overall-health self-assessment test result: FAILED!',
    ].join('\n');
    expect(parseSmartCheckOutput(output)).toEqual([
      { disk: 'sda', verdict: 'ok' },
      { disk: 'sdb', verdict: 'error' },
    ]);
  });

  it('returns an empty array for output with no markers', () => {
    expect(parseSmartCheckOutput('')).toEqual([]);
  });
});

describe('parseSsdWearPercent', () => {
  it('reads Wear_Leveling_Count VALUE from a real ADATA attribute table', () => {
    expect(parseSsdWearPercent(ADATA_ATTRIBUTE_TABLE)).toBe(100);
  });

  it('inverts NVMe "Percentage Used" into remaining life', () => {
    expect(parseSsdWearPercent('Percentage Used:                   37%')).toBe(63);
  });

  it('returns null when no known wear attribute is present (e.g. a plain HDD)', () => {
    const hddTable = `
ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE
  1 Raw_Read_Error_Rate     0x0000   100   100   000    Old_age   Offline      -       0
  5 Reallocated_Sector_Ct   0x0000   100   100   000    Old_age   Offline      -       0
`;
    expect(parseSsdWearPercent(hddTable)).toBeNull();
  });
});
