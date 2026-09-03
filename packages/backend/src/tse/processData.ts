/**
 * Builds the exact `processType`/`processData` payloads DSFinV-K v2.4
 * Anhang I mandates for the TSE's `finishTransaction` call — one builder per
 * Vorgang shape FairPOS signs (Kassenbeleg-V1, Bestellung-V1,
 * SonstigerVorgang). Verbatim citation: docs/Rechtliche-Anforderungen.md
 * Abschnitt 6.5. `startTransaction` always gets empty processType/processData
 * regardless of Vorgang — Anhang I: "Für alle Vorgangstypen gilt, dass
 * processType und processData für die StartTransaction-Operation immer leer
 * sind." — enforced in `tse/signing.ts`, not here.
 *
 * **Known remaining gap (Task #46, narrowed):** the TSE certificate chain
 * (`TSE_ZERTIFIKAT_I`/`TSE_ZERTIFIKAT_II`) is not yet exposed by
 * `native/tse-cli` — see docs/TSE-Integration.md Abschnitt 11. The signature
 * algorithm, log-time format, and public key (also required by Anhang I,
 * and sufficient for QR-code verification per the spec's own note) are —
 * see `tse/certificateInfo.ts`.
 */

import type { TaxCategory } from '@fairpos/shared';

/** The three DSFinV-K tax-rate slots FairPOS ever populates for `<Brutto-Steuerumsätze>` — the other two (Durchschnittssätze §24 UStG) are always `0.00`, FairPOS has no Landwirtschaft/Forstwirtschaft turnover. */
interface TaxSlotTotals {
  /** Allgemeiner Steuersatz. */
  allgemein: number;
  /** Ermäßigter Steuersatz. */
  ermaessigt: number;
  /** 0 % / steuerfrei. */
  steuerfrei: number;
}

/** Maps a VAT category to its `<Brutto-Steuerumsätze>` slot (Anhang I: fixed order). Category-based rather than a percentage comparison (Task #110) — stays correct across any future Regelsteuersatz change instead of silently falling into `steuerfrei` for an unrecognised number. */
function taxSlot(category: TaxCategory): keyof TaxSlotTotals {
  if (category === 'standard') return 'allgemein';
  if (category === 'reduced') return 'ermaessigt';
  return 'steuerfrei';
}

/** Formats a euro amount with exactly two decimals, `.` as separator, no thousands separator, per Anhang I's numeric rules. Never prints `-0.00`. */
function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return (rounded === 0 ? 0 : rounded).toFixed(2);
}

/** Joins the five fixed `<Brutto-Steuerumsätze>` slots with `_`, in Anhang I's mandated order. */
function formatBruttoSteuerumsaetze(totals: TaxSlotTotals): string {
  return [totals.allgemein, totals.ermaessigt, 0, 0, totals.steuerfrei].map(formatAmount).join('_');
}

/** The literal TSE `processType` for a completed sale/cancellation receipt. */
export const KASSENBELEG_PROCESS_TYPE = 'Kassenbeleg-V1';
/** The literal TSE `processType` for a Bedienungskasse order placed before payment. */
export const BESTELLUNG_PROCESS_TYPE = 'Bestellung-V1';
/** The literal TSE `processType` for anything that's neither a receipt nor an order (here: cancelling/free-of-charge an open, unpaid position). */
export const SONSTIGER_VORGANG_PROCESS_TYPE = 'SonstigerVorgang';

/** One sold article-unit (or several units aggregated on one line) as it contributes to the signed Kassenbeleg-V1 totals. */
export interface KassenbelegPosition {
  quantity: number;
  unitPriceEuros: number;
  /** Positive = Pfand aufgeschlagen, negative = Leergutrückgabe, null/0 = kein Pfand. Always taxed at `standard` regardless of `taxCategory` (Task #113 — Pfand unterliegt immer dem Regelsteuersatz). */
  depositPriceEuros: number | null;
  /** VAT category of the article itself — does NOT apply to `depositPriceEuros`, see above. */
  taxCategory: TaxCategory;
}

/** Everything about a completed sale (or Bonstorno) that gets signed as `Kassenbeleg-V1`. */
export interface KassenbelegSnapshot {
  paymentMethod: 'cash' | 'card';
  /** Mirrors `invoice.receipt_type`. Determines the sign of every amount below — see Anhang I's "Warenrücknahme" example. */
  receiptType: 'sales_receipt' | 'cancellation';
  positions: KassenbelegPosition[];
}

/**
 * Serialises a Kassenbeleg-V1 snapshot into the exact
 * `<Vorgangstyp>^<Brutto-Steuerumsätze>^<Zahlungen>` wire format Anhang I
 * mandates for the `finishTransaction` call. `<Vorgangstyp>` is always
 * `Beleg`: FairPOS never uses `AVBelegstorno` once a TSE is in use — a
 * cancellation is its own `Beleg` with reversed-sign amounts instead (see
 * docs/Rechtliche-Anforderungen.md Abschnitt 6.2 for the verbatim citation
 * on why `AVBelegstorno` cannot be used with a TSE).
 *
 * @param snapshot - The sale's positions and payment method.
 * @returns UTF-8-encoded processData bytes.
 */
