/** Pure helpers for building Excel-export row data. */

/** One raw order item joined to its invoice and surrounding context, as returned by the DB. */
export interface ExportSourceRow {
  invoice_id: string;
  receipt_number: number;
  invoice_created_at: Date | string;
  table_name: string | null;
  /** Name of the user who took the order (or `null` when the row has no user, e.g. a register without auth). */
  ordering_user_name: string | null;
  register_name: string;
  article_name: string;
  options: string | null;
  price: number | string;
  deposit_price: number | string | null;
  tax_rate: number | string;
}

/** One aggregated row in the Excel sheet. */
export interface ExportRow {
  receipt_number: number;
  /** ISO timestamp; the workbook builder formats it. */
  created_at: string;
  table_name: string;
  ordering_user_name: string;
  register_name: string;
  article_name: string;
  quantity: number;
  unit_price: number;
  unit_deposit: number;
  tax_rate: number;
  line_total: number;
}

/**
 * Aggregates raw order-item rows into invoice-position rows for the Excel export.
 *
 * Within each invoice, items that share `(article_name, options, price, deposit, tax_rate)`
 * are collapsed into one row with the unit count as `quantity`. The aggregation key uses
 * the same fields as the receipt renderer so the Excel rows correspond exactly to the lines
 * on the printed bon. Row order: invoices in input order, positions in first-occurrence order.
 *
 * @param items - Raw rows joined from `order_item`, `invoice`, `register`, `dining_table`, `user`.
 * @returns One row per aggregated invoice position, ready for the workbook builder.
 */
export function buildExportRows(items: ExportSourceRow[]): ExportRow[] {
  /** Result accumulator and lookup index — keyed by `invoice_id|article|options|price|deposit|tax`. */
  const out: ExportRow[] = [];
  const index = new Map<string, ExportRow>();

  for (const item of items) {
    const unit = num(item.price);
    const deposit = item.deposit_price === null || item.deposit_price === undefined ? 0 : num(item.deposit_price);
    const tax = num(item.tax_rate);
    const key = [
      item.invoice_id,
      item.article_name,
      item.options ?? '',
      String(unit),
      String(deposit),
      String(tax),
    ].join('|');

    const existing = index.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.line_total = round2(existing.line_total + unit + deposit);
      continue;
    }

    const row: ExportRow = {
      receipt_number: item.receipt_number,
      created_at: toIso(item.invoice_created_at),
      table_name: item.table_name ?? '',
      ordering_user_name: item.ordering_user_name ?? '',
      register_name: item.register_name,
      article_name: item.options ? `${item.article_name} (${item.options})` : item.article_name,
      quantity: 1,
      unit_price: unit,
      unit_deposit: deposit,
      tax_rate: tax,
      line_total: round2(unit + deposit),
    };
    out.push(row);
    index.set(key, row);
  }

  return out;
}

/**
 * Coerces a pg-decimal-string or number into a JavaScript number.
 *
 * @param v - Source value, either a `pg`-returned string or a primitive number.
 * @returns The numeric value (or NaN if `v` was a non-numeric string).
 */
function num(v: number | string): number {
  return typeof v === 'string' ? Number(v) : v;
}

/**
 * Rounds an amount to the cent so summed line totals stay cent-precise.
 *
 * @param n - Floating-point amount.
 * @returns The amount rounded to two decimals.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normalises a date-ish input into an ISO-8601 string.
 *
 * @param d - Either a Date instance or an ISO string.
 * @returns The ISO timestamp.
 */
function toIso(d: Date | string): string {
  return typeof d === 'string' ? d : d.toISOString();
}
