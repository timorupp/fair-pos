/** Structured receipt data: the single source of truth consumed by both the PDF and ESC/POS renderers. */

/** One aggregated line on the receipt. Multiple identical order items are merged into one position with a quantity. */
export interface ReceiptPosition {
  /** Display name (article's receipt_text fallback to name). */
  name: string;
  /** Quantity of identical units. */
  quantity: number;
  /** Per-unit gross price in euro (article price). */
  unitPrice: number;
  /** Per-unit gross deposit in euro (positive = Pfand aufgeschlagen, negative = Leergutrückgabe). Null if no deposit. */
  unitDeposit: number | null;
  /** VAT rate of the article (e.g. 19, 7, 0). */
  taxRate: number;
  /** Total gross for the line: `(unitPrice + unitDeposit) * quantity`. */
  lineGross: number;
}

/** Aggregated VAT breakdown row (one entry per distinct tax rate appearing on the receipt). */
export interface TaxBreakdownRow {
  /** Rate in percent, e.g. 19, 7, 0. */
  rate: number;
  /** Sum of all positions at this rate (gross). */
  gross: number;
  /** Net portion of `gross` (gross - tax). */
  net: number;
  /** Tax amount (`gross - net`). */
  tax: number;
}

/** Complete data needed to render a receipt as PDF or ESC/POS. */
export interface ReceiptData {
  // ── Company ────────────────────────────────────────────────────────────────
  companyName: string;
  companyAddressLines: string[];     // e.g. ["Hauptstr. 5", "12345 Musterort"]
  taxNumber: string;
  vatId: string | null;

  // ── System identifiers (KassenSichV) ───────────────────────────────────────
  systemSerial: string;              // FairPOS-{Jahr}-{10}

  // ── Receipt header ─────────────────────────────────────────────────────────
  receiptNumber: string;             // "RE-00042" — already prefixed
  createdAt: Date;
  registerName: string;
  paymentMethod: 'cash' | 'card';
  /**
   * True when this is a cancellation (Storno) invoice. The renderers use it
   * to flip the printed amounts negative and overlay a clear STORNO marker
   * so the document cannot be mistaken for a normal sales receipt.
   */
  isCancellation: boolean;

  // ── Optional company logo (loaded conditionally per-document-type) ────────
  /** PNG bytes for the PDF renderer, or `null` to omit. */
  logoPng: Buffer | null;
  /** Width of `logoPng` in pixels (only used by the renderer for aspect ratio). */
  logoWidth: number;
  /** Height of `logoPng` in pixels. */
  logoHeight: number;
  /**
   * Fraction (0–1) of the printable bon width the logo should occupy on the
   * PDF. The renderer multiplies the available width by this factor — that
   * way zoom < 100 % shrinks the logo, and the maximum 1.0 always covers the
   * full bon, regardless of the source PNG's pixel dimensions.
   */
  logoWidthFactor: number;
  /** Complete ESC/POS raster command sequence, or `null` to omit. */
  logoEscPos: Buffer | null;

  // ── Line items ─────────────────────────────────────────────────────────────
  positions: ReceiptPosition[];

  // ── Totals (computed once, included so renderers don't re-derive) ─────────
  totalGross: number;
  taxBreakdown: TaxBreakdownRow[];

  // ── TSE (all null until task #4 is implemented) ───────────────────────────
  tseSerial: string | null;
  tseTransactionNumber: number | null;
  tseSignatureCounter: number | null;
  tseSignature: string | null;
  tseStartTime: Date | null;
  tseEndTime: Date | null;
}
