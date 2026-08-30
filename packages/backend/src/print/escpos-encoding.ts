/**
 * ESC/POS text encoding for thermal receipt printers.
 *
 * Background: ESC/POS printers don't speak UTF-8. Each printer has a set of
 * built-in code pages and one active one at a time. For Western European
 * receipts the de-facto choice is **CP858** — identical to CP850 but with a
 * Euro sign on the slot that used to hold the dotless ı. Every Epson-compatible
 * thermal printer ships with it, and it contains every character we need for
 * German receipts: ä ö ü Ä Ö Ü ß plus €.
 *
 * Workflow:
 *  1. After `ESC @` (init), send `ESC t 19` to select CP858 on the printer.
 *  2. Convert every text line from JS-UTF-16 to CP858 bytes via `encodeCp858`.
 *
 * Doing it this way keeps the source code readable (we write "Ötigheim", not
 * `Buffer.from([0x99, 0x74, …])`) while the printer renders the actual umlauts
 * instead of the ASCII-friendly "Oetigheim" we used to send.
 */

const ESC = 0x1b;

/** ESC t 19 — selects the CP858 code page on the printer. Send once after `ESC @`. */
export const SELECT_CP858 = Buffer.from([ESC, 0x74, 0x13]);

/**
 * Encodes a JavaScript string as CP858 bytes. Characters that have no CP858
 * mapping are replaced with `?` so the byte stream stays well-formed.
 *
 * Only the German-relevant non-ASCII characters are mapped explicitly — that
 * is the set we actually emit. Pure ASCII passes through unchanged.
 *
 * @param text - Source string in JS (UTF-16).
 * @returns CP858 byte buffer (no terminator).
 */
export function encodeCp858(text: string): Buffer {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) { out.push(code); continue; }
    switch (ch) {
      case 'ä': out.push(0x84); break;
      case 'ö': out.push(0x94); break;
      case 'ü': out.push(0x81); break;
      case 'Ä': out.push(0x8e); break;
      case 'Ö': out.push(0x99); break;
      case 'Ü': out.push(0x9a); break;
      case 'ß': out.push(0xe1); break;
      case '€': out.push(0xd5); break;
      case '°': out.push(0xf8); break;
      case '§': out.push(0xf5); break;
      default:  out.push(0x3f); break;
    }
  }
  return Buffer.from(out);
}

/**
 * Renders one CP858-encoded text line plus a trailing line-feed. Shared by all
 * ESC/POS renderers so the encoding choice stays in one place.
 *
 * @param text - Plain text (will be CP858-encoded).
 * @returns Buffer with the encoded text followed by `\n`.
 */
export function escposLine(text: string): Buffer {
  return Buffer.concat([encodeCp858(text), Buffer.from([0x0a])]);
}

/**
 * Builds a two-column line with `left` flushed to the start and `right`
 * flushed to column `width`, padding between them with spaces. Each German
 * character occupies exactly one CP858 byte, so `string.length` is also the
 * print-column count.
 *
 * Truncates `left` if the combined width would exceed `width`.
 *
 * @param left - Label flushed left.
 * @param right - Value flushed right.
 * @param width - Total printable line width in columns (default 42 — Font A on 80 mm paper).
 * @returns The padded line ready for `escposLine`.
 */
export function twoColumn(left: string, right: string, width: number = 42): string {
  if (left.length + right.length + 1 > width) {
    const cut = Math.max(0, width - right.length - 1);
    left = left.slice(0, cut).trimEnd();
  }
  return left + ' '.repeat(Math.max(1, width - left.length - right.length)) + right;
}
