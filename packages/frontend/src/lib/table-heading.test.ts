/** Unit tests for the table page heading (Task #158). */
import { describe, expect, it } from 'vitest';
import { formatTableHeading } from './table-heading';

describe('formatTableHeading (Task #158)', () => {
  it('prefixes the table name with "Tisch"', () => {
    expect(formatTableHeading('A1')).toBe('Tisch A1');
  });

  it('falls back to plain "Tisch" while the name is unknown', () => {
    expect(formatTableHeading(null)).toBe('Tisch');
    expect(formatTableHeading('')).toBe('Tisch');
  });
});
