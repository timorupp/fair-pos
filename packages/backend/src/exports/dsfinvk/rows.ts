/**
 * Pure row-building for the DSFinV-K export — turns already-loaded data (see
 * `DsfinvkSource` below) into the row arrays for every CSV file. No DB access
 * here; the route handler loads the source data and calls `buildDsfinvkExport`.
 *
 * Field semantics/citations: docs/Rechtliche-Anforderungen.md Abschnitt 6.
 */
import type {
  AllocationGroupRow, BusinesscaseRow, CashPerCurrencyRow, CashpointClosingRow,
  CashregisterRow, DataPaymentRow, DsfinvkExport, LineRow, LineVatRow,
  LocationRow, PaymentRow, TransactionRow, TransactionVatRow, TseRow, TseTransactionRow, VatRow,
} from './types.js';
import {
  KASSENBELEG_PROCESS_TYPE, BESTELLUNG_PROCESS_TYPE, SONSTIGER_VORGANG_PROCESS_TYPE,
} from '../../tse/processData.js';

/** Maps a DSFinV-K `BON_TYP` to the literal TSE `processType` FairPOS actually signed it with — these are two distinct vocabularies (see tse/processData.ts), and Anhang E defines `TSE_TA_VORGANGSART` as the latter. */
function tseProcessTypeFor(bonTyp: SourceVorgang['bonTyp']): string {
  if (bonTyp === 'Beleg') return KASSENBELEG_PROCESS_TYPE;
  if (bonTyp === 'AVBestellung') return BESTELLUNG_PROCESS_TYPE;
  return SONSTIGER_VORGANG_PROCESS_TYPE;
}

/** One TSE signature as attached to a Vorgang (invoice, service_order, or order_cancellation). */
export interface TseSignatureSource {
  transactionNumber: number;
  signatureCounter: number;
  /** Hex-encoded, as returned by tse/client.ts — converted to base64 for TSE_TA_SIG. */
  signatureHex: string;
  startTime: Date;
  endTime: Date;
}

/** One sold/ordered/cancelled article-unit, i.e. one `order_item` row. */
export interface SourceLineItem {
  articleId: string | null;
  articleName: string;
  categoryName: string;
  /** Percent, e.g. 19, 7, 0. */
  taxRate: number;
  priceEuros: number;
  /** Positive = Pfand aufgeschlagen, negative = Leergutrückgabe, null/0 = kein Pfand. */
  depositPriceEuros: number | null;
}

/** One fiscal Vorgang — an invoice (Kassenbeleg-V1/Beleg), a service_order (AVBestellung), or an order_cancellation (AVSonstige). */
export interface SourceVorgang {
  /** Stable, globally unique ID — becomes BON_ID (invoice/service_order/order_cancellation primary key). */
  id: string;
  /** DSFinV-K BON_TYP, see Rechtliche-Anforderungen.md Abschnitt 6.2. */
  bonTyp: 'Beleg' | 'AVBestellung' | 'AVSonstige';
  /** Required by the spec when bonTyp is AVSonstige; optional otherwise. */
  bonName: string | null;
  /** The printed receipt number — only invoices have one; null for AVBestellung/AVSonstige. */
  receiptNumber: number | null;
  createdAt: Date;
  /** True for a Bonstorno / reversed-sign cancellation invoice (BON_STORNO flag) — NOT the same as bonTyp. */
  isStornoBeleg: boolean;
  diningTableName: string | null;
  operatorUserId: string | null;
  operatorUserName: string | null;
  /** 'cash'/'card' for invoices; null for AVBestellung/AVSonstige (no payment yet). */
  paymentMethod: 'cash' | 'card' | null;
  tse: TseSignatureSource | null;
  items: SourceLineItem[];
}

