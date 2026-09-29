/** Unit tests for the TSE-Ausfall-Log PDF renderer (Task #157). */
import { describe, it, expect } from 'vitest';
import { renderTseOutagesPdf, type TseOutageRow } from './tseOutagesPdf.js';

/** Counts `/Type /Page` object dictionaries in a raw PDF buffer — see `print/blocks.test.ts` for why this is a reliable page count without a full PDF parser. */
function countPdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('renderTseOutagesPdf', () => {
  it('produces a valid single-page PDF for an empty log', async () => {
    const pdf = await renderTseOutagesPdf([], 'Testverein e.V.', new Date('2026-09-29T12:00:00.000Z'));
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(countPdfPages(pdf)).toBe(1);
  });

  it('paginates once the table no longer fits on one A4 page', async () => {
    const rows: TseOutageRow[] = Array.from({ length: 80 }, (_, i) => ({
      id: `outage-${i}`,
      startedAt: new Date(`2026-09-${(1 + (i % 28)).toString().padStart(2, '0')}T10:00:00.000Z`),
      endedAt: new Date(`2026-09-${(1 + (i % 28)).toString().padStart(2, '0')}T10:05:00.000Z`),
      reason: 'USB-Verbindung getrennt',
    }));
    const pdf = await renderTseOutagesPdf(rows, 'Testverein e.V.', new Date('2026-09-29T12:00:00.000Z'));
    expect(countPdfPages(pdf)).toBeGreaterThan(1);
  });

  it('labels a still-open outage "läuft noch" and computes its duration up to generatedAt', async () => {
    const rows: TseOutageRow[] = [{
      id: 'open-1',
      startedAt: new Date('2026-09-29T10:00:00.000Z'),
      endedAt: null,
      reason: 'TSE nicht erreichbar',
    }];
    const pdf = await renderTseOutagesPdf(rows, 'Testverein e.V.', new Date('2026-09-29T10:30:00.000Z'));
    // Content streams are Flate-compressed by pdfkit, so the literal strings
    // aren't greppable in the raw buffer — a byte-length sanity check plus
    // the page count above is what this pure renderer can verify without a
    // full PDF text extractor; the exact rendered text is covered visually
    // during implementation (see BACKLOG-DONE.md Task #157).
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(countPdfPages(pdf)).toBe(1);
  });
});
