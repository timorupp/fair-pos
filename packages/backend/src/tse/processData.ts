/**
 * Builds the payload logged on the TSE for fiscal transactions.
 *
 * **Known gap (Task #46):** this module encodes a self-describing JSON
 * snapshot, but DSFinV-K v2.4 Anhang I actually mandates an exact
 * `<Vorgangstyp>^<Brutto-Steuerumsätze>^<Zahlungen>` format for
 * `Kassenbeleg-V1` (verbatim citation: `docs/Rechtliche-Anforderungen.md`
 * Abschnitt 6.5) — an earlier assumption that the format was unconstrained
 * (based on the Epson TSE Developer's Guide, which only says content
 * requirements aren't Epson's concern) turned out to be wrong. The JSON here
 * is an interim format, deliberately not yet corrected — see Task #46 for
 * scope and the required native-CLI extension (TSE certificate data for the
 * QR-code content model). The signing architecture itself (start/finish,
 * storing the resulting signature on the invoice) will not need to change
 * once that correction happens.
 */

/** One sold article-unit as it should be reflected in the signed snapshot. */
export interface KassenbelegPosition {
  articleId: string;
  name: string;
  quantity: number;
  unitPriceEuros: number;
  depositPriceEuros: number | null;
  taxRatePercent: number;
}

/** Everything about a completed sale (or Bonstorno) that gets signed as `Kassenbeleg-V1`. */
export interface KassenbelegSnapshot {
  registerId: string;
  paymentMethod: 'cash' | 'card';
  /** Mirrors `invoice.receipt_type` — amounts stay positive either way, this just labels the vorgang. */
  receiptType: 'sales_receipt' | 'cancellation';
  positions: KassenbelegPosition[];
}

/**
 * Serialises a Kassenbeleg-V1 snapshot into the raw bytes passed to
 * `startTransaction`/`finishTransaction`.
 *
 * @param snapshot - The sale's positions, register, and payment method.
 * @returns UTF-8-encoded JSON bytes.
 */
export function buildKassenbelegProcessData(snapshot: KassenbelegSnapshot): Buffer {
  return Buffer.from(JSON.stringify(snapshot), 'utf-8');
}

/** Everything about a placed (not yet paid) service-register order that gets signed as `AVBestellung`. */
export interface AvBestellungSnapshot {
  registerId: string;
  diningTableId: string;
  positions: KassenbelegPosition[];
}

/**
 * Serialises an `AVBestellung` snapshot (Bedienungskasse: Bestellung
 * aufnehmen, noch nicht kassiert) — one signature per Bestellvorgang, not per
 * position, see `docs/Anforderungen.md` → "Zu signierende Vorgänge in FairPOS".
 *
 * @param snapshot - The order's table, register, and positions.
 * @returns UTF-8-encoded JSON bytes.
 */
export function buildAvBestellungProcessData(snapshot: AvBestellungSnapshot): Buffer {
  return Buffer.from(JSON.stringify(snapshot), 'utf-8');
}

/** One cancelled/free-of-charge article-unit as it should be reflected in the signed snapshot. */
export interface AvSonstigePosition {
  articleId: string;
  name: string;
  quantity: number;
  unitPriceEuros: number;
}

/** A cancellation of open (unpaid) service-register positions that gets signed as `AVSonstige`. */
export interface AvSonstigeSnapshot {
  registerId: string;
  bookingType: 'cancellation' | 'free_of_charge';
  cancellationReasonId: string;
  positions: AvSonstigePosition[];
}

/**
 * Serialises an `AVSonstige` snapshot (Bedienungskasse: Storno einer offenen
 * Position vor dem Kassieren) — one signature per Stornovorgang.
 *
 * @param snapshot - The reason and positions affected by this cancellation.
 * @returns UTF-8-encoded JSON bytes.
 */
export function buildAvSonstigeProcessData(snapshot: AvSonstigeSnapshot): Buffer {
  return Buffer.from(JSON.stringify(snapshot), 'utf-8');
}
