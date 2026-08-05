/** Unit tests for the DSFinV-K CSV serialiser. */
import { describe, it, expect } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('writes a header row from the object keys, then one row per entry, semicolon-separated with CRLF', () => {
    const csv = toCsv([{ A: 'x', B: 1 }, { A: 'y', B: 2 }]);
    expect(csv).toBe('A;B\r\nx;1\r\ny;2\r\n');
  });

  it('quotes a field containing the separator, doubling any inner quotes', () => {
    const csv = toCsv([{ NOTE: 'a;b "c"' }]);
    expect(csv).toBe('NOTE\r\n"a;b ""c"""\r\n');
  });

  it('quotes a field containing a line break', () => {
    const csv = toCsv([{ NOTE: 'line1\nline2' }]);
    expect(csv).toBe('NOTE\r\n"line1\nline2"\r\n');
  });
});
