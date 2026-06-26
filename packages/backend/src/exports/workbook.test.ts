/** End-to-end test for the Excel workbook builder. Verifies the produced bytes are a valid XLSX. */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcelWorkbook } from './workbook.js';
import type { ExportRow } from './rows.js';

const sampleRows: ExportRow[] = [
  {
    receipt_number: 42,
    created_at: new Date(2026, 5, 24, 18, 30, 0).toISOString(),
    table_name: 'A1', ordering_user_name: 'Anna', register_name: 'Theke',
    article_name: 'Bier', quantity: 3, unit_price: 4.5, unit_deposit: 2, tax_rate: 19, line_total: 19.5,
  },
  {
    receipt_number: 42,
    created_at: new Date(2026, 5, 24, 18, 30, 0).toISOString(),
    table_name: 'A1', ordering_user_name: 'Anna', register_name: 'Theke',
    article_name: 'Brezel', quantity: 1, unit_price: 2.5, unit_deposit: 0, tax_rate: 7, line_total: 2.5,
  },
];

describe('buildExcelWorkbook', () => {
  it('produces a buffer that starts with the ZIP/XLSX magic bytes (PK\\x03\\x04)', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'Test', title: 'T', subtitle: 'S' }, sampleRows);
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  });

  it('round-trips through ExcelJS and preserves the header banner + sheet name', async () => {
    const buf = await buildExcelWorkbook(
      { sheetName: 'Tag 24.06.2026', title: 'Tagesexport', subtitle: '24.06.2026' },
      sampleRows,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets).toHaveLength(1);
    const sheet = wb.worksheets[0]!;
    expect(sheet.name).toBe('Tag 24.06.2026');
    expect(sheet.getCell(1, 1).value).toBe('Tagesexport');
    expect(sheet.getCell(2, 1).value).toBe('24.06.2026');
  });

  it('writes header text in row 3 with the documented column titles', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'X', title: 'T', subtitle: 'S' }, sampleRows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    const headers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((col) => sheet.getCell(3, col).value);
    expect(headers).toEqual([
      'Belegnummer', 'Datum', 'Uhrzeit', 'Tisch', 'Besteller', 'Kasse',
      'Artikelname', 'Menge', 'Einzelpreis', 'Pfandbetrag', 'Umsatzsteuersatz', 'Gesamtbetrag',
    ]);
  });

  it('writes one data row per input row starting at row 4', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'X', title: 'T', subtitle: 'S' }, sampleRows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    // Row 4 — first data row
    expect(sheet.getCell(4, 1).value).toBe(42);          // Belegnummer
    expect(sheet.getCell(4, 7).value).toBe('Bier');      // Artikelname
    expect(sheet.getCell(4, 8).value).toBe(3);           // Menge
    expect(sheet.getCell(4, 12).value).toBe(19.5);       // Gesamtbetrag
    // Row 5 — second data row
    expect(sheet.getCell(5, 7).value).toBe('Brezel');
    expect(sheet.getCell(5, 8).value).toBe(1);
  });

  it('produces an empty body for zero input rows but still has the header', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'X', title: 'T', subtitle: 'S' }, []);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getCell(3, 1).value).toBe('Belegnummer');
    expect(sheet.getCell(4, 1).value).toBeNull();
  });

  it('truncates oversized sheet names to Excel\'s 31-character limit', async () => {
    const long = 'X'.repeat(80);
    const buf = await buildExcelWorkbook({ sheetName: long, title: 'T', subtitle: 'S' }, sampleRows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.name.length).toBeLessThanOrEqual(31);
  });
});
