/**
 * PDF renderer for the TSE-Ausfall-Log (Task #157) — a proper A4 table
 * report, not the shared A6 receipt/Z-Bon block renderer
 * (`print/blocks.ts`): that renderer is deliberately tuned for a narrow
 * thermal-printer-shaped document and has no multi-column table primitive,
 * neither of which fits a potentially long (up to 500 rows) audit list
 * meant to be handed to a Betriebsprüfer. Uses Helvetica rather than the
 * receipts' monospace Courier — this document was never printed on a
 * thermal printer, so there is nothing for it to visually match.
 */

import PDFDocument from 'pdfkit';

/** One row as loaded from `tse_outage` (see `routes/admin/reports.ts::loadTseOutages`). */
export interface TseOutageRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  reason: string;
}

const COLUMNS = [
  { label: 'Beginn', width: 110 },
  { label: 'Ende', width: 110 },
  { label: 'Dauer', width: 90 },
  { label: 'Grund', width: 190 },
] as const;

/**
 * Formats a duration in whole minutes as a short German string, e.g.
 * "3 Min" or "2 Std 14 Min" — same rounding/formatting as the admin UI's
 * own `durationLabel()` (`admin/reports/tse-outages/+page.svelte`), so the
 * PDF and the live screen never disagree on the same outage.
 *
 * @param startedAt - Outage start.
 * @param endedAt - Outage end, or `null` for one still open at render time.
 * @param generatedAt - Reference "now" for a still-open outage.
 * @returns e.g. `"3 Min"` or `"2 Std 14 Min"`.
 */
function durationLabel(startedAt: Date, endedAt: Date | null, generatedAt: Date): string {
  const end = endedAt ?? generatedAt;
  const totalMinutes = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} Std ${minutes} Min` : `${minutes} Min`;
}

/** `de-DE` short date+time, matching the admin UI's `timeLabel()`. */
function formatTimestamp(d: Date): string {
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
}

/**
 * Draws the table header row (column labels + a rule) at the current cursor
 * position — called once per page, including every page a table row
 * overflows onto, so a reader never sees a page of data with no column
 * labels.
 *
 * @param doc - The in-progress PDF document.
 * @param x0 - Left margin x-coordinate.
 */
function drawTableHeader(doc: PDFKit.PDFDocument, x0: number): void {
  doc.font('Helvetica-Bold').fontSize(9);
  let x = x0;
  for (const col of COLUMNS) {
    doc.text(col.label, x, doc.y, { width: col.width, lineBreak: false });
    x += col.width;
  }
  doc.moveDown(0.4);
  const y = doc.y;
  doc.strokeColor('#000000').lineWidth(0.5).moveTo(x0, y).lineTo(x0 + COLUMNS.reduce((s, c) => s + c.width, 0), y).stroke();
  doc.moveDown(0.3);
}

/**
 * Renders the TSE outage log as an A4 PDF, resolving with the complete byte
 * buffer. Paginates manually (unlike the shared A6 block renderer, plain
 * `pdfkit` text calls here don't know about the table's column layout), so
 * every new page redraws the column header before continuing the list.
 *
 * @param rows - Outage rows, newest first (same order as the admin UI).
 * @param companyName - Printed in the header for identification.
 * @param generatedAt - Report generation timestamp — also stands in for
 *   "now" when computing a still-open outage's duration.
 * @returns Complete PDF byte buffer.
 */
export function renderTseOutagesPdf(
  rows: TseOutageRow[], companyName: string, generatedAt: Date,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'TSE-Ausfall-Log' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const x0 = doc.page.margins.left;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    const rowHeight = 16;

    doc.font('Helvetica-Bold').fontSize(14).text('TSE-Ausfall-Log', x0, doc.y);
    doc.font('Helvetica').fontSize(9);
    doc.text(companyName, x0, doc.y);
    doc.text(`Erstellt am ${formatTimestamp(generatedAt)} — ${rows.length} Eintrag${rows.length === 1 ? '' : 'träge'}, auf die 500 neuesten begrenzt`, x0, doc.y);
    doc.moveDown(0.8);

    drawTableHeader(doc, x0);

    doc.font('Helvetica').fontSize(9);
    if (rows.length === 0) {
      doc.text('Keine TSE-Ausfälle protokolliert.', x0, doc.y);
    }
    for (const row of rows) {
      if (doc.y + rowHeight > bottomLimit) {
        doc.addPage();
        drawTableHeader(doc, x0);
        doc.font('Helvetica').fontSize(9);
      }
      const y = doc.y;
      const cells = [
        formatTimestamp(row.startedAt),
        row.endedAt ? formatTimestamp(row.endedAt) : 'läuft noch',
        durationLabel(row.startedAt, row.endedAt, generatedAt),
        row.reason,
      ];
      let x = x0;
      for (let i = 0; i < COLUMNS.length; i++) {
        doc.text(cells[i]!, x, y, { width: COLUMNS[i]!.width, height: rowHeight, ellipsis: true });
        x += COLUMNS[i]!.width;
      }
      doc.y = y + rowHeight;
    }

    doc.end();
  });
}
