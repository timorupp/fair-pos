/**
 * Company-logo storage and rendering.
 *
 * The administrator uploads a PNG/JPG once via the settings UI; this module
 * normalises it into two pre-rendered variants stored in the database:
 *
 *  - `pdfPng`     — RGB PNG, scaled to the configured percentage of the PDF
 *                   receipt header width. Rendered directly by PDFKit.
 *  - `escposBin`  — 1-bit monochrome raster (Floyd–Steinberg dithered), wrapped
 *                   in the `GS v 0` ESC/POS raster-bit-image command. Ready to
 *                   concat into the printer stream — no per-print conversion.
 *
 * The original upload is also kept (`original_data`) so the operator can change
 * the zoom level later without re-uploading the file: a zoom change re-runs the
 * render step on the stored original.
 */

import sharp from 'sharp';
import { query } from '../db/client.js';

/** Default zoom in percent when none is configured. 100 = use the full bon width. */
export const DEFAULT_LOGO_ZOOM_PERCENT = 100;
/** Minimum zoom in percent the UI allows. */
export const MIN_LOGO_ZOOM_PERCENT = 1;
/** Maximum zoom in percent the UI allows (clamped to hardware limit internally). */
export const MAX_LOGO_ZOOM_PERCENT = 500;

/**
 * PDF reference width in pixels — generous headroom so the PNG keeps its
 * full aspect detail even when later rendered at full A6 width. PDFKit scales
 * the image to whatever pt-width the renderer asks for, so this value only
 * affects raster quality, not on-page size.
 */
const PDF_BASE_WIDTH = 1200;
/** Cap on the PDF logo height in pixels, regardless of zoom. */
const PDF_MAX_HEIGHT = 1800;
/**
 * ESC/POS raster width in pixels for 100% zoom — matches a standard 80 mm
 * Epson-compatible thermal printer's print head (576 dots @ 8 dots/mm = 72 mm).
 * Multiple of 8 so each raster row encodes cleanly into whole bytes
 * (`wrapEscposRaster` requires it).
 */
const ESCPOS_BASE_WIDTH = 576;
/** Cap on the ESC/POS raster height in pixels, regardless of zoom. */
const ESCPOS_MAX_HEIGHT = 1200;

const GS = 0x1d;
const LF = 0x0a;

/** What `loadCompanyLogo` returns when a logo is configured. */
export interface CompanyLogo {
  /** PNG bytes ready for PDFKit `doc.image()`. */
  pdfPng: Buffer;
  /** Width of `pdfPng` in pixels. Used by the renderer to centre the image. */
  pdfWidth: number;
  /** Height of `pdfPng` in pixels. Used by the renderer to reserve vertical space. */
  pdfHeight: number;
  /** Complete ESC/POS command sequence (GS v 0 header + raster bytes + LF). */
  escposBytes: Buffer;
}

