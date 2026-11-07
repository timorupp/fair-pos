/**
 * Builds print jobs for kitchen / bar order slips (Bestellbons) and the
 * self-pickup variants emitted by the Bonkasse.
 *
 * One slip is emitted per printer × Artikelgruppe. Within a slip, identical
 * positions (same article + same options) are merged into one line with a
 * quantity — except for articles flagged "Bestellbons nicht zusammenfassen"
 * (Task #161), which get one slip per ordered unit instead.
 *
 * Byte-level rendering goes through the shared block model (Task #105, see
 * `print/blocks.ts`) — callers build blocks here and render them via
 * `renderBlocksToEscPos`/`renderBlocksToPdf` themselves; the blocks are also
 * what gets persisted on the `print_job` row for the admin UI's PDF preview /
 * reprint.
 */

import type { CompanyLogo } from '../logo/logo.js';
import type { PrintBlock } from './blocks.js';

/** A single ordered unit destined for one printer. */
export interface OrderSlipItem {
  /** Display name as it should appear on the slip. */
  name: string;
  /** Selected product options (e.g. "mit Ketchup"); null if none. */
  options: string | null;
  /** Target printer id — `null` means "no specific printer; route to default". */
  printer_id: string | null;
  /** Article-category (Artikelgruppe) name. Used to split slips per category. */
  category_name: string;
  /**
   * `article.order_slip_per_unit` (Task #161) — this unit gets its own slip
   * ("Einzelbon", e.g. one per plate in the kitchen) instead of being merged
   * into the Sammelbon of its printer × category.
   */
  per_unit: boolean;
}

/** Result of grouping: one entry per slip — a (printer, category) Sammelbon or one Einzelbon. */
export interface OrderSlipBucket {
  printer_id: string | null;
  /** Article-category for this bucket; printed as a sub-header on the slip. */
  category_name: string;
  /** Aggregated lines, sorted by display order (article+options first appearance). */
  lines: { name: string; options: string | null; quantity: number }[];
  /** 1-based position of this slip among all slips of the order on the same printer (Task #161). */
  slip_number: number;
  /** Total number of slips of the order on the same printer — printed as "Bon x von y" (Task #161). */
  slip_count: number;
}

/**
 * Buckets items by `(printer, category)` and merges identical lines per bucket.
 *
 * Per the Anforderungen (Bedienungskasse): each printer × Artikelgruppe combo
 * gets its own slip. So if two categories ("Speisen", "Snacks") happen to
 * share a kitchen printer, the kitchen still receives two physically separate
 * receipts — easier to dispatch and to keep work areas separated.
 *
 * Routing fallback: items with `printer_id === null` go to `defaultPrinterId`.
 * If that is also null, the item ends up in a bucket keyed by `null` so the
 * caller can decide (typically: warn the operator that nothing was printed).
 *
 * Within each bucket, identical `(name, options)` rows merge into one line
 * with a `quantity`. Items flagged `per_unit` (Task #161) never merge: each
 * gets its own bucket (Einzelbon), so every unit is on exactly one slip —
 * never on a Sammelbon and an Einzelbon at once.
 *
 * Finally every bucket is numbered among all buckets of the same printer
 * (`slip_number`/`slip_count`), so the station can tell whether all slips
 * of an order have arrived.
 *
 * @param items - The flat list of one-unit-per-row order items.
 * @param defaultPrinterId - System-default printer id, or `null` when none configured.
 * @returns One bucket per distinct `(printer, category)` plus one per
 *   `per_unit` item, in first-appearance order, numbered per printer.
 */
export function bucketItemsByPrinter(items: OrderSlipItem[], defaultPrinterId: string | null): OrderSlipBucket[] {
  const buckets: OrderSlipBucket[] = [];
  const sammelbonByKey = new Map<string, OrderSlipBucket>();
  for (const item of items) {
    const printerId = item.printer_id ?? defaultPrinterId;
    const line = { name: item.name, options: item.options, quantity: 1 };
    if (item.per_unit) {
      buckets.push({ printer_id: printerId, category_name: item.category_name, lines: [line], slip_number: 0, slip_count: 0 });
      continue;
    }
    // Use a delimiter that can't appear in either field; the printer id is a
    // UUID and the category is a free-text DB column without ``.
    const key = `${printerId ?? ''}${item.category_name}`;
    let bucket = sammelbonByKey.get(key);
    if (!bucket) {
      bucket = { printer_id: printerId, category_name: item.category_name, lines: [], slip_number: 0, slip_count: 0 };
      sammelbonByKey.set(key, bucket);
      buckets.push(bucket);
    }
    const existing = bucket.lines.find((l) => l.name === item.name && (l.options ?? '') === (item.options ?? ''));
    if (existing) existing.quantity += 1;
    else bucket.lines.push(line);
  }

  const countByPrinter = new Map<string | null, number>();
  for (const bucket of buckets) {
    const n = (countByPrinter.get(bucket.printer_id) ?? 0) + 1;
    countByPrinter.set(bucket.printer_id, n);
    bucket.slip_number = n;
  }
  for (const bucket of buckets) bucket.slip_count = countByPrinter.get(bucket.printer_id)!;
  return buckets;
}

