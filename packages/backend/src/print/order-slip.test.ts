/** Tests for the kitchen-/bar-order-slip ESC/POS renderer and the routing helper. */
import { describe, it, expect } from 'vitest';
import {
  bucketItemsByPrinter, buildOrderSlipBlocks,
  buildPickupSlipBlocks, buildDepositSlipBlocks,
  type OrderSlipItem,
} from './order-slip.js';
import { renderBlocksToEscPos } from './blocks.js';

/** Renders straight through the shared block model, same as every production call site. */
const buildOrderSlipEscPos = (...args: Parameters<typeof buildOrderSlipBlocks>): Buffer =>
  renderBlocksToEscPos(buildOrderSlipBlocks(...args));
const buildPickupSlipEscPos = (...args: Parameters<typeof buildPickupSlipBlocks>): Buffer =>
  renderBlocksToEscPos(buildPickupSlipBlocks(...args));
const buildDepositSlipEscPos = (...args: Parameters<typeof buildDepositSlipBlocks>): Buffer =>
  renderBlocksToEscPos(buildDepositSlipBlocks(...args));

const item = (overrides: Partial<OrderSlipItem> = {}): OrderSlipItem => ({
  name: 'Bier',
  options: null,
  printer_id: 'p-bar',
  category_name: 'Getränke',
  ...overrides,
});

describe('bucketItemsByPrinter', () => {
  it('returns an empty list for no items', () => {
    expect(bucketItemsByPrinter([], 'p-default')).toEqual([]);
  });

  it('groups items targeting the same printer and same category', () => {
    const buckets = bucketItemsByPrinter([item(), item(), item({ name: 'Pommes', printer_id: 'p-kitchen', category_name: 'Speisen' })], 'p-default');
    expect(buckets).toHaveLength(2);
    const bar = buckets.find((b) => b.printer_id === 'p-bar')!;
    expect(bar.lines[0]!.quantity).toBe(2);
  });

  it('splits the same printer into separate buckets per Artikelgruppe', () => {
    // Two categories share one kitchen printer — the kitchen still wants
    // physically separate slips so Speisen and Snacks aren't mixed up.
    const buckets = bucketItemsByPrinter([
      item({ name: 'Schnitzel', printer_id: 'p-kitchen', category_name: 'Speisen' }),
      item({ name: 'Pommes',    printer_id: 'p-kitchen', category_name: 'Snacks'  }),
      item({ name: 'Pommes',    printer_id: 'p-kitchen', category_name: 'Snacks'  }),
    ], 'p-default');
    expect(buckets).toHaveLength(2);
    const speisen = buckets.find((b) => b.category_name === 'Speisen')!;
    const snacks  = buckets.find((b) => b.category_name === 'Snacks')!;
    expect(speisen.printer_id).toBe('p-kitchen');
    expect(snacks.printer_id).toBe('p-kitchen');
    expect(speisen.lines[0]!.name).toBe('Schnitzel');
    expect(snacks.lines[0]!.quantity).toBe(2);
  });

  it('routes items without a printer to the default', () => {
    const buckets = bucketItemsByPrinter([item({ printer_id: null })], 'p-default');
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.printer_id).toBe('p-default');
  });

  it('keeps null bucket when no default is configured', () => {
    const buckets = bucketItemsByPrinter([item({ printer_id: null })], null);
    expect(buckets[0]!.printer_id).toBe(null);
  });

  it('merges identical (name, options) tuples into one line with a quantity', () => {
    const buckets = bucketItemsByPrinter([
      item({ name: 'Pommes', options: 'mit Ketchup' }),
      item({ name: 'Pommes', options: 'mit Ketchup' }),
      item({ name: 'Pommes', options: 'mit Mayo' }),
    ], 'p-default');
    const lines = buckets[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.options === 'mit Ketchup')!.quantity).toBe(2);
    expect(lines.find((l) => l.options === 'mit Mayo')!.quantity).toBe(1);
  });

  it('preserves first-occurrence order across lines', () => {
    const buckets = bucketItemsByPrinter([
      item({ name: 'Pommes' }),
      item({ name: 'Bier' }),
      item({ name: 'Pommes' }),
    ], 'p-default');
    expect(buckets[0]!.lines.map((l) => l.name)).toEqual(['Pommes', 'Bier']);
  });
});

