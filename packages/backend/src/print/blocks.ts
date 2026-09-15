/**
 * Neutral, format-independent document model shared by every printable
 * document (receipt, Z-Bon, order slip, test print, PIN slip — Task #105).
 *
 * Each document builder emits a `PrintBlock[]` describing *what* to print
 * once; `renderBlocksToEscPos`/`renderBlocksToPdf` below turn that into the
 * two actual target formats. This replaces five previously-independent
 * ESC/POS builders (each duplicating the same `ESC`/`GS`/`CUT`/… constants)
 * and their separate, drifting PDF counterparts.
 *
 * Deliberately NOT a general-purpose layout engine — just the handful of
 * primitives every document here actually uses. See `docs/TSE-Integration.md`
 * for context; this module has no TSE-specific knowledge of its own.
 */

import PDFDocument from 'pdfkit';
import { SELECT_CP858, escposLine, twoColumn as escposTwoColumn } from './escpos-encoding.js';

/** Relative emphasis for a line/row — interpreted independently by each renderer (ESC/POS: character size, PDF: font size). */
export type PrintTextSize = 'normal' | 'large' | 'xlarge';

/** Horizontal alignment for a single text line. Two-column rows are always left+right, so this only applies to `TextBlock`. */
export type PrintAlign = 'left' | 'center';

/** One line of plain text. */
export interface TextBlock {
  kind: 'text';
  text: string;
  /** @default 'left' */
  align?: PrintAlign;
  bold?: boolean;
  /** @default 'normal' */
  size?: PrintTextSize;
}

/** A two-column row: a label flush left, a value flush right (item + price, totals, VAT breakdown, …). */
export interface RowBlock {
  kind: 'row';
  left: string;
  right: string;
  bold?: boolean;
  /** @default 'normal' */
  size?: PrintTextSize;
}

/** A horizontal divider spanning the full printable width. */
export interface HrBlock {
  kind: 'hr';
}

/** A blank line. */
export interface BlankBlock {
  kind: 'blank';
}

/**
 * A centred image (company logo or a per-document QR code). Both target
 * representations are pre-rendered by the caller — this module never decodes
 * or rasterises an image itself, see `logo/logo.ts` (logo, at upload time)
 * and `print/raster.ts` (QR code, at document-build time).
 */
export interface ImageBlock {
  kind: 'image';
  /** PNG bytes, base64-encoded — consumed by the PDF renderer. */
  pngBase64: string;
  /** Pixel width of the PNG (needed to keep the aspect ratio when scaling in the PDF). */
  pngWidth: number;
  /** Pixel height of the PNG. */
  pngHeight: number;
  /** Pre-rendered ESC/POS raster command (`GS v 0` + bytes), base64-encoded — consumed by the ESC/POS renderer as-is, already sized. */
  escposRasterBase64: string;
  /** Fraction (0–1] of the printable width the image should occupy in the PDF. Ignored by the ESC/POS renderer — the raster's own pixel size already determines its printed width. */
  widthFactor: number;
}

export type PrintBlock = TextBlock | RowBlock | HrBlock | BlankBlock | ImageBlock;

// ── ESC/POS renderer ─────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const INIT = Buffer.concat([Buffer.from([ESC, 0x40]), SELECT_CP858]);
const CUT = Buffer.from([GS, 0x56, 0x00]);
const FEED3 = Buffer.from([LF, LF, LF]);
const ALIGN_CTR = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LFT = Buffer.from([ESC, 0x61, 0x00]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);

/** Width of one printed line in characters (Font A, 80 mm thermal paper). */
const ESCPOS_LINE_WIDTH = 42;

/** `ESC ! n` — print mode; bit 4 (0x10) = double height, bit 5 (0x20) = double width. */
function selectMode(mode: number): Buffer {
  return Buffer.from([ESC, 0x21, mode]);
}
const MODE_NORMAL = selectMode(0x00);
const MODE_LARGE = selectMode(0x10); // double height only
const MODE_XLARGE = selectMode(0x30); // double height + width

function escposModeFor(size: PrintTextSize | undefined): Buffer | null {
  switch (size) {
    case 'large': return MODE_LARGE;
    case 'xlarge': return MODE_XLARGE;
    default: return null;
  }
}

/**
 * Renders a block list as a complete ESC/POS byte stream, ending with a paper
 * feed and cut. Every document (receipt, Z-Bon, order slip, …) shares this
 * single implementation instead of each hand-rolling its own byte sequence.
 *
 * @param blocks - The document's content, in print order.
 * @returns Raw bytes ready to enqueue as a print job.
 */
