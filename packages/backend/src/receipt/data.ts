/** Loads receipt data from the database and assembles the structured `ReceiptData` consumed by the renderers. */

import { query } from '../db/client.js';
import type { ReceiptData, ReceiptPosition } from './types.js';
import { aggregatePositions, type RawOrderItem } from './aggregate.js';
import { computeTaxBreakdown, computeTotalGross } from './format.js';
import { loadLogoFor } from '../logo/visibility.js';
export { buildDemoReceipt } from './demo.js';

/** Settings keys read for company info on the receipt. */
const COMPANY_KEYS = [
  'company_name', 'company_street', 'company_postal_code', 'company_city',
  'company_tax_number', 'company_vat_id',
  'receipt_prefix', 'system_serial',
] as const;

/** Returns the `ReceiptData` for the invoice identified by its public `receipt_token`, or null if not found. */
export async function loadReceiptByToken(token: string): Promise<ReceiptData | null> {
  return loadReceiptWhere('i.receipt_token = $1', [token]);
}

/**
 * Returns the `ReceiptData` for the invoice identified by its internal `id`,
 * or null if not found. Used by the session-authenticated admin endpoints
 * which look up invoices by id (rather than by the public token).
 *
 * @param id - The invoice primary key.
 * @returns Assembled receipt data, or null if no invoice with that id exists.
 */
export async function loadReceiptById(id: string): Promise<ReceiptData | null> {
  return loadReceiptWhere('i.id = $1', [id]);
}

/**
 * Shared loader used by the token-based public lookup and the id-based admin
 * lookup. The caller provides the `WHERE` predicate plus its parameters; the
 * rest of the receipt assembly is identical.
 *
 * @param whereClause - SQL predicate applied to the `invoice` row (alias `i`).
 * @param params - Bound parameters for the predicate.
 * @returns Assembled receipt data, or null if the predicate matches no row.
 */
async function loadReceiptWhere(whereClause: string, params: unknown[]): Promise<ReceiptData | null> {
  const inv = await query<{
    id: string; receipt_number: number; receipt_type: 'sales_receipt' | 'cancellation' | 'training';
    payment_method: 'cash' | 'card'; created_at: Date;
    register_name: string;
    tse_serial_number: string | null;
    tse_transaction_number: string | null;     // BIGINT comes back as string from pg
    tse_signature_counter: string | null;
    tse_signature: string | null;
    tse_start_time: Date | null;
    tse_end_time: Date | null;
  }>(`
    SELECT i.id, i.receipt_number, i.receipt_type, i.payment_method, i.created_at,
           r.name AS register_name,
           i.tse_serial_number, i.tse_transaction_number,
           i.tse_signature_counter, i.tse_signature,
           i.tse_start_time, i.tse_end_time
      FROM invoice i
      JOIN register r ON r.id = i.register_id
     WHERE ${whereClause}
  `, params);
  if (inv.rows.length === 0) return null;
  const row = inv.rows[0]!;

  const items = await query<RawOrderItem>(`
    SELECT article_name, tax_rate, tax_category, price, deposit_price, deposit_tax_rate, options
      FROM order_item
     WHERE invoice_id = $1 AND status IN ('paid', 'free')
     ORDER BY created_at
  `, [row.id]);

  const positions = aggregatePositions(items.rows);
  const settings = await loadCompanySettings();
  // Logo is target-specific: sales receipt vs. cancellation have separate flags.
  const logo = await loadLogoFor(row.receipt_type === 'cancellation' ? 'cancellation' : 'receipt');

  return assembleReceiptData(row, positions, settings, logo);
}

/** Settings shape consumed by `assembleReceiptData`. */
interface CompanySettings {
  name: string;
  addressLines: string[];
  taxNumber: string;
  vatId: string | null;
  receiptNumberPrefix: string;
  systemSerial: string;
}

/** Reads the company-related system settings into a typed object, with sensible empty defaults. */
async function loadCompanySettings(): Promise<CompanySettings> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [COMPANY_KEYS as unknown as string[]],
  );
  const map = new Map(result.rows.map((r) => [r.key, r.value]));
  const addressLines: string[] = [];
  const street = map.get('company_street'); if (street) addressLines.push(street);
  const cityLine = [map.get('company_postal_code'), map.get('company_city')].filter(Boolean).join(' ');
  if (cityLine) addressLines.push(cityLine);
  return {
    name: map.get('company_name') ?? '',
    addressLines,
    taxNumber: map.get('company_tax_number') ?? '',
    vatId: map.get('company_vat_id') ?? null,
    receiptNumberPrefix: map.get('receipt_prefix') ?? 'RE-',
    systemSerial: map.get('system_serial') ?? '(noch nicht initialisiert)',
  };
}

/** Combines the raw invoice row, the aggregated positions and the company settings into `ReceiptData`. */
function assembleReceiptData(
  row: {
    receipt_number: number; receipt_type: 'sales_receipt' | 'cancellation' | 'training';
    payment_method: 'cash' | 'card'; created_at: Date; register_name: string;
    tse_serial_number: string | null; tse_transaction_number: string | null;
    tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null;
  },
  positions: ReceiptPosition[],
  settings: CompanySettings,
  logo: { pdfPng: Buffer; pdfWidth: number; pdfHeight: number; pdfWidthFactor: number; escposBytes: Buffer } | null,
): ReceiptData {
  const isCancellation = row.receipt_type === 'cancellation';
  // For cancellation invoices, flip the sign on every amount the renderer
  // will print. The DB stores positive numbers (the aggregation layer derives
  // the sign from `receipt_type`); making it visually negative here ensures
  // the printed/PDF document cannot be mistaken for a normal sales receipt.
  const sign = isCancellation ? -1 : 1;
  const displayPositions: ReceiptPosition[] = positions.map((p) => ({
    ...p,
    unitPrice: p.unitPrice * sign,
    unitDeposit: p.unitDeposit === null ? null : p.unitDeposit * sign,
    lineGross: p.lineGross * sign,
  }));

  return {
    companyName: settings.name,
    companyAddressLines: settings.addressLines,
    taxNumber: settings.taxNumber,
    vatId: settings.vatId,
    systemSerial: settings.systemSerial,
    receiptNumber: `${settings.receiptNumberPrefix}${String(row.receipt_number).padStart(5, '0')}`,
    createdAt: row.created_at,
    registerName: row.register_name,
    paymentMethod: row.payment_method,
    isCancellation,
    logoPng:         logo?.pdfPng ?? null,
    logoWidth:       logo?.pdfWidth ?? 0,
    logoHeight:      logo?.pdfHeight ?? 0,
    logoWidthFactor: logo?.pdfWidthFactor ?? 0,
    logoEscPos:      logo?.escposBytes ?? null,
    positions: displayPositions,
    totalGross: computeTotalGross(displayPositions),
    taxBreakdown: computeTaxBreakdown(displayPositions),
    tseSerial: row.tse_serial_number,
    tseTransactionNumber: row.tse_transaction_number ? Number(row.tse_transaction_number) : null,
    tseSignatureCounter: row.tse_signature_counter ? Number(row.tse_signature_counter) : null,
    tseSignature: row.tse_signature,
    tseStartTime: row.tse_start_time,
    tseEndTime: row.tse_end_time,
  };
}
