/** Unit tests for the shared receipt block builder — table/first-order line and the simplified TSE section (Task #116). */
import { describe, it, expect } from 'vitest';
import { buildReceiptBlocks } from './blocks.js';
import { buildDemoReceipt } from './demo.js';
import type { PrintBlock, TextBlock } from '../print/blocks.js';
import type { ReceiptData } from './types.js';

/** Collects the text of every `text`/`row` block, for substring assertions without caring about exact block boundaries. */
function allText(blocks: PrintBlock[]): string {
  return blocks
    .map((b) => (b.kind === 'text' ? b.text : b.kind === 'row' ? `${b.left} ${b.right}` : ''))
    .join('\n');
}

function textBlocks(blocks: PrintBlock[]): TextBlock[] {
  return blocks.filter((b): b is TextBlock => b.kind === 'text');
}

describe('buildReceiptBlocks', () => {
  const base = buildDemoReceipt(new Date(2026, 5, 24, 12, 0, 0));

  it('prints the table + first-order line for a Bedienungskasse receipt', async () => {
    const data: ReceiptData = {
      ...base,
      tableName: '7',
      firstOrderTime: new Date(2026, 5, 24, 10, 11, 0),
    };
    const text = allText(await buildReceiptBlocks(data));
    expect(text).toContain('Tisch 7 von 24.06.2026 10:11 bis 24.06.2026 12:00');
  });

  it('omits the table line for a Bonkasse walk-up sale (no table)', async () => {
    const text = allText(await buildReceiptBlocks(base));
    expect(text).not.toContain('Tisch');
  });

  it('prints the table line in the last section, after the final separator — not right after the positions (Nutzervorgabe 2026-09-06)', async () => {
    const data: ReceiptData = {
      ...base,
      tableName: '7',
      firstOrderTime: new Date(2026, 5, 24, 10, 11, 0),
    };
    const blocks = await buildReceiptBlocks(data);
    const lastHrIndex = blocks.map((b) => b.kind).lastIndexOf('hr');
    const tableLineIndex = blocks.findIndex((b) => b.kind === 'text' && b.text.startsWith('Tisch '));
    const serialIndex = blocks.findIndex((b) => b.kind === 'text' && b.text.startsWith('Kassensystem-Seriennr.'));
    expect(tableLineIndex).toBeGreaterThan(lastHrIndex);
    expect(tableLineIndex).toBeLessThan(serialIndex);
  });

  it('shows the TSE-error hint when unsigned', async () => {
    const blocks = await buildReceiptBlocks({ ...base, tseSignature: null });
    expect(textBlocks(blocks).some((b) => b.text === '! TSE Fehler !')).toBe(true);
  });

  it('omits the TSE-error hint and the removed plaintext TSE fields when signed', async () => {
    const blocks = await buildReceiptBlocks({
      ...base,
      tseTransactionNumber: 58,
      tseSignatureCounter: 430,
      tseSignature: 'aabbcc',
      tseStartTime: new Date(2026, 5, 24, 12, 0, 0),
      tseEndTime: new Date(2026, 5, 24, 12, 0, 0),
    });
    const text = allText(blocks);
    expect(text).not.toContain('TSE Fehler');
    expect(text).not.toContain('Transaktionsnr.');
    expect(text).not.toContain('Signaturzähler');
    expect(text).not.toContain('Start:');
    expect(text).not.toContain('Ende:');
    expect(text).not.toContain('Signatur:');
    expect(text).not.toContain('TSE-Seriennr.');
  });

  it('always prints the Kassensystem-Seriennr., regardless of TSE signing status', async () => {
    const signed = allText(await buildReceiptBlocks({ ...base, tseSignature: 'aabbcc' }));
    const unsigned = allText(await buildReceiptBlocks({ ...base, tseSignature: null }));
    expect(signed).toContain(`Kassensystem-Seriennr.: ${base.systemSerial}`);
    expect(unsigned).toContain(`Kassensystem-Seriennr.: ${base.systemSerial}`);
  });

  describe('Kennbuchstaben (Task #115)', () => {
    it('prints the category letter next to each position', async () => {
      const blocks = await buildReceiptBlocks(base);
      const rows = blocks.filter((b): b is Extract<PrintBlock, { kind: 'row' }> => b.kind === 'row');
      const bier = rows.find((r) => r.left.includes('Bier 0,5l'))!;
      const flasche = rows.find((r) => r.left.includes('Flasche zurück'))!;
      expect(bier.right).toMatch(/ B$/); // reduced
      expect(flasche.right).toMatch(/ A$/); // standard
    });

    it('gives the deposit (Pfand) its own row and letter, separate from the article — Regelsteuersatz regardless of the article\'s own category (D-060/Nutzervorgabe 2026-09-06)', async () => {
      const blocks = await buildReceiptBlocks(base);
      const rows = blocks.filter((b): b is Extract<PrintBlock, { kind: 'row' }> => b.kind === 'row');
      // base's "Bier 0,5l": quantity 3, unitPrice 4.50 (reduced/B), unitDeposit 2.00 (always standard/A).
      const bier = rows.find((r) => r.left.includes('Bier 0,5l'))!;
      const pfand = rows.find((r) => r.left === '3x Pfand')!;
      expect(bier.right).toBe('13,50 B'); // article-only total (3 × 4,50) — no longer includes the deposit
      expect(pfand.right).toBe('6,00 A'); // deposit-only total (3 × 2,00), always standard rate
    });

    it('prints the matching category letter next to the corresponding VAT-breakdown row', async () => {
      const blocks = await buildReceiptBlocks(base);
      const rows = blocks.filter((b): b is Extract<PrintBlock, { kind: 'row' }> => b.kind === 'row');
      const reducedRow = rows.find((r) => r.left.startsWith('MwSt 7'))!;
      const standardRow = rows.find((r) => r.left.startsWith('MwSt 19'))!;
      expect(reducedRow.left).toBe('MwSt 7 % B');
      expect(standardRow.left).toBe('MwSt 19 % A');
    });
  });

  describe('Trainingskasse marker (Task #130)', () => {
    it('prints "T R A I N I N G" right after the logo/before the company name, and again as the very last line', async () => {
      const blocks = await buildReceiptBlocks({ ...base, isTraining: true });
      const markers = blocks
        .map((b, i) => ({ i, b }))
        .filter(({ b }) => b.kind === 'text' && b.text === 'T R A I N I N G');
      expect(markers).toHaveLength(2);
      const companyNameIndex = blocks.findIndex((b) => b.kind === 'text' && b.text === base.companyName);
      expect(markers[0]!.i).toBeLessThan(companyNameIndex);
      expect(markers[1]!.i).toBe(blocks.length - 1);
    });

    it('omits the training marker entirely for a normal (non-training) receipt', async () => {
      const text = allText(await buildReceiptBlocks(base));
      expect(text).not.toContain('T R A I N I N G');
    });

    it('shows both STORNOBELEG and the training marker for a training-register Bonstorno', async () => {
      const blocks = await buildReceiptBlocks({ ...base, isCancellation: true, isTraining: true });
      const text = allText(blocks);
      expect(text).toContain('STORNOBELEG');
      expect(text).toContain('T R A I N I N G');
    });
  });
});
