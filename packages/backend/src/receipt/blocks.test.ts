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
    expect(text).toContain('Tisch 7 von 24.06.2026 10:11:00 bis 24.06.2026 12:00:00');
  });

  it('omits the table line for a Bonkasse walk-up sale (no table)', async () => {
    const text = allText(await buildReceiptBlocks(base));
    expect(text).not.toContain('Tisch');
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
});