export function renderBlocksToEscPos(blocks: PrintBlock[]): Buffer {
  const parts: Buffer[] = [INIT];
  let align: PrintAlign = 'left';

  const setAlign = (next: PrintAlign) => {
    if (next === align) return;
    parts.push(next === 'center' ? ALIGN_CTR : ALIGN_LFT);
    align = next;
  };

  for (const block of blocks) {
    switch (block.kind) {
      case 'text': {
        setAlign(block.align ?? 'left');
        const mode = escposModeFor(block.size);
        if (block.bold) parts.push(BOLD_ON);
        if (mode) parts.push(mode);
        parts.push(escposLine(block.text));
        if (mode) parts.push(MODE_NORMAL);
        if (block.bold) parts.push(BOLD_OFF);
        break;
      }
      case 'row': {
        setAlign('left');
        const mode = escposModeFor(block.size);
        if (block.bold) parts.push(BOLD_ON);
        if (mode) parts.push(mode);
        parts.push(escposLine(escposTwoColumn(block.left, block.right, ESCPOS_LINE_WIDTH)));
        if (mode) parts.push(MODE_NORMAL);
        if (block.bold) parts.push(BOLD_OFF);
        break;
      }
      case 'hr':
        setAlign('left');
        parts.push(escposLine('-'.repeat(ESCPOS_LINE_WIDTH)));
        break;
      case 'blank':
        parts.push(escposLine(''));
        break;
      case 'image':
        setAlign('center');
        parts.push(Buffer.from(block.escposRasterBase64, 'base64'));
        break;
    }
  }

  parts.push(FEED3, CUT);
  return Buffer.concat(parts);
}

// ── PDF renderer ──────────────────────────────────────────────────────────

/**
 * Font sizes (pt) per {@link PrintTextSize}, tuned for the A6 page these
 * documents render onto. Deliberately monospace (Courier) rather than
 * Helvetica so the PDF visually matches the fixed-width thermal printout
 * (Task #105 — "PDF soll aussehen wie der Bon, keine Farben nötig").
 */
function pdfFontSizeFor(size: PrintTextSize | undefined): number {
  switch (size) {
    case 'large': return 10;
    case 'xlarge': return 13;
    default: return 8;
  }
}

/**
 * Renders a block list as a complete PDF (A6 portrait), resolving with the
 * byte buffer. Every document shares this single implementation — see
 * {@link renderBlocksToEscPos} for its ESC/POS counterpart on the same input.
 *
 * @param blocks - The document's content, in print order (same list as
 *   passed to {@link renderBlocksToEscPos} for the same document).
 * @param title - PDF metadata title (e.g. the receipt/Z-Bon number).
 * @returns Complete PDF byte buffer.
 */
export function renderBlocksToPdf(blocks: PrintBlock[], title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', margin: 18, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const x0 = doc.page.margins.left;

    for (const block of blocks) {
      switch (block.kind) {
        case 'text': {
          doc.font(block.bold ? 'Courier-Bold' : 'Courier').fontSize(pdfFontSizeFor(block.size));
          doc.text(block.text, x0, doc.y, { width: W, align: block.align ?? 'left' });
          doc.x = x0;
          break;
        }
        case 'row': {
          doc.font(block.bold ? 'Courier-Bold' : 'Courier').fontSize(pdfFontSizeFor(block.size));
          const y = doc.y;
          doc.text(block.left, x0, y, { width: W / 2 });
          doc.text(block.right, x0 + W / 2, y, { width: W / 2, align: 'right' });
          doc.x = x0;
          doc.moveDown(0.15);
          break;
        }
        case 'hr': {
          const y = doc.y;
          doc.strokeColor('#000000').lineWidth(0.5).moveTo(x0, y).lineTo(x0 + W, y).stroke();
          doc.moveDown(0.2);
          break;
        }
        case 'blank':
          doc.moveDown(0.5);
          break;
        case 'image': {
          const png = Buffer.from(block.pngBase64, 'base64');
          const targetWidth = W * block.widthFactor;
          const targetHeight = targetWidth * block.pngHeight / block.pngWidth;
          const topY = doc.y;
          doc.image(png, x0 + (W - targetWidth) / 2, topY, { width: targetWidth });
          doc.y = topY + targetHeight;
          doc.moveDown(0.3);
          break;
        }
      }
    }

    doc.end();
  });
}