describe('buildOrderSlipEscPos', () => {
  const ctx = { tableName: 'A5', serverName: 'Anna', createdAt: new Date(2026, 5, 24, 18, 30, 0) };

  it('starts with ESC @ initialise and ends with GS V 0 cut', () => {
    const buf = buildOrderSlipEscPos(
      { printer_id: 'p', category_name: 'Getränke', lines: [{ name: 'Bier', options: null, quantity: 2 }] },
      ctx,
    );
    expect(buf[0]).toBe(0x1b); expect(buf[1]).toBe(0x40);
    const tail = buf.subarray(buf.length - 3);
    expect(tail[0]).toBe(0x1d); expect(tail[1]).toBe(0x56); expect(tail[2]).toBe(0x00);
  });

  it('contains table name, server name and timestamp', () => {
    const ascii = buildOrderSlipEscPos(
      { printer_id: 'p', category_name: 'Getränke', lines: [{ name: 'Bier', options: null, quantity: 1 }] },
      ctx,
    ).toString('ascii');
    expect(ascii).toContain('Tisch A5');
    expect(ascii).toContain('Anna');
    expect(ascii).toContain('24.06.2026 18:30:00');
  });

  it('renders quantity x name lines for each entry', () => {
    const ascii = buildOrderSlipEscPos(
      { printer_id: 'p', category_name: 'Getränke', lines: [{ name: 'Bier', options: null, quantity: 3 }, { name: 'Pommes', options: null, quantity: 1 }] },
      ctx,
    ).toString('ascii');
    expect(ascii).toContain('3x Bier');
    expect(ascii).toContain('1x Pommes');
  });

  it('renders option lines indented under their parent', () => {
    const ascii = buildOrderSlipEscPos(
      { printer_id: 'p', category_name: 'Getränke', lines: [{ name: 'Pommes', options: 'mit Ketchup', quantity: 1 }] },
      ctx,
    ).toString('ascii');
    expect(ascii).toContain('1x Pommes');
    expect(ascii).toContain('-> mit Ketchup');
  });

  it('encodes umlauts as CP858 bytes (not as ASCII transliteration)', () => {
    const buf = buildOrderSlipEscPos(
      { printer_id: 'p', category_name: 'Getränke', lines: [{ name: 'Käsesemmel', options: 'mit Soße', quantity: 1 }] },
      ctx,
    );
    // CP858: ä=0x84, ö=0x94, ü=0x81, ß=0xe1
    expect(buf.includes(Buffer.from([0x4b, 0x84, 0x73, 0x65, 0x73, 0x65, 0x6d, 0x6d, 0x65, 0x6c]))).toBe(true); // "Käsesemmel"
    expect(buf.includes(Buffer.from([0x53, 0x6f, 0xe1, 0x65]))).toBe(true); // "Soße"
  });

  it('selects CP858 as code page at the start of the stream', () => {
    const buf = buildOrderSlipEscPos(
      { printer_id: 'p', category_name: 'Getränke', lines: [{ name: 'X', options: null, quantity: 1 }] },
      ctx,
    );
    expect(buf.subarray(0, 5).equals(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x13]))).toBe(true);
  });
});

describe('buildPickupSlipEscPos (Bonkasse self-pickup slip)', () => {
  const ctx = { registerName: 'Bonkasse 1', serverName: 'Tom', createdAt: new Date('2026-06-25T17:00:00Z') };

  it('emits a SELBSTABHOLER header and the article line with price', () => {
    const buf = buildPickupSlipEscPos({ name: 'Bier', priceEuros: 4, depositEuros: null }, ctx);
    expect(buf.includes('SELBSTABHOLER')).toBe(true);
    expect(buf.includes('1x Bier')).toBe(true);
    expect(buf.includes('4.00 ')).toBe(true);  // price is on the same line as the article
    expect(buf.includes('Pfand')).toBe(false);
  });

  it('appends a Pfand line right-aligned under the article price', () => {
    const buf = buildPickupSlipEscPos({ name: 'Bier', priceEuros: 4, depositEuros: 1.5 }, ctx);
    expect(buf.includes('+ Pfand')).toBe(true);
    // The euro sign is the CP858 0xd5 byte directly after the deposit amount.
    expect(buf.includes(Buffer.from([0x31, 0x2e, 0x35, 0x30, 0x20, 0xd5]))).toBe(true);
  });

  it('places timestamp / register / operator on one slash-separated footer line', () => {
    const buf = buildPickupSlipEscPos({ name: 'Bier', priceEuros: 4, depositEuros: null }, ctx);
    const dividerIdx = buf.lastIndexOf('-'.repeat(42));
    expect(dividerIdx).toBeGreaterThan(0);
    const footer = buf.subarray(dividerIdx);
    // Order: <Zeitstempel> / <Kasse> / <Bediener>, no leftover "Kasse:" label.
    expect(footer.includes(' / Bonkasse 1 / Tom')).toBe(true);
    expect(footer.includes('Kasse:')).toBe(false);
  });

  it('omits the Pfand line when depositEuros is zero or null', () => {
    expect(buildPickupSlipEscPos({ name: 'Bier', priceEuros: 4, depositEuros: 0 }, ctx).includes('Pfand')).toBe(false);
    expect(buildPickupSlipEscPos({ name: 'Bier', priceEuros: 4, depositEuros: null }, ctx).includes('Pfand')).toBe(false);
  });
});

describe('buildDepositSlipEscPos (Bonkasse separate Pfandbon)', () => {
  const ctx = { registerName: 'Bonkasse 1', serverName: 'Tom', createdAt: new Date('2026-06-25T17:00:00Z') };

  it('uses "1x Pfand" as the item line and shows the deposit amount', () => {
    const buf = buildDepositSlipEscPos({ depositEuros: 2 }, ctx);
    expect(buf.includes('PFAND')).toBe(true);
    expect(buf.includes('1x Pfand')).toBe(true);   // never the article name
    expect(buf.includes('2.00 ')).toBe(true);
  });
});
