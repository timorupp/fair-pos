/** ESC/POS payload builders. Produces raw byte sequences for network thermal printers. */

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

/** ESC @ — initialise printer (reset modes, line spacing, character set). */
const INIT = Buffer.from([ESC, 0x40]);

/** GS V 0 — full paper cut. */
const CUT = Buffer.from([GS, 0x56, 0x00]);

/** Three line feeds to advance the paper past the cutter blade before cutting. */
const FEED = Buffer.from([LF, LF, LF]);

/** ESC ! n — select print mode; bit 4 (0x10) = double height, bit 5 (0x20) = double width. */
function selectMode(mode: number): Buffer {
  return Buffer.from([ESC, 0x21, mode]);
}

/** Returns the bytes for a single text line followed by LF. CP437/ASCII only — extended Latin chars will be replaced. */
function textLine(text: string): Buffer {
  return Buffer.concat([Buffer.from(text + '\n', 'ascii')]);
}

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

/** ESC a 1 — centre alignment; used to centre the optional logo block. */
const ALIGN_CTR = Buffer.from([ESC, 0x61, 0x01]);
/** ESC a 0 — left alignment; restores the default after a centred block. */
const ALIGN_LFT = Buffer.from([ESC, 0x61, 0x00]);

/**
 * Builds an ESC/POS test-print payload as a raw byte buffer.
 *
 * Layout: optional centred logo at the top, bold "FairPOS" header, "Testdruck"
 * subtitle, printer name + timestamp, paper feed, full cut. ASCII-only —
 * non-ASCII chars in `printerName` are dropped.
 *
 * @param printerName - Name of the printer (printed on the slip for confirmation).
 * @param timestamp - Date the slip was generated (printed on the slip).
 * @param logoEscPos - Optional pre-rendered ESC/POS logo raster (`GS v 0` block)
 *   to embed centred at the top. Pass `null` to omit. Used by the printer-test
 *   action to also verify the logo renders correctly.
 * @returns Raw bytes ready to send via TCP or enqueue as a print job.
 */
export function buildTestPrint(
  printerName: string,
  timestamp: Date,
  logoEscPos: Buffer | null = null,
): Buffer {
  const parts: Buffer[] = [INIT];
  if (logoEscPos) parts.push(ALIGN_CTR, logoEscPos, ALIGN_LFT);
  parts.push(
    selectMode(0x30),                                  // double width + height
    textLine('FairPOS'),
    selectMode(0x00),                                  // back to normal
    textLine('Testdruck'),
    textLine(''),
    textLine(`Drucker: ${printerName}`),
    textLine(`Zeit:    ${formatGermanTimestamp(timestamp)}`),
    FEED,
    CUT,
  );
  return Buffer.concat(parts);
}

/**
 * Builds an ESC/POS PIN-slip payload (Task #90 follow-up) — the "PIN
 * drucken" action in the user management's PIN dialog. Layout: bold
 * "FairPOS" header, user name, PIN in double-size for legibility, timestamp.
 * ASCII-only — non-ASCII chars in `userName` are dropped.
 *
 * @param userName - Name of the user the PIN belongs to.
 * @param pin - The PIN in its hyphen-grouped display form, e.g. `ABC-DEF-GHJ`.
 * @param timestamp - Date the slip was generated (printed on the slip).
 * @returns Raw bytes ready to send via TCP or enqueue as a print job.
 */
export function buildPinSlip(userName: string, pin: string, timestamp: Date): Buffer {
  return Buffer.concat([
    INIT,
    selectMode(0x30),                                  // double width + height
    textLine('FairPOS'),
    selectMode(0x00),                                  // back to normal
    textLine('PIN-Zugang'),
    textLine(''),
    textLine(`Benutzer: ${userName}`),
    textLine(''),
    selectMode(0x30),                                  // double width + height — PIN must be easy to read
    textLine(pin),
    selectMode(0x00),                                  // back to normal
    textLine(''),
    textLine(formatGermanTimestamp(timestamp)),
    FEED,
    CUT,
  ]);
}