/** Pushes a centred image block for the given logo, if configured. */
function logoBlock(logo: CompanyLogo | null): PrintBlock[] {
  if (!logo) return [];
  return [{
    kind: 'image',
    pngBase64: logo.pdfPng.toString('base64'), pngWidth: logo.pdfWidth, pngHeight: logo.pdfHeight,
    escposRasterBase64: logo.escposBytes.toString('base64'), widthFactor: logo.pdfWidthFactor,
  }];
}

/**
 * Training marker for slips printed at a training register (D-085) — same
 * "T R A I N I N G" line as the receipt (`receipt/blocks.ts`, Task #130), so
 * a slip printed while practising can never be mistaken for, or redeemed as,
 * a real one.
 *
 * @param isTraining - Whether the slip comes from a training register.
 * @returns The marker block, or nothing for a regular register.
 */
function trainingMarker(isTraining: boolean): PrintBlock[] {
  return isTraining
    ? [{ kind: 'text', text: 'T R A I N I N G', align: 'center', bold: true, size: 'xlarge' }]
    : [];
}

/**
 * Builds the block list for one printer's bucket (kitchen/bar order slip).
 *
 * @param bucket - The aggregated lines for one printer (from `bucketItemsByPrinter`).
 * @param context - Additional info printed at the top (table, server, time),
 *   plus whether the register is a training register (D-085: marker at top
 *   and bottom).
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit.
 * @returns Blocks in print order, ready for either renderer.
 */
export function buildOrderSlipBlocks(
  bucket: OrderSlipBucket,
  context: { tableName: string; serverName: string; createdAt: Date; isTraining: boolean },
  logo: CompanyLogo | null = null,
): PrintBlock[] {
  const blocks: PrintBlock[] = [...logoBlock(logo), ...trainingMarker(context.isTraining)];

  // Header is the table identifier, extra-large so it's readable across the
  // kitchen/bar. The Artikelgruppe (category) sits as a smaller sub-header
  // below; since each slip carries exactly one category, the kitchen sees at
  // a glance which station the order belongs to.
  blocks.push({ kind: 'text', text: `Tisch ${context.tableName}`, align: 'center', bold: true, size: 'xlarge' });
  blocks.push({ kind: 'text', text: bucket.category_name, align: 'center', bold: true, size: 'large' });
  // Task #161: lets the station check that every slip of this order has
  // arrived — counted over all slips of the order on this printer.
  blocks.push({ kind: 'text', text: `Bon ${bucket.slip_number} von ${bucket.slip_count}`, align: 'center' });
  blocks.push({ kind: 'hr' });

  for (const line of bucket.lines) {
    blocks.push({ kind: 'text', text: `${line.quantity}x ${line.name}`, size: 'large' });
    if (line.options) blocks.push({ kind: 'text', text: `  -> ${line.options}` });
  }

  // Footer: timestamp + operator on one line, slash-separated to save paper.
  blocks.push({ kind: 'hr' });
  blocks.push({ kind: 'text', text: `${formatGermanDateTime(context.createdAt)} / ${context.serverName}` });
  blocks.push(...trainingMarker(context.isTraining));

  return blocks;
}

/**
 * Builds the block list for a single Bonkasse "Selbstabholerbon" (one
 * article-unit per slip, optionally with a deposit line if the article has a
 * deposit AND the article is configured so that deposit and article share a
 * slip).
 *
 * Use this when `article.print_deposit_receipt === false` for an article with
 * a non-zero deposit_price, or when there is no deposit at all. For articles
 * with `print_deposit_receipt === true` AND a non-zero deposit, call
 * `buildDepositSlipBlocks` in addition to emit a second slip just for the
 * deposit.
 *
 * @param item - Article info. `priceEuros` is the per-unit gross article
 *   price; `depositEuros` is the per-unit deposit (null/0 → no Pfand line).
 * @param context - Footer metadata (register name, server name, timestamp),
 *   plus whether the register is a training register (D-085: marker at top
 *   and bottom).
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit.
 * @returns Blocks in print order, ready for either renderer.
 */
