/**
 * Builds print jobs for the printer test page and PIN slips.
 *
 * Byte-level rendering goes through the shared block model (Task #105, see
 * `print/blocks.ts`) — callers build blocks here and render them via
 * `renderBlocksToEscPos`/`renderBlocksToPdf` themselves. Both document types
 * use CP858 like every other document type (previously ASCII-only here
 * specifically, dropping umlauts in printer/user names — an artifact of this
 * file predating the project-wide CP858 switch, not a deliberate choice, so
 * not preserved).
 */

import type { CompanyLogo } from '../logo/logo.js';
import type { PrintBlock } from './blocks.js';

/**
 * Formats a Date as a German-style `DD.MM.YYYY HH:MM:SS` timestamp string.
 * Extracted so the test-print byte stream is deterministically testable.
 *
 * @param d - The date to format (interpreted in the host's local timezone).
 * @returns The formatted string.
 */
export function formatGermanTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Pushes a centred image block for the given logo, if configured. */
function logoBlock(logo: CompanyLogo | null): PrintBlock[] {
  if (!logo) return [];
  return [{
    kind: 'image',
    pngBase64: logo.pdfPng.toString('base64'), pngWidth: logo.pdfWidth, pngHeight: logo.pdfHeight,
    escposRasterBase64: logo.escposBytes.toString('base64'), widthFactor: logo.pdfWidthFactor,
  }];
}

/**
 * Builds the block list for a printer test slip.
 *
 * @param printerName - Name of the printer (printed on the slip for confirmation).
 * @param timestamp - Date the slip was generated (printed on the slip).
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit. Used by the printer-test action to also verify the logo renders correctly.
 * @returns Blocks in print order, ready for either renderer.
 */
export function buildTestPrintBlocks(
  printerName: string,
  timestamp: Date,
  logo: CompanyLogo | null = null,
): PrintBlock[] {
  return [
    ...logoBlock(logo),
    { kind: 'text', text: 'FairPOS', align: 'center', bold: true, size: 'xlarge' },
    { kind: 'text', text: 'Testdruck' },
    { kind: 'blank' },
    { kind: 'text', text: `Drucker: ${printerName}` },
    { kind: 'text', text: `Zeit:    ${formatGermanTimestamp(timestamp)}` },
  ];
}

/**
 * Builds the block list for a PIN slip (Task #90 follow-up) — the "PIN
 * drucken" action in the user management's PIN dialog.
 *
 * @param userName - Name of the user the PIN belongs to.
 * @param pin - The PIN in its hyphen-grouped display form, e.g. `ABC-DEF-GHJ`.
 * @param timestamp - Date the slip was generated (printed on the slip).
 * @returns Blocks in print order, ready for either renderer.
 */
export function buildPinSlipBlocks(userName: string, pin: string, timestamp: Date): PrintBlock[] {
  return [
    { kind: 'text', text: 'FairPOS', align: 'center', bold: true, size: 'xlarge' },
    { kind: 'text', text: 'PIN-Zugang' },
    { kind: 'blank' },
    { kind: 'text', text: `Benutzer: ${userName}` },
    { kind: 'blank' },
    { kind: 'text', text: pin, size: 'xlarge' }, // PIN must be easy to read
    { kind: 'blank' },
    { kind: 'text', text: formatGermanTimestamp(timestamp) },
  ];
}