/** Everything needed to build one complete DSFinV-K export for a single Kassenabschluss (Z-Bon). */
export interface DsfinvkSource {
  closing: {
    zNumber: number;
    createdAt: Date;
    /** YYYY-MM-DD. */
    businessDate: string;
    firstVorgangId: string;
    lastVorgangId: string;
  };
  registerId: string;
  registerName: string;
  systemSerial: string;
  /** The TSE client ID actually passed to the hardware (config.tseClientId) — see rows.ts TERMINAL_ID rationale. */
  tseClientId: string | null;
  tseSerial: string | null;
  /** Signature algorithm / log-time format / public key, cached from the TSE (see tse/certificateInfo.ts) — `null` when unavailable (unconfigured/unreachable TSE), in which case `tse.csv`'s corresponding fields stay empty. */
  tseCertificate: { signatureAlgorithm: string; logTimeFormat: string; publicKeyBase64: string } | null;
  company: {
    name: string;
    street: string;
    postalCode: string;
    city: string;
    taxNumber: string;
    vatId: string | null;
  };
  /** Distinct active tax rates, e.g. [{rate: 19, description: 'Allgemeiner Steuersatz'}, ...]. */
  taxRates: { rate: number; description: string }[];
  vorgaenge: SourceVorgang[];
}

/** Maps a percent tax rate to its DSFinV-K UST_SCHLUESSEL (Stamm_USt, Abschnitt 6.4). Only the rates FairPOS actually uses. */
function ustSchluessel(ratePercent: number): number {
  if (Math.abs(ratePercent - 19) < 0.01) return 1;
  if (Math.abs(ratePercent - 7) < 0.01) return 2;
  return 5; // 0 % / steuerfrei
}

/** Formats a euro amount with exactly two decimal places, dot as separator, no thousands separator (per Anhang I formatting rules, also applied to CSV amounts here for consistency). */
function euro(amount: number): string {
  return amount.toFixed(2);
}

/** Hex string (as returned by the TSE client) to base64, for TSE_TA_SIG. */
function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

/** ISO 8601 with milliseconds and trailing Z, per Anhang I's TSE timestamp format. */
function isoWithMillis(d: Date): string {
  return d.toISOString();
}

/**
 * Builds the complete DSFinV-K export for one Kassenabschluss.
 *
 * @param source - Loaded closing/register/company/TSE/Vorgang data (see `DsfinvkSource`).
 * @returns One row array per CSV file, keyed by DSFinV-K file name.
 */