/** Reads the zoom-percentage setting from `system_setting`, applying defaults / clamping. */
async function readZoomPercent(): Promise<number> {
  const result = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = 'logo_zoom_percent'`,
  );
  const raw = Number(result.rows[0]?.value);
  if (!Number.isFinite(raw)) return DEFAULT_LOGO_ZOOM_PERCENT;
  return clampZoom(raw);
}

/**
 * Clamps a zoom value to the allowed range.
 *
 * @param percent - Raw input from settings or UI.
 * @returns A value in `[MIN_LOGO_ZOOM_PERCENT, MAX_LOGO_ZOOM_PERCENT]`.
 */
export function clampZoom(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_LOGO_ZOOM_PERCENT;
  return Math.max(MIN_LOGO_ZOOM_PERCENT, Math.min(MAX_LOGO_ZOOM_PERCENT, Math.round(percent)));
}

/** Computes the resize target widths for a given zoom value. */
function resizeWidthsForZoom(percent: number): { pdfWidth: number; escposWidth: number } {
  const scale = percent / 100;
  // ESC/POS hardware can't print wider than the print head, so we cap at 100 %.
  // PDF can in theory exceed the page, but we cap symmetrically to keep things sane.
  const escposWidth = Math.min(ESCPOS_BASE_WIDTH, Math.round(ESCPOS_BASE_WIDTH * scale));
  // ESC/POS raster needs the byte-aligned width; round down to the nearest multiple of 8.
  const escposAligned = Math.max(8, escposWidth - (escposWidth % 8));
  const pdfWidth = Math.min(PDF_BASE_WIDTH, Math.round(PDF_BASE_WIDTH * scale));
  return { pdfWidth, escposWidth: escposAligned };
}

/**
 * Encodes the upload into the two stored representations using the given zoom.
 *
 * @param input - Raw bytes of the uploaded PNG/JPG.
 * @param zoomPercent - Zoom level (already clamped to the allowed range).
 * @returns The PDF PNG (with dimensions) and the wrapped ESC/POS raster bytes.
 */
async function renderVariants(input: Buffer, zoomPercent: number): Promise<{
  pdfPng: Buffer; pdfWidth: number; pdfHeight: number; escposBytes: Buffer;
}> {
  const { pdfWidth, escposWidth } = resizeWidthsForZoom(zoomPercent);

  // PDF variant: scale up small logos so they actually fill the configured
  // percentage of the bon (no `withoutEnlargement` here — that was the cause
  // of "tiny 60 %" rendering when the source PNG was small).
  const pdfMeta = await sharp(input)
    .resize({ width: pdfWidth, height: PDF_MAX_HEIGHT, fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer({ resolveWithObject: true });

  // ESC/POS variant: same idea, capped at the print-head width. Threshold
  // gives a 1-bit raster suitable for the GS v 0 command.
  const escposRaw = await sharp(input)
    .resize({ width: escposWidth, height: ESCPOS_MAX_HEIGHT, fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .threshold(160)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const escposBytes = wrapEscposRaster(escposRaw.data, escposRaw.info.width, escposRaw.info.height);
  return {
    pdfPng: pdfMeta.data,
    pdfWidth: pdfMeta.info.width,
    pdfHeight: pdfMeta.info.height,
    escposBytes,
  };
}

/**
 * Persists a freshly uploaded logo. Stores both pre-rendered variants AND the
 * original input (so a later zoom change can re-render without re-upload).
 *
 * @param input - Raw bytes of the uploaded PNG/JPG.
 * @throws When sharp cannot decode the image.
 */
export async function storeCompanyLogo(input: Buffer): Promise<void> {
  const zoom = await readZoomPercent();
  const variants = await renderVariants(input, zoom);
  await query(
    `INSERT INTO company_logo (id, pdf_data, escpos_data, pdf_width, pdf_height, original_data)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET pdf_data      = EXCLUDED.pdf_data,
           escpos_data   = EXCLUDED.escpos_data,
           pdf_width     = EXCLUDED.pdf_width,
           pdf_height    = EXCLUDED.pdf_height,
           original_data = EXCLUDED.original_data,
           updated_at    = now()`,
    [variants.pdfPng, variants.escposBytes, variants.pdfWidth, variants.pdfHeight, input],
  );
}

/**
 * Re-renders the stored logo using the new zoom value. Used by the settings
 * route when the operator changes `logo_zoom_percent`. No-op when no logo or
 * no original is stored.
 *
 * @param zoomPercent - New zoom (will be clamped before use).
 * @returns `true` when re-rendering ran, `false` when nothing was on disk.
 */
export async function rerenderStoredLogo(zoomPercent: number): Promise<boolean> {
  const safeZoom = clampZoom(zoomPercent);
  const result = await query<{ original_data: Buffer | null }>(
    `SELECT original_data FROM company_logo WHERE id = 1`,
  );
  const original = result.rows[0]?.original_data ?? null;
  if (!original) return false;
  const variants = await renderVariants(original, safeZoom);
  await query(
    `UPDATE company_logo
        SET pdf_data    = $1,
            escpos_data = $2,
            pdf_width   = $3,
            pdf_height  = $4,
            updated_at  = now()
      WHERE id = 1`,
    [variants.pdfPng, variants.escposBytes, variants.pdfWidth, variants.pdfHeight],
  );
  return true;
}

/**
 * Reads the singleton logo row. Returns `null` when no logo has been uploaded.
 *
 * @returns Stored variants, or `null` if the table is empty.
 */
export async function loadCompanyLogo(): Promise<CompanyLogo | null> {
  const result = await query<{ pdf_data: Buffer; escpos_data: Buffer; pdf_width: number; pdf_height: number }>(
    `SELECT pdf_data, escpos_data, pdf_width, pdf_height FROM company_logo WHERE id = 1`,
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0]!;
  return {
    pdfPng: row.pdf_data,
    pdfWidth: row.pdf_width,
    pdfHeight: row.pdf_height,
    escposBytes: row.escpos_data,
  };
}

/** Deletes the stored logo. No-op when none is configured. */
export async function deleteCompanyLogo(): Promise<void> {
  await query(`DELETE FROM company_logo WHERE id = 1`);
}

/**
 * Wraps a raw 1-bit pixel buffer in the ESC/POS `GS v 0` raster-bit-image
 * command. The input arrives from sharp's `.threshold().raw()`, which gives
 * one byte per pixel (0x00 or 0xff). We pack 8 pixels per output byte and
 * INVERT the polarity so that dark pixels (0x00) become 1 bits — that's
 * what the printer interprets as "print a dot".
 *
 * @param raw - Sharp's raw 1-bit pixel stream (one byte per pixel).
 * @param width - Width in pixels (must be a multiple of 8).
 * @param height - Height in pixels.
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
