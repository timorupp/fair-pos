/**
 * Builds ESC/POS payloads for kitchen / bar order slips (Bestellbons) and the
 * self-pickup variants emitted by the Bonkasse.
 *
 * One slip is emitted per printer. Within a slip, identical positions
 * (same article + same options) are merged into one line with a quantity.
 * Text is encoded as CP858 so German umlauts and the Euro sign print correctly.
 */

import { SELECT_CP858, escposLine as line, twoColumn } from './escpos-encoding.js';

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// `ESC @` resets the printer; `SELECT_CP858` switches to a code page with
// German umlauts + € so we don't need to transliterate.
const INIT      = Buffer.concat([Buffer.from([ESC, 0x40]), SELECT_CP858]);
const CUT       = Buffer.from([GS, 0x56, 0x00]);
const FEED3     = Buffer.from([LF, LF, LF]);
const ALIGN_CTR = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LFT = Buffer.from([ESC, 0x61, 0x00]);
const BOLD_ON   = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF  = Buffer.from([ESC, 0x45, 0x00]);

/** ESC ! n — print mode; bit 4 = double height, bit 5 = double width. */
function selectMode(mode: number): Buffer {
  return Buffer.from([ESC, 0x21, mode]);
}

/**
 * GS ! n — set character size by scaling factor. Low nibble = width 0–7
 * (= 1×–8×), high nibble = height 0–7. Used when ESC ! is not enough; e.g.
 * 0x22 prints text at 3× width × 3× height (one notch above the ESC !
 * "double everything" mode 0x30 = 2×2).
 */
function selectSize(scale: number): Buffer {
  return Buffer.from([GS, 0x21, scale]);
}
const RESET_SIZE = Buffer.from([GS, 0x21, 0x00]);

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
}