export function buildDsfinvkExport(source: DsfinvkSource): DsfinvkExport {
  const schluessel = {
    Z_KASSE_ID: source.registerId,
    Z_ERSTELLUNG: isoWithMillis(source.closing.createdAt),
    Z_NR: source.closing.zNumber,
  };

  const cashpointclosing: CashpointClosingRow[] = [{
    ...schluessel,
    Z_BUCHUNGSTAG: source.closing.businessDate,
    TAXONOMIE_VERSION: '2.4',
    Z_START_ID: source.closing.firstVorgangId,
    Z_ENDE_ID: source.closing.lastVorgangId,
    NAME: source.company.name,
    STRASSE: source.company.street,
    PLZ: source.company.postalCode,
    ORT: source.company.city,
    LAND: 'DEU',
    STNR: source.company.taxNumber,
    USTID: source.company.vatId ?? '',
    // Se_Zahlungen/Barzahlungen are informational summary fields duplicating
    // payment.csv — computed below once the payment totals are known.
    Z_SE_ZAHLUNGEN: '',
    Z_SE_BARZAHLUNGEN: '',
  }];

  const location: LocationRow[] = [{
    ...schluessel,
    LOC_NAME: source.company.name,
    LOC_STRASSE: source.company.street,
    LOC_PLZ: source.company.postalCode,
    LOC_ORT: source.company.city,
    LOC_LAND: 'DEU',
    LOC_USTID: source.company.vatId ?? '',
  }];

  const cashregister: CashregisterRow[] = [{
    ...schluessel,
    KASSE_BRAND: 'FairPOS',
    KASSE_MODELL: source.registerName,
    KASSE_SERIENNR: source.systemSerial,
    KASSE_SW_BRAND: 'FairPOS',
    KASSE_SW_VERSION: '',
    KASSE_BASISWAEH_CODE: 'EUR',
    KEINE_UST_ZUORDNUNG: '0',
  }];

  const vat: VatRow[] = source.taxRates.map((t) => ({
    ...schluessel,
    UST_SCHLUESSEL: ustSchluessel(t.rate),
    UST_SATZ: t.rate.toFixed(2),
    UST_BESCHR: t.description,
  }));

  const tse: TseRow[] = source.tseSerial ? [{
    ...schluessel,
    TSE_ID: 1,
    TSE_SERIAL: source.tseSerial,
    TSE_SIG_ALGO: source.tseCertificate?.signatureAlgorithm ?? '',
    TSE_ZEITFORMAT: source.tseCertificate?.logTimeFormat ?? '',
    TSE_PD_ENCODING: 'UTF-8',
    TSE_PUBLIC_KEY: source.tseCertificate?.publicKeyBase64 ?? '',
    // The certificate chain itself is not yet exposed by native/tse-cli
    // (worm_getLogMessageCertificate, needs the CTSS interface) — see
    // docs/TSE-Integration.md Abschnitt 11. Left empty rather than guessed;
    // not required for QR-code verification, only for this file's completeness.
    TSE_ZERTIFIKAT_I: '',
    TSE_ZERTIFIKAT_II: '',
  }] : [];

  // ── Per-Vorgang rows ───────────────────────────────────────────────────────
  const transactions: TransactionRow[] = [];
  const allocationGroups: AllocationGroupRow[] = [];
  const transactionsVat: TransactionVatRow[] = [];
  const datapayment: DataPaymentRow[] = [];
  const lines: LineRow[] = [];
  const linesVat: LineVatRow[] = [];
  const transactionsTse: TseTransactionRow[] = [];

  // Aggregated across all Vorgänge for the Kassenabschlussmodul.
  const businesscaseTotals = new Map<string, { gvTyp: string; gvName: string; ustSchluessel: number; brutto: number; netto: number }>();
  const paymentTotals = new Map<'Bar' | 'Unbar', number>();

  for (const v of source.vorgaenge) {
    // BON_START/BON_ENDE must come from the recording system itself, never
    // from the TSE (Anhang I) — see Rechtliche-Anforderungen.md Abschnitt 6.7.
    // Every FairPOS Vorgang is one atomic HTTP request, so start === end === createdAt;
    // the TSE's own timestamps are reported separately in transactions_tse.csv.
    const start = v.createdAt;
    const end = v.createdAt;
    const umsBrutto = v.items.reduce((s, it) => s + it.priceEuros + (it.depositPriceEuros ?? 0), 0);
    const signedUmsBrutto = v.isStornoBeleg ? -umsBrutto : umsBrutto;

    transactions.push({
      ...schluessel,
      BON_ID: v.id,
      BON_NR: v.receiptNumber ?? 0,
      BON_TYP: v.bonTyp,
      BON_NAME: v.bonName ?? '',
      TERMINAL_ID: source.tseClientId ?? '',
      BON_STORNO: '0', // FairPOS never uses AVBelegstorno with a TSE — see Abschnitt 6.2; Bonstorno is its own reversed-sign `Beleg`.
      BON_START: isoWithMillis(start),
      BON_ENDE: isoWithMillis(end),
      BEDIENER_ID: v.operatorUserId ?? '',
      BEDIENER_NAME: v.operatorUserName ?? '',
      UMS_BRUTTO: euro(signedUmsBrutto),
      KUNDE_NAME: '', KUNDE_ID: '', KUNDE_TYP: '', KUNDE_STRASSE: '',
      KUNDE_PLZ: '', KUNDE_ORT: '', KUNDE_LAND: '', KUNDE_USTID: '',
      BON_NOTIZ: '',
    });

    if (v.diningTableName) {
      allocationGroups.push({ ...schluessel, BON_ID: v.id, ABRECHNUNGSKREIS: v.diningTableName });
    }

    // Tax breakdown per Vorgang.
    const vatBuckets = new Map<number, { brutto: number; netto: number; ust: number }>();
    let posZeile = 0;
    for (const it of v.items) {
      const key = ustSchluessel(it.taxRate);
      const sign = v.isStornoBeleg ? -1 : 1;

      // Article line (GV_TYP = Umsatz).
      posZeile += 1;
      const articleBrutto = sign * it.priceEuros;
      const articleNetto = articleBrutto / (1 + it.taxRate / 100);
      lines.push({
        ...schluessel, BON_ID: v.id, POS_ZEILE: String(posZeile),
        GUTSCHEIN_NR: '', ARTIKELTEXT: it.articleName, POS_TERMINAL_ID: source.tseClientId ?? '',
        GV_TYP: 'Umsatz', GV_NAME: '', INHAUS: '1', P_STORNO: '0', AGENTUR_ID: 0,
        ART_NR: it.articleId ?? '', GTIN: '', WARENGR_ID: it.categoryName, WARENGR: it.categoryName,
        MENGE: '1.000', FAKTOR: '1.000', EINHEIT: 'Stück', STK_BR: euro(Math.abs(it.priceEuros)),
      });
      linesVat.push({
        ...schluessel, BON_ID: v.id, POS_ZEILE: String(posZeile),
        UST_SCHLUESSEL: key, POS_BRUTTO: euro(articleBrutto), POS_NETTO: euro(articleNetto),
        POS_UST: euro(articleBrutto - articleNetto),
      });
      addToVatBucket(vatBuckets, key, articleBrutto, articleNetto);
      addToBusinesscase(businesscaseTotals, 'Umsatz', key, articleBrutto, articleNetto);

      // Separate Pfand / PfandRueckzahlung line, if this position carries a deposit.
      if (it.depositPriceEuros !== null && it.depositPriceEuros !== 0) {
        posZeile += 1;
        const depositBrutto = sign * it.depositPriceEuros;
        const depositNetto = depositBrutto / (1 + it.taxRate / 100);
        const gvTyp = it.depositPriceEuros > 0 ? 'Pfand' : 'PfandRueckzahlung';
        lines.push({
          ...schluessel, BON_ID: v.id, POS_ZEILE: String(posZeile),
          GUTSCHEIN_NR: '', ARTIKELTEXT: 'Pfand', POS_TERMINAL_ID: source.tseClientId ?? '',
          GV_TYP: gvTyp, GV_NAME: '', INHAUS: '1', P_STORNO: '0', AGENTUR_ID: 0,
          ART_NR: it.articleId ?? '', GTIN: '', WARENGR_ID: it.categoryName, WARENGR: it.categoryName,
          MENGE: '1.000', FAKTOR: '1.000', EINHEIT: 'Stück', STK_BR: euro(Math.abs(it.depositPriceEuros)),
        });
        linesVat.push({
          ...schluessel, BON_ID: v.id, POS_ZEILE: String(posZeile),
          UST_SCHLUESSEL: key, POS_BRUTTO: euro(depositBrutto), POS_NETTO: euro(depositNetto),
          POS_UST: euro(depositBrutto - depositNetto),
        });
        addToVatBucket(vatBuckets, key, depositBrutto, depositNetto);
        addToBusinesscase(businesscaseTotals, gvTyp, key, depositBrutto, depositNetto);
      }
    }
    for (const [key, sums] of vatBuckets) {
      transactionsVat.push({
        ...schluessel, BON_ID: v.id, UST_SCHLUESSEL: key,
        BON_BRUTTO: euro(sums.brutto), BON_NETTO: euro(sums.netto), BON_UST: euro(sums.brutto - sums.netto),
      });
    }

    // Payment — only "Beleg" Vorgänge (invoices) carry an actual payment.
    if (v.paymentMethod) {
      const zahlartTyp: 'Bar' | 'Unbar' = v.paymentMethod === 'cash' ? 'Bar' : 'Unbar';
      const amount = signedUmsBrutto;
      datapayment.push({
        ...schluessel, BON_ID: v.id, ZAHLART_TYP: zahlartTyp, ZAHLART_NAME: zahlartTyp,
        ZAHLWAEH_CODE: '', ZAHLWAEH_BETRAG: '', BASISWAEH_BETRAG: euro(amount),
      });
      paymentTotals.set(zahlartTyp, (paymentTotals.get(zahlartTyp) ?? 0) + amount);
    }

    if (v.tse) {
      transactionsTse.push({
        ...schluessel, BON_ID: v.id, TSE_ID: 1, TSE_TANR: v.tse.transactionNumber,
        TSE_TA_START: isoWithMillis(v.tse.startTime), TSE_TA_ENDE: isoWithMillis(v.tse.endTime),
        TSE_TA_VORGANGSART: tseProcessTypeFor(v.bonTyp),
        TSE_TA_SIGZ: v.tse.signatureCounter, TSE_TA_SIG: hexToBase64(v.tse.signatureHex),
        TSE_TA_FEHLER: '', TSE_VORGANGSDATEN: '',
      });
    } else {
      transactionsTse.push({
        ...schluessel, BON_ID: v.id, TSE_ID: 1, TSE_TANR: '',
        TSE_TA_START: '', TSE_TA_ENDE: '', TSE_TA_VORGANGSART: v.bonTyp === 'Beleg' ? 'Kassenbeleg-V1' : v.bonTyp,
        TSE_TA_SIGZ: '', TSE_TA_SIG: '',
        TSE_TA_FEHLER: 'Kein TSE-Signatur vorhanden — siehe docs/TSE-Integration.md "TSE-Ausfall".',
        TSE_VORGANGSDATEN: '',
      });
    }
  }

  const businesscases: BusinesscaseRow[] = [...businesscaseTotals.values()].map((b) => ({
    ...schluessel, GV_TYP: b.gvTyp, GV_NAME: b.gvName, AGENTUR_ID: 0, UST_SCHLUESSEL: b.ustSchluessel,
    Z_UMS_BRUTTO: euro(b.brutto), Z_UMS_NETTO: euro(b.netto), Z_UST: euro(b.brutto - b.netto),
  }));

  const payment: PaymentRow[] = [...paymentTotals.entries()].map(([typ, amount]) => ({
    ...schluessel, ZAHLART_TYP: typ, ZAHLART_NAME: typ, Z_ZAHLART_BETRAG: euro(amount),
  }));

  const cashPerCurrency: CashPerCurrencyRow[] = [{
    ...schluessel, ZAHLART_WAEH: 'EUR', ZAHLART_BETRAG_WAEH: euro(paymentTotals.get('Bar') ?? 0),
  }];

  // Backfill the Se_Zahlungen/Barzahlungen summary fields on cashpointclosing now that totals are known.
  const totalPayments = [...paymentTotals.values()].reduce((s, n) => s + n, 0);
  cashpointclosing[0]!.Z_SE_ZAHLUNGEN = euro(totalPayments);
  cashpointclosing[0]!.Z_SE_BARZAHLUNGEN = euro(paymentTotals.get('Bar') ?? 0);

  return {
    'cashpointclosing.csv': cashpointclosing,
    'location.csv': location,
    'cashregister.csv': cashregister,
    'vat.csv': vat,
    'tse.csv': tse,
    'businesscases.csv': businesscases,
    'payment.csv': payment,
    'cash_per_currency.csv': cashPerCurrency,
    'transactions.csv': transactions,
    'allocation_groups.csv': allocationGroups,
    'transactions_vat.csv': transactionsVat,
    'datapayment.csv': datapayment,
    'lines.csv': lines,
    'lines_vat.csv': linesVat,
    'transactions_tse.csv': transactionsTse,
  };
}

function addToVatBucket(
  buckets: Map<number, { brutto: number; netto: number; ust: number }>,
  key: number,
  brutto: number,
  netto: number,
): void {
  const existing = buckets.get(key) ?? { brutto: 0, netto: 0, ust: 0 };
  existing.brutto += brutto;
  existing.netto += netto;
  existing.ust += brutto - netto;
  buckets.set(key, existing);
}

function addToBusinesscase(
  totals: Map<string, { gvTyp: string; gvName: string; ustSchluessel: number; brutto: number; netto: number }>,
  gvTyp: string,
  ustSchluesselValue: number,
  brutto: number,
  netto: number,
): void {
  const key = `${gvTyp}|${ustSchluesselValue}`;
  const existing = totals.get(key) ?? { gvTyp, gvName: '', ustSchluessel: ustSchluesselValue, brutto: 0, netto: 0 };
  existing.brutto += brutto;
  existing.netto += netto;
  totals.set(key, existing);
}
