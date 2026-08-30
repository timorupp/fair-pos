/**
 * Row types for the DSFinV-K export, one interface per CSV file.
 *
 * Field names and types are taken verbatim from the official specification
 * ("DSFinV-K", Version 2.4, kassensichv.com/downloads/DSFinV-K-Vers-2-4.pdf —
 * see docs/Rechtliche-Anforderungen.md Abschnitt 6 for the full citation and
 * page references). Only files/fields relevant to FairPOS's actual use case
 * are populated; inapplicable optional fields are typed but always emitted
 * empty (see rows.ts for which ones and why).
 */

/** The three key fields present on every DSFinV-K row, tying it to one Kassenabschluss (Anhang E, "Schlüsselfelder"). */
export interface SchluesselFields {
  Z_KASSE_ID: string;
  /** ISO 8601 / RFC 3339. */
  Z_ERSTELLUNG: string;
  Z_NR: number;
}

/** 1. Stamm_Abschluss (cashpointclosing.csv). */
export interface CashpointClosingRow extends SchluesselFields {
  Z_BUCHUNGSTAG: string;
  TAXONOMIE_VERSION: string;
  Z_START_ID: string;
  Z_ENDE_ID: string;
  NAME: string;
  STRASSE: string;
  PLZ: string;
  ORT: string;
  LAND: string;
  STNR: string;
  USTID: string;
  Z_SE_ZAHLUNGEN: string;
  Z_SE_BARZAHLUNGEN: string;
}

/** 2. Stamm_Orte (location.csv). */
export interface LocationRow extends SchluesselFields {
  LOC_NAME: string;
  LOC_STRASSE: string;
  LOC_PLZ: string;
  LOC_ORT: string;
  LOC_LAND: string;
  LOC_USTID: string;
}

/** 3. Stamm_Kassen (cashregister.csv). */
export interface CashregisterRow extends SchluesselFields {
  KASSE_BRAND: string;
  KASSE_MODELL: string;
  KASSE_SERIENNR: string;
  KASSE_SW_BRAND: string;
  KASSE_SW_VERSION: string;
  KASSE_BASISWAEH_CODE: string;
  KEINE_UST_ZUORDNUNG: '0' | '1';
}

/** 4. Stamm_USt (vat.csv). */
export interface VatRow extends SchluesselFields {
  UST_SCHLUESSEL: number;
  UST_SATZ: string;
  UST_BESCHR: string;
}

/** 5. Stamm_TSE (tse.csv). */
export interface TseRow extends SchluesselFields {
  TSE_ID: number;
  TSE_SERIAL: string;
  TSE_SIG_ALGO: string;
  TSE_ZEITFORMAT: string;
  TSE_PD_ENCODING: string;
  TSE_PUBLIC_KEY: string;
  TSE_ZERTIFIKAT_I: string;
  TSE_ZERTIFIKAT_II: string;
}

/** 6. Z_GV_TYP (businesscases.csv). */
export interface BusinesscaseRow extends SchluesselFields {
  GV_TYP: string;
  GV_NAME: string;
  AGENTUR_ID: number;
  UST_SCHLUESSEL: number;
  Z_UMS_BRUTTO: string;
  Z_UMS_NETTO: string;
  Z_UST: string;
}

/** 7. Z_Zahlart (payment.csv). */
export interface PaymentRow extends SchluesselFields {
  ZAHLART_TYP: 'Bar' | 'Unbar';
  ZAHLART_NAME: string;
  Z_ZAHLART_BETRAG: string;
}

/** 8. Z_WAEHRUNGEN (cash_per_currency.csv). */
export interface CashPerCurrencyRow extends SchluesselFields {
  ZAHLART_WAEH: string;
  ZAHLART_BETRAG_WAEH: string;
}

