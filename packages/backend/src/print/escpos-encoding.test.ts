/** Tests for the shared ESC/POS text-encoding helpers (CP858, two-column padding). */
import { describe, it, expect } from 'vitest';
import { encodeCp858, twoColumn } from './escpos-encoding.js';

describe('encodeCp858', () => {
  it('passes ASCII through unchanged', () => {
    expect(encodeCp858('Bier 5,00')).toEqual(Buffer.from('Bier 5,00', 'ascii'));
  });

  it('maps German umlauts, ß and € to their CP858 byte values', () => {
    expect(encodeCp858('äöüÄÖÜß€')).toEqual(
      Buffer.from([0x84, 0x94, 0x81, 0x8e, 0x99, 0x9a, 0xe1, 0xd5]),
    );
  });

  it('replaces unmappable characters with ?', () => {
    expect(encodeCp858('日')).toEqual(Buffer.from([0x3f]));
  });
});

describe('twoColumn', () => {
  it('pads with spaces so left + right fill the width', () => {
    expect(twoColumn('Bier', '5,00', 20)).toBe('Bier            5,00');
    expect(twoColumn('Bier', '5,00', 20).length).toBe(20);
  });

  it('keeps at least one space between left and right when content is tight', () => {
    const result = twoColumn('Sehr langer Artikelname', '12,34', 25);
    expect(result.length).toBe(25);
    expect(result).toMatch(/12,34$/);
  });

  it('truncates the left side when the row would overflow', () => {
    const result = twoColumn('Sehr langer Artikelname der nicht passt', '1,00', 20);
    expect(result.length).toBe(20);
    expect(result).toMatch(/1,00$/);
  });

  it('defaults to width 42 (Font A, 80 mm)', () => {
    expect(twoColumn('a', 'b').length).toBe(42);
  });
});
