/** End-to-end test for the Excel workbook builder. Verifies the produced bytes are a valid XLSX. */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildExcelWorkbook } from './workbook.js';
import type { ExportRow } from './rows.js';

const sampleRows: ExportRow[] = [
  {
    receipt_number: 'POS-00042', closing_z_number: 3,
    created_at: new Date(2026, 5, 24, 18, 30, 0).toISOString(),
    table_name: 'A1', ordering_user_name: 'Anna', register_name: 'Theke',
    article_name: 'Bier', article_category_name: 'Getränke',
    quantity: 3, unit_price: 4.5, unit_deposit: 2, tax_rate: 7, deposit_tax_rate: 19, line_total: 19.5,
    is_cancellation: false,
  },
  {
    receipt_number: 'POS-00042', closing_z_number: null,
    created_at: new Date(2026, 5, 24, 18, 30, 0).toISOString(),
    table_name: 'A1', ordering_user_name: 'Anna', register_name: 'Theke',
    article_name: 'Brezel', article_category_name: 'Snacks',
    quantity: 1, unit_price: 2.5, unit_deposit: null, tax_rate: 7, deposit_tax_rate: null, line_total: 2.5,
    is_cancellation: false,
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
    const headers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((col) => sheet.getCell(3, col).value);
    expect(headers).toEqual([
      'Belegnummer', 'Storno', 'Tagesabschluss', 'Datum', 'Uhrzeit', 'Tisch', 'Besteller', 'Kasse',
      'Artikelname', 'Artikelgruppe', 'Menge', 'Einzelpreis', 'USt. Artikel', 'Pfandbetrag', 'USt. Pfand', 'Gesamtbetrag',
    ]);
  });

  it('writes one data row per input row starting at row 4', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'X', title: 'T', subtitle: 'S' }, sampleRows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    // Row 4 — first data row
    expect(sheet.getCell(4, 1).value).toBe('POS-00042'); // Belegnummer (prefix + padded sequence)
    expect(sheet.getCell(4, 9).value).toBe('Bier');      // Artikelname
    expect(sheet.getCell(4, 10).value).toBe('Getränke'); // Artikelgruppe
    expect(sheet.getCell(4, 11).value).toBe(3);          // Menge
    expect(sheet.getCell(4, 13).value).toBe(7);          // USt. Artikel
    expect(sheet.getCell(4, 14).value).toBe(2);          // Pfandbetrag
    expect(sheet.getCell(4, 15).value).toBe(19);         // USt. Pfand
    expect(sheet.getCell(4, 16).value).toBe(19.5);       // Gesamtbetrag
    // Row 5 — second data row (no deposit — Pfandbetrag/USt. Pfand stay empty, not "0,00 €")
    expect(sheet.getCell(5, 9).value).toBe('Brezel');
    expect(sheet.getCell(5, 10).value).toBe('Snacks');
    expect(sheet.getCell(5, 11).value).toBe(1);
    expect(sheet.getCell(5, 14).value).toBeNull();
    expect(sheet.getCell(5, 15).value).toBeNull();
  });

  it('leaves the Storno column blank for a normal sale and writes "ja" for a Bonstorno row, never "nein" (Task #138)', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'X', title: 'T', subtitle: 'S' }, [
      ...sampleRows,
      {
        receipt_number: 'POS-00043', closing_z_number: null,
        created_at: new Date(2026, 5, 24, 19, 0, 0).toISOString(),
        table_name: '', ordering_user_name: 'Admin', register_name: 'Theke',
        article_name: 'Bier', article_category_name: 'Getränke',
        quantity: -2, unit_price: -4.5, unit_deposit: null, tax_rate: 7,
        deposit_tax_rate: null, line_total: -9, is_cancellation: true,
      },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getCell(4, 2).value).toBe(''); // Bier, normal sale
    expect(sheet.getCell(5, 2).value).toBe(''); // Brezel, normal sale
    expect(sheet.getCell(6, 2).value).toBe('ja'); // Bonstorno row
    expect(sheet.getCell(6, 11).value).toBe(-2); // Menge negativ
  });

  it('shows the Z-Bon number for a closed invoice and leaves the cell blank while not yet closed (Task #142)', async () => {
    const buf = await buildExcelWorkbook({ sheetName: 'X', title: 'T', subtitle: 'S' }, sampleRows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getCell(4, 3).value).toBe(3);       // Bier — closing_z_number: 3
    expect(sheet.getCell(5, 3).value).toBeNull();    // Brezel — not yet closed
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