export function buildKassenbelegProcessData(snapshot: KassenbelegSnapshot): Buffer {
  const sign = snapshot.receiptType === 'cancellation' ? -1 : 1;
  const totals: TaxSlotTotals = { allgemein: 0, ermaessigt: 0, steuerfrei: 0 };
  let totalBrutto = 0;
  for (const pos of snapshot.positions) {
    // Article and deposit are bucketed separately — the deposit always goes
    // to `allgemein` (Regelsteuersatz) regardless of the article's own
    // category (Task #113), so the two must never be summed before bucketing.
    const articleBrutto = sign * pos.quantity * pos.unitPriceEuros;
    totals[taxSlot(pos.taxCategory)] += articleBrutto;
    totalBrutto += articleBrutto;

    if (pos.depositPriceEuros) {
      const depositBrutto = sign * pos.quantity * pos.depositPriceEuros;
      totals.allgemein += depositBrutto;
      totalBrutto += depositBrutto;
    }
  }

  // "Zahlungen von 0.00 müssen entfallen" — omit the payment entirely rather
  // than emit e.g. "0.00:Bar". FairPOS only ever settles one payment method
  // per Beleg, so there is at most one entry — no accumulation/ordering rules
  // to apply here (Anhang I's rules for multiple/foreign-currency payments).
  const zahlungen = formatAmount(totalBrutto) === '0.00'
    ? ''
    : `${formatAmount(totalBrutto)}:${snapshot.paymentMethod === 'cash' ? 'Bar' : 'Unbar'}`;

  return Buffer.from(`Beleg^${formatBruttoSteuerumsaetze(totals)}^${zahlungen}`, 'utf-8');
}

/** The fixed processData Anhang I's own worked example uses to close out a dangling transaction (start succeeded, finish never did) — see docs/TSE-Integration.md Abschnitt 8.1, rule 6. */
export function buildAvBelegabbruchProcessData(): Buffer {
  return Buffer.from('AVBelegabbruch^0.00_0.00_0.00_0.00_0.00^', 'utf-8');
}

/** One ordered article-unit (or several aggregated on one line) as it appears on a Bestellung-V1 line. */
export interface AvBestellungPosition {
  name: string;
  quantity: number;
  unitPriceEuros: number;
  depositPriceEuros: number | null;
}

/** Everything about a placed (not yet paid) service-register order that gets signed as `Bestellung-V1`. */
export interface AvBestellungSnapshot {
  positions: AvBestellungPosition[];
}

/** Wraps a Bestellung-V1 `<Bezeichnung>` in quotes, doubling any embedded quote — Anhang I's CSV-quoting rule. */
function quoteBezeichnung(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Serialises an `AVBestellung`/Bedienungskasse order as the CSV-style
 * `<Menge>;"<Bezeichnung>";<Preis>` rows (one per line, `\r`-separated)
 * Anhang I mandates for `processType: Bestellung-V1`. Deposit (Pfand), if
 * any, is folded into `<Preis>` — Anhang I defines `<Preis>` as "der
 * Brutto-Einzelpreis der Bestellzeile" and gives no separate-line example
 * for Bestellung the way it does for Kassenbeleg-V1's Umsatz/Pfand split.
 *
 * @param snapshot - The order's positions.
 * @returns UTF-8-encoded processData bytes.
 */
export function buildAvBestellungProcessData(snapshot: AvBestellungSnapshot): Buffer {
  const rows = snapshot.positions.map((p) => {
    const price = p.unitPriceEuros + (p.depositPriceEuros ?? 0);
    return `${p.quantity};${quoteBezeichnung(p.name)};${formatAmount(price)}`;
  });
  return Buffer.from(rows.join('\r'), 'utf-8');
}

/** One cancelled/free-of-charge article-unit as it should be reflected in the signed snapshot. */
export interface AvSonstigePosition {
  name: string;
  quantity: number;
  unitPriceEuros: number;
}

/** A cancellation of open (unpaid) service-register positions that gets signed as `SonstigerVorgang`. */
export interface AvSonstigeSnapshot {
  bookingType: 'cancellation' | 'free_of_charge';
  cancellationReasonName: string;
  positions: AvSonstigePosition[];
}

/**
 * Builds a human-readable processData string for `processType:
 * SonstigerVorgang` — Anhang I explicitly leaves this processType's content
 * free ("Der Inhalt von processData kann vom Aufzeichnungssystem frei
 * gewählt werden"), recommending readable text where practical, which this
 * follows rather than inventing a structured format nothing requires.
 *
 * @param snapshot - The reason and positions affected by this cancellation.
 * @returns UTF-8-encoded processData bytes.
 */
export function buildAvSonstigeProcessData(snapshot: AvSonstigeSnapshot): Buffer {
  const label = snapshot.bookingType === 'cancellation' ? 'Storno' : 'Kostenfreie Abgabe';
  const total = snapshot.positions.reduce((s, p) => s + p.quantity * p.unitPriceEuros, 0);
  const lines = snapshot.positions
    .map((p) => `${p.quantity}x ${p.name} (${formatAmount(p.unitPriceEuros)} EUR)`)
    .join(', ');
  return Buffer.from(
    `${label} (${snapshot.cancellationReasonName}): ${lines} — Summe ${formatAmount(total)} EUR`,
    'utf-8',
  );
}