/** Result of grouping: one entry per (printer, category) combination. */
export interface OrderSlipBucket {
  printer_id: string | null;
  /** Article-category for this bucket; printed as a sub-header on the slip. */
  category_name: string;
  /** Aggregated lines, sorted by display order (article+options first appearance). */
  lines: { name: string; options: string | null; quantity: number }[];
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
 * with a `quantity`.
 *
 * @param items - The flat list of one-unit-per-row order items.
 * @param defaultPrinterId - System-default printer id, or `null` when none configured.
 * @returns One bucket per distinct `(printer, category)`; lines aggregated.
 */
export function bucketItemsByPrinter(items: OrderSlipItem[], defaultPrinterId: string | null): OrderSlipBucket[] {
  const buckets = new Map<string, OrderSlipBucket>();
  for (const item of items) {
    const printerId = item.printer_id ?? defaultPrinterId;
    // Use a delimiter that can't appear in either field; the printer id is a
    // UUID and the category is a free-text DB column without ``.
    const key = `${printerId ?? ''}${item.category_name}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { printer_id: printerId, category_name: item.category_name, lines: [] };
      buckets.set(key, bucket);
    }
    const existing = bucket.lines.find((l) => l.name === item.name && (l.options ?? '') === (item.options ?? ''));
    if (existing) existing.quantity += 1;
    else bucket.lines.push({ name: item.name, options: item.options, quantity: 1 });
  }
  return [...buckets.values()];
}

/**
 * Renders one printer's bucket as a complete ESC/POS slip.
 *
 * @param bucket - The aggregated lines for one printer (from `bucketItemsByPrinter`).
 * @param context - Additional info printed at the top (table, server, time).
 * @returns Raw bytes ready to enqueue as a print job.
 */
export function buildOrderSlipEscPos(
  bucket: OrderSlipBucket,
  context: { tableName: string; serverName: string; createdAt: Date },
  logoEscPos: Buffer | null = null,
): Buffer {
  const parts: Buffer[] = [INIT];

  if (logoEscPos) parts.push(ALIGN_CTR, logoEscPos, ALIGN_LFT);

  // Header is the table identifier — extra-large via GS ! 0x22 (3× wide,
  // 3× tall) so it's readable across the kitchen/bar. The Artikelgruppe
  // (category) sits as a smaller sub-header below; since each slip carries
  // exactly one category now, the kitchen sees at a glance which station
  // the order belongs to.
  parts.push(ALIGN_CTR, BOLD_ON, selectSize(0x22), line(`Tisch ${context.tableName}`), RESET_SIZE, BOLD_OFF);
  parts.push(BOLD_ON, selectMode(0x10), line(bucket.category_name), selectMode(0x00), BOLD_OFF);
  parts.push(ALIGN_LFT, divider());

  for (const lineItem of bucket.lines) {
    parts.push(selectMode(0x10), line(`${lineItem.quantity}x ${lineItem.name}`), selectMode(0x00));
    if (lineItem.options) {
      parts.push(line(`  -> ${lineItem.options}`));
    }
  }

  // Footer: timestamp + operator on one line, slash-separated to save paper.
  parts.push(divider());
  parts.push(line(`${formatGermanDateTime(context.createdAt)} / ${context.serverName}`));
  parts.push(FEED3, CUT);
  return Buffer.concat(parts);
}

/**
 * Renders a single Bonkasse "Selbstabholerbon" (one article-unit per slip,
 * optionally with a deposit line if the article has a deposit AND the article
 * is configured so that deposit and article share a slip).
 *
 * Use this when `article.print_deposit_receipt === false` for an article with
 * a non-zero deposit_price, or when there is no deposit at all. For articles
 * with `print_deposit_receipt === true` AND a non-zero deposit, call
 * `buildDepositSlipEscPos` in addition to emit a second slip just for the
 * deposit.
 *
 * @param item - Article info. `priceEuros` is the per-unit gross article
 *   price; `depositEuros` is the per-unit deposit (null/0 → no Pfand line).
 * @param context - Footer metadata (register name, server name, timestamp).
 * @returns Raw ESC/POS bytes ready to enqueue as a `print_job`.
 */
export function buildPickupSlipEscPos(
  item: { name: string; priceEuros: number; depositEuros: number | null },
  context: { registerName: string; serverName: string; createdAt: Date },
  logoEscPos: Buffer | null = null,
): Buffer {
  const parts: Buffer[] = [INIT];
  if (logoEscPos) parts.push(ALIGN_CTR, logoEscPos, ALIGN_LFT);
  parts.push(ALIGN_CTR, BOLD_ON, selectMode(0x30), line('SELBSTABHOLER'), selectMode(0x00), BOLD_OFF);
  parts.push(ALIGN_LFT, divider());

  // Article line + (optional) Pfand line — amounts right-aligned so they line
  // up under each other no matter how long the article name is.
  parts.push(selectMode(0x10), line(twoColumn(`1x ${item.name}`, `${formatEuros(item.priceEuros)} €`)), selectMode(0x00));
  if (item.depositEuros !== null && item.depositEuros > 0) {
    parts.push(line(twoColumn('  + Pfand', `${formatEuros(item.depositEuros)} €`)));
  }

  // Footer: timestamp + register + operator on one line, slash-separated to
  // save paper. The register identifier sits in the middle so a returned slip
  // can still be routed to the right Bonstorno entry.
  parts.push(divider());
  parts.push(line(`${formatGermanDateTime(context.createdAt)} / ${context.registerName} / ${context.serverName}`));
  parts.push(FEED3, CUT);
  return Buffer.concat(parts);
}

/**
 * Renders a standalone "Pfandbon" for one article-unit. Used when the article's
 * `print_deposit_receipt` flag is true so the customer receives an article slip
 * AND a separate deposit slip — useful because the deposit is redeemed at a
 * different counter than the article pickup.
 *
 * The slip intentionally does NOT carry the article name; the deposit counter
 * just needs to see how much money to hand back, and printing "Pfand" instead
 * of the article keeps the bon unambiguous as a refund voucher.
 *
 * @param item - Per-unit deposit amount in euros.
 * @param context - Footer metadata (register name, server name, timestamp).
 * @returns Raw ESC/POS bytes ready to enqueue as a `print_job`.
 */
export function buildDepositSlipEscPos(
  item: { depositEuros: number },
  context: { registerName: string; serverName: string; createdAt: Date },
  logoEscPos: Buffer | null = null,
): Buffer {
  const parts: Buffer[] = [INIT];
  if (logoEscPos) parts.push(ALIGN_CTR, logoEscPos, ALIGN_LFT);
  parts.push(ALIGN_CTR, BOLD_ON, selectMode(0x30), line('PFAND'), selectMode(0x00), BOLD_OFF);
  parts.push(ALIGN_LFT, divider());
  parts.push(selectMode(0x10), line(twoColumn('1x Pfand', `${formatEuros(item.depositEuros)} €`)), selectMode(0x00));

  // Footer: timestamp + register + operator on one line, slash-separated.
  parts.push(divider());
  parts.push(line(`${formatGermanDateTime(context.createdAt)} / ${context.registerName} / ${context.serverName}`));
  parts.push(FEED3, CUT);
  return Buffer.concat(parts);
}

/** Formats a euro amount with the German thousand-grouping convention. ASCII-only — uses '.' as separator since the printer can't render '€'. */
function formatEuros(value: number): string {
  return value.toFixed(2);
}

/** German-formatted "DD.MM.YYYY HH:MM:SS". Inline to keep this module self-contained. */
function formatGermanDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Renders a divider line of `-` at width 42 (Font A, 80 mm). */
function divider(): Buffer {
  return line('-'.repeat(42));
}
