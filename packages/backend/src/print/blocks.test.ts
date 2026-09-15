/** Tests for the shared print-block model (Task #105) — both renderers against the same input blocks. */
import { describe, it, expect } from 'vitest';
import { renderBlocksToEscPos, renderBlocksToPdf, type PrintBlock } from './blocks.js';

describe('renderBlocksToEscPos', () => {
  it('begins with the ESC @ initialise sequence', () => {
    const buf = renderBlocksToEscPos([{ kind: 'text', text: 'Hallo' }]);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it('ends with three line feeds followed by a full cut (GS V 0)', () => {
    const buf = renderBlocksToEscPos([{ kind: 'text', text: 'Hallo' }]);
    const tail = buf.subarray(buf.length - 6);
    expect([...tail.subarray(0, 3)]).toEqual([0x0a, 0x0a, 0x0a]);
    expect([...tail.subarray(3)]).toEqual([0x1d, 0x56, 0x00]);
  });

  it('encodes German umlauts as CP858 bytes', () => {
    const buf = renderBlocksToEscPos([{ kind: 'text', text: 'Käse Müller Straße' }]);
    expect(buf.includes(Buffer.from([0x4b, 0x84, 0x73, 0x65]))).toBe(true); // "Käse"
    expect(buf.includes(Buffer.from([0x4d, 0x81, 0x6c]))).toBe(true);       // "Mül"
    expect(buf.includes(Buffer.from([0x53, 0x74, 0x72, 0x61, 0xe1, 0x65]))).toBe(true); // "Straße"
  });

  it('renders a row block as one padded two-column line', () => {
    const buf = renderBlocksToEscPos([{ kind: 'row', left: 'Bier', right: '5,00' }]);
    const ascii = buf.toString('ascii');
    expect(ascii).toContain('Bier');
    expect(ascii).toMatch(/Bier\s+5,00/);
  });

  it('wraps bold text with ESC E 1 / ESC E 0', () => {
    const buf = renderBlocksToEscPos([{ kind: 'text', text: 'Fett', bold: true }]);
    expect(buf.includes(Buffer.from([0x1b, 0x45, 0x01]))).toBe(true);
    expect(buf.includes(Buffer.from([0x1b, 0x45, 0x00]))).toBe(true);
  });

  it('switches alignment only when it actually changes', () => {
    const blocks: PrintBlock[] = [
      { kind: 'text', text: 'a', align: 'center' },
      { kind: 'text', text: 'b', align: 'center' },
      { kind: 'text', text: 'c', align: 'left' },
    ];
    const buf = renderBlocksToEscPos(blocks);
    const ALIGN_CTR = Buffer.from([0x1b, 0x61, 0x01]);
    const ALIGN_LFT = Buffer.from([0x1b, 0x61, 0x00]);
    // Exactly one switch to centre and one back to left, not one per block.
    let count = 0;
    let idx = -1;
    while ((idx = buf.indexOf(ALIGN_CTR, idx + 1)) !== -1) count++;
    expect(count).toBe(1);
    count = 0; idx = -1;
    while ((idx = buf.indexOf(ALIGN_LFT, idx + 1)) !== -1) count++;
    expect(count).toBe(1);
  });

  it('renders an hr block as a full-width dashed line', () => {
    const buf = renderBlocksToEscPos([{ kind: 'hr' }]);
    expect(buf.toString('ascii')).toContain('-'.repeat(42));
  });

  it('embeds an image block\'s raw ESC/POS raster verbatim', () => {
    const raster = Buffer.from([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0xff, 0x0a]);
    const buf = renderBlocksToEscPos([{
      kind: 'image', pngBase64: '', pngWidth: 1, pngHeight: 1,
      escposRasterBase64: raster.toString('base64'), widthFactor: 1,
    }]);
    expect(buf.includes(raster)).toBe(true);
  });
});

describe('renderBlocksToPdf', () => {
  it('produces a valid PDF byte buffer', async () => {
    const pdf = await renderBlocksToPdf([{ kind: 'text', text: 'Hallo' }], 'Test');
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(100);
  });

  it('renders every block kind without throwing', async () => {
    const onePxPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const blocks: PrintBlock[] = [
      { kind: 'text', text: 'Titel', align: 'center', bold: true, size: 'xlarge' },
      { kind: 'row', left: 'Bier', right: '5,00' },
      { kind: 'hr' },
      { kind: 'blank' },
      { kind: 'image', pngBase64: onePxPng.toString('base64'), pngWidth: 1, pngHeight: 1, escposRasterBase64: '', widthFactor: 0.5 },
    ];
    const pdf = await renderBlocksToPdf(blocks, 'Test');
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