/** 9. Bonkopf (transactions.csv). */
export interface TransactionRow extends SchluesselFields {
  BON_ID: string;
  BON_NR: number;
  BON_TYP: string;
  BON_NAME: string;
  TERMINAL_ID: string;
  BON_STORNO: '0' | '1';
  /** ISO 8601 / RFC 3339 — from the recording system, NOT the TSE (see Abschnitt 6.7). */
  BON_START: string;
  BON_ENDE: string;
  BEDIENER_ID: string;
  BEDIENER_NAME: string;
  UMS_BRUTTO: string;
  KUNDE_NAME: string;
  KUNDE_ID: string;
  KUNDE_TYP: string;
  KUNDE_STRASSE: string;
  KUNDE_PLZ: string;
  KUNDE_ORT: string;
  KUNDE_LAND: string;
  KUNDE_USTID: string;
  BON_NOTIZ: string;
}

/** 10. Bonkopf_AbrKreis (allocation_groups.csv). */
export interface AllocationGroupRow extends SchluesselFields {
  BON_ID: string;
  ABRECHNUNGSKREIS: string;
}

/** 11. Bonkopf_USt (transactions_vat.csv). */
export interface TransactionVatRow extends SchluesselFields {
  BON_ID: string;
  UST_SCHLUESSEL: number;
  BON_BRUTTO: string;
  BON_NETTO: string;
  BON_UST: string;
}

/** 12. Bonkopf_Zahlarten (datapayment.csv). */
export interface DataPaymentRow extends SchluesselFields {
  BON_ID: string;
  ZAHLART_TYP: 'Bar' | 'Unbar';
  ZAHLART_NAME: string;
  ZAHLWAEH_CODE: string;
  ZAHLWAEH_BETRAG: string;
  BASISWAEH_BETRAG: string;
}

/** 13. Bonpos (lines.csv). */
export interface LineRow extends SchluesselFields {
  BON_ID: string;
  POS_ZEILE: string;
  GUTSCHEIN_NR: string;
  ARTIKELTEXT: string;
  POS_TERMINAL_ID: string;
  GV_TYP: string;
  GV_NAME: string;
  INHAUS: '0' | '1';
  P_STORNO: '0' | '1';
  AGENTUR_ID: number;
  ART_NR: string;
  GTIN: string;
  WARENGR_ID: string;
  WARENGR: string;
  MENGE: string;
  FAKTOR: string;
  EINHEIT: string;
  STK_BR: string;
}

/** 14. Bonpos_USt (lines_vat.csv). */
export interface LineVatRow extends SchluesselFields {
  BON_ID: string;
  POS_ZEILE: string;
  UST_SCHLUESSEL: number;
  POS_BRUTTO: string;
  POS_NETTO: string;
  POS_UST: string;
}

/** 15. TSE_Transaktionen (transactions_tse.csv). */
export interface TseTransactionRow extends SchluesselFields {
  BON_ID: string;
  TSE_ID: number;
  TSE_TANR: number | '';
  /** ISO 8601, format YYYY-MM-DDThh:mm:ss.fffZ per spec. */
  TSE_TA_START: string;
  TSE_TA_ENDE: string;
  TSE_TA_VORGANGSART: string;
  TSE_TA_SIGZ: number | '';
  /** Base64 — note the TSE client returns hex, this must be re-encoded (see rows.ts). */
  TSE_TA_SIG: string;
  TSE_TA_FEHLER: string;
  TSE_VORGANGSDATEN: string;
}

/** One CSV file's complete row set, keyed by the DSFinV-K file name (e.g. "transactions.csv"). */
export interface DsfinvkExport {
  'cashpointclosing.csv': CashpointClosingRow[];
  'location.csv': LocationRow[];
  'cashregister.csv': CashregisterRow[];
  'vat.csv': VatRow[];
  'tse.csv': TseRow[];
  'businesscases.csv': BusinesscaseRow[];
  'payment.csv': PaymentRow[];
  'cash_per_currency.csv': CashPerCurrencyRow[];
  'transactions.csv': TransactionRow[];
  'allocation_groups.csv': AllocationGroupRow[];
  'transactions_vat.csv': TransactionVatRow[];
  'datapayment.csv': DataPaymentRow[];
  'lines.csv': LineRow[];
  'lines_vat.csv': LineVatRow[];
  'transactions_tse.csv': TseTransactionRow[];
}
