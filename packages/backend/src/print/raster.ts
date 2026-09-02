/**
 * Converts an arbitrary PNG into an ESC/POS raster image command (`GS v 0`),
 * for content that only exists as a PNG at render time (e.g. a per-invoice
 * QR code) rather than being pre-rendered once like the company logo (see
 * `logo/logo.ts`, which has its own copy of this conversion done once at
 * upload time — not reused here to avoid coupling the two, since the logo's
 * copy is tuned for its own zoom/caching concerns).
 */

import sharp from 'sharp';

const GS = 0x1d;
const LF = 0x0a;

/**
 * Renders a PNG buffer as a monochrome (1-bit, Floyd–Steinberg dithered)
 * ESC/POS raster command, scaled to fit within `maxWidthPx`.
 *
 * @param png - Source PNG bytes.
 * @param maxWidthPx - Maximum output width in pixels; the image is scaled
 *   down proportionally if wider, never scaled up.
 * @returns Complete `GS v 0` command (header + packed bits + trailing LF),
 *   ready to concatenate into an ESC/POS byte stream.
 */
export async function pngToEscposRaster(png: Buffer, maxWidthPx: number): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .resize({ width: maxWidthPx, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .threshold(160)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return wrapEscposRaster(data, info.width, info.height);
}

/**
 * Packs a raw 1-byte-per-pixel grayscale buffer (already thresholded to pure
 * black/white) into the ESC/POS `GS v 0` bitmap command.
 *
 * @param raw - Sharp's raw pixel stream, one byte per pixel (0 = black, 255 = white).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns A buffer ready to be concatenated into an ESC/POS stream.
 */
function wrapEscposRaster(raw: Buffer, width: number, height: number): Buffer {
  const widthBytes = Math.ceil(width / 8);
  const packed = Buffer.alloc(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pxIdx = y * width + x;
      // Sharp gives 0 = black, 255 = white after threshold. ESC/POS wants
      // 1 = print (= black), so invert: dark pixel → bit set.
      const dark = raw[pxIdx] === 0 ? 1 : 0;
      if (dark) {
        const byteIdx = y * widthBytes + (x >> 3);
        const bitMask = 0x80 >> (x & 7);
        packed[byteIdx]! |= bitMask;
      }
    }
  }
  // GS v 0 m xL xH yL yH d1 … dn — m=0 (normal mode, 1× density)
  const header = Buffer.from([
    GS, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);
  return Buffer.concat([header, packed, Buffer.from([LF])]);
}