export function buildPickupSlipBlocks(
  item: { name: string; priceEuros: number; depositEuros: number | null },
  context: { registerName: string; serverName: string; createdAt: Date; isTraining: boolean },
  logo: CompanyLogo | null = null,
): PrintBlock[] {
  const blocks: PrintBlock[] = [...logoBlock(logo), ...trainingMarker(context.isTraining)];

  // A 0-€-article with a negative deposit is unmistakably a pure Pfandrückgabe
  // (Task #114) — "W E R T B O N" would be misleading (nothing is being
  // picked up), so the header calls it what it is.
  const isPureReturn = item.priceEuros === 0 && item.depositEuros !== null && item.depositEuros < 0;
  blocks.push({
    kind: 'text', text: isPureReturn ? 'PFANDRÜCKGABE' : 'W E R T B O N',
    align: 'center', bold: true, size: 'xlarge',
  });
  blocks.push({ kind: 'hr' });

  blocks.push({ kind: 'row', left: `1x ${item.name}`, right: `${formatEuros(item.priceEuros)} €`, size: 'large' });
  // `!== 0` (not `> 0`) so a Pfandrückgabe (negative deposit) still shows a
  // line instead of being silently dropped (Task #114). Wording is
  // sign-aware: "+ Pfand" for a charge, "Pfand-Rückgabe" (absolute amount,
  // no confusing double-minus) for a refund.
  if (item.depositEuros !== null && item.depositEuros !== 0) {
    const label = item.depositEuros > 0 ? '  + Pfand' : '  Pfand-Rückgabe';
    blocks.push({ kind: 'row', left: label, right: `${formatEuros(Math.abs(item.depositEuros))} €` });
  }

  // Footer: timestamp + register + operator on one line, slash-separated to
  // save paper. The register identifier sits in the middle so a returned slip
  // can still be routed to the right Bonstorno entry.
  blocks.push({ kind: 'hr' });
  blocks.push({
    kind: 'text',
    text: `${formatGermanDateTime(context.createdAt)} / ${context.registerName} / ${context.serverName}`,
  });
  blocks.push(...trainingMarker(context.isTraining));

  return blocks;
}

/**
 * Builds the block list for a standalone "Pfandbon" for one article-unit.
 * Used when the article's `print_deposit_receipt` flag is true so the
 * customer receives an article slip AND a separate deposit slip — useful
 * because the deposit is redeemed at a different counter than the article
 * pickup.
 *
 * The slip intentionally does NOT carry the article name; the deposit counter
 * just needs to see how much money to hand back, and printing "Pfand" instead
 * of the article keeps the bon unambiguous as a refund voucher.
 *
 * @param item - Per-unit deposit amount in euros.
 * @param context - Footer metadata (register name, server name, timestamp),
 *   plus whether the register is a training register (D-085: marker at top
 *   and bottom).
 * @param logo - Optional logo (both target-format variants pre-rendered), or `null` to omit.
 * @returns Blocks in print order, ready for either renderer.
 */
export function buildDepositSlipBlocks(
  item: { depositEuros: number },
  context: { registerName: string; serverName: string; createdAt: Date; isTraining: boolean },
  logo: CompanyLogo | null = null,
): PrintBlock[] {
  const blocks: PrintBlock[] = [...logoBlock(logo), ...trainingMarker(context.isTraining)];
  const isReturn = item.depositEuros < 0;
  blocks.push({
    kind: 'text', text: isReturn ? 'PFANDRÜCKGABE' : 'PFAND',
    align: 'center', bold: true, size: 'xlarge',
  });
  blocks.push({ kind: 'hr' });
  blocks.push({
    kind: 'row', left: isReturn ? '1x Pfand-Rückgabe' : '1x Pfand',
    right: `${formatEuros(Math.abs(item.depositEuros))} €`, size: 'large',
  });

  blocks.push({ kind: 'hr' });
  blocks.push({
    kind: 'text',
    text: `${formatGermanDateTime(context.createdAt)} / ${context.registerName} / ${context.serverName}`,
  });
  blocks.push(...trainingMarker(context.isTraining));

  return blocks;
}

/** Formats a euro amount with the German thousand-grouping convention. Kept as its own local helper — this document type has always used a plain period-decimal format, unlike the comma-decimal used elsewhere; not unified further, that's a wording choice outside Task #105's scope. */
function formatEuros(value: number): string {
  return value.toFixed(2);
}

/** German-formatted "DD.MM.YYYY HH:MM:SS". Inline to keep this module self-contained. */
function formatGermanDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
