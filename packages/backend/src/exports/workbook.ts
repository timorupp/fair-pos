/** ExcelJS-based encoder that turns aggregated `ExportRow`s into an .xlsx byte buffer. */

import ExcelJS from 'exceljs';
import type { ExportRow } from './rows.js';

/** Metadata shown in the workbook title row and used to title the worksheet. */
export interface WorkbookMeta {
  /** Sheet name (max 31 chars per Excel limits — caller is responsible for shortening). */
  sheetName: string;
  /** Title printed in the first row above the table. */
  title: string;
  /** Sub-title (e.g. event name + range, or "Tag DD.MM.YYYY"). */
  subtitle: string;
}

/** Column definitions shared by all export sheets. Header text matches the German Anforderungen wording. */
const COLUMNS: { header: string; key: keyof ExportRow | 'date' | 'time'; width: number; numFmt?: string; align?: 'left' | 'right' }[] = [
  { header: 'Belegnummer',    key: 'receipt_number',    width: 14, align: 'left' },
  { header: 'Datum',          key: 'date',              width: 12 },
  { header: 'Uhrzeit',        key: 'time',              width: 10 },
  { header: 'Tisch',          key: 'table_name',        width: 10 },
  { header: 'Besteller',      key: 'ordering_user_name', width: 14 },
  { header: 'Kasse',          key: 'register_name',     width: 14 },
  { header: 'Artikelname',    key: 'article_name',      width: 28 },
  { header: 'Menge',          key: 'quantity',          width: 8,  align: 'right' },
  { header: 'Einzelpreis',    key: 'unit_price',        width: 12, align: 'right', numFmt: '#,##0.00 "€"' },
  { header: 'Pfandbetrag',    key: 'unit_deposit',      width: 12, align: 'right', numFmt: '#,##0.00 "€"' },
  { header: 'Umsatzsteuersatz', key: 'tax_rate',        width: 14, align: 'right', numFmt: '0"%"' },
  { header: 'Gesamtbetrag',   key: 'line_total',        width: 14, align: 'right', numFmt: '#,##0.00 "€"' },
];

/**
 * Builds an .xlsx workbook containing one row per `ExportRow`.
 *
 * The workbook has a single sheet with a header banner (title + subtitle),
 * a frozen header row, and the table data. Cell formats use German number
 * conventions (comma decimal separator, euro suffix) so the file opens
 * correctly in a German Excel locale.
 *
 * @param meta - Sheet name and visible title/subtitle.
 * @param rows - Aggregated rows produced by `buildExportRows`.
 * @returns The encoded .xlsx file as a Node `Buffer`.
 */
export async function buildExcelWorkbook(meta: WorkbookMeta, rows: ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FairPOS';
  wb.created = new Date(2026, 5, 24); // deterministic for tests — overwritten at production read

  const sheet = wb.addWorksheet(meta.sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  // ── Header banner ─────────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = meta.title;
  titleCell.font = { bold: true, size: 13 };

  sheet.mergeCells(2, 1, 2, COLUMNS.length);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = meta.subtitle;
  subtitleCell.font = { italic: true, color: { argb: 'FF666666' } };

  // ── Column setup (no `header` field — that would auto-write to row 1) ─────
  sheet.columns = COLUMNS.map((c) => ({
    key: c.key as string,
    width: c.width,
  }));
  // Manually populate the header row at row 3 so the title banner above stays intact.
  const headerRow = sheet.getRow(3);
  COLUMNS.forEach((c, i) => { headerRow.getCell(i + 1).value = c.header; });
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };

  // Body rows
  for (const r of rows) {
    const date = new Date(r.created_at);
    const datePart = date.toLocaleDateString('de-DE');
    const timePart = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    sheet.addRow({
      receipt_number: r.receipt_number,
      date: datePart,
      time: timePart,
      table_name: r.table_name,
      ordering_user_name: r.ordering_user_name,
      register_name: r.register_name,
      article_name: r.article_name,
      quantity: r.quantity,
      unit_price: r.unit_price,
      unit_deposit: r.unit_deposit,
      tax_rate: r.tax_rate,
      line_total: r.line_total,
    });
  }

  // Apply number formats and alignments on the body rows.
  COLUMNS.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    if (c.numFmt) col.numFmt = c.numFmt;
    if (c.align) col.alignment = { horizontal: c.align };
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
