import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { pngToEscposRaster } from './raster.js';

/** Builds a tiny synthetic black-and-white PNG for testing, without depending on any real QR/logo asset. */
async function makeTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
}

describe('pngToEscposRaster', () => {
  it('produces a GS v 0 command with the correct header fields', async () => {
    const png = await makeTestPng(16, 8);
    const raster = await pngToEscposRaster(png, 100);

    expect(raster[0]).toBe(0x1d); // GS
    expect(raster[1]).toBe(0x76); // 'v'
    expect(raster[2]).toBe(0x30); // '0'
    expect(raster[3]).toBe(0x00); // mode

    const widthBytes = raster[4]! | (raster[5]! << 8);
    const height = raster[6]! | (raster[7]! << 8);
    expect(widthBytes).toBe(Math.ceil(16 / 8));
    expect(height).toBe(8);

    // header (8) + packed bits (widthBytes * height) + trailing LF (1)
    expect(raster.length).toBe(8 + widthBytes * height + 1);
    expect(raster[raster.length - 1]).toBe(0x0a);
  });

  it('scales down an image wider than maxWidthPx, never enlarges a narrower one', async () => {
    const wide = await makeTestPng(400, 100);
    const rasterWide = await pngToEscposRaster(wide, 200);
    const widthBytesWide = rasterWide[4]! | (rasterWide[5]! << 8);
    expect(widthBytesWide).toBeLessThanOrEqual(Math.ceil(200 / 8));

    const narrow = await makeTestPng(50, 50);
    const rasterNarrow = await pngToEscposRaster(narrow, 200);
    const widthBytesNarrow = rasterNarrow[4]! | (rasterNarrow[5]! << 8);
    expect(widthBytesNarrow).toBe(Math.ceil(50 / 8));
  });
});
