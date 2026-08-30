/** End-to-end test for the PDF renderer using the demo receipt. */
import { describe, it, expect } from 'vitest';
import { renderReceiptPdf } from './pdf.js';
import { buildDemoReceipt } from './demo.js';

describe('renderReceiptPdf', () => {
  it('renders the demo receipt to a valid PDF buffer', async () => {
    const pdf = await renderReceiptPdf(buildDemoReceipt(new Date(2026, 5, 24, 12, 0, 0)));

    // PDF file signature is "%PDF-".
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // EOF marker — "%%EOF" should appear near the end of the file.
    const tail = pdf.subarray(pdf.length - 100).toString('ascii');
    expect(tail).toContain('%%EOF');

    // Sanity: a non-trivial PDF size (we embed text, table, totals and a QR PNG).
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('produces different PDFs for different receipt numbers', async () => {
    const ts = new Date(2026, 5, 24, 12, 0, 0);
    const a = await renderReceiptPdf({ ...buildDemoReceipt(ts), receiptNumber: 'RE-00001' });
    const b = await renderReceiptPdf({ ...buildDemoReceipt(ts), receiptNumber: 'RE-99999' });
    expect(a.equals(b)).toBe(false);
  });
});
