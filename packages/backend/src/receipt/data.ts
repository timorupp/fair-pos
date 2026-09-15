/** Loads receipt data from the database and assembles the structured `ReceiptData` consumed by the renderers. */

import { query } from '../db/client.js';
import type { ReceiptData, ReceiptPosition } from './types.js';
import { aggregatePositions, type RawOrderItem } from './aggregate.js';
import { computeTaxBreakdown, computeTotalGross } from './format.js';
import { isLogoEnabledFor, loadLogoFor, type LogoTarget } from '../logo/visibility.js';
import { ensureLogoVersion, loadCompanyLogo, loadLogoVersion, type CompanyLogo } from '../logo/logo.js';
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
    register_name: string; register_is_training: boolean;
    tse_transaction_number: string | null;     // BIGINT comes back as string from pg
    tse_signature_counter: string | null;
    tse_signature: string | null;
    tse_start_time: Date | null;
    tse_end_time: Date | null;
    company_name: string | null;
    company_street: string | null;
    company_postal_code: string | null;
    company_city: string | null;
    company_tax_number: string | null;
    company_vat_id: string | null;
    logo_version_id: string | null;
  }>(`
    SELECT i.id, i.receipt_number, i.receipt_type, i.payment_method, i.created_at,
           r.name AS register_name, r.is_training AS register_is_training,
           i.tse_transaction_number,
           i.tse_signature_counter, i.tse_signature,
           i.tse_start_time, i.tse_end_time,
           i.company_name, i.company_street, i.company_postal_code, i.company_city,
           i.company_tax_number, i.company_vat_id, i.logo_version_id
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
  const logoTarget: LogoTarget = row.receipt_type === 'cancellation' ? 'cancellation' : 'receipt';

  // Task #112 (D-058): prefer the snapshot taken at sale time over the live
  // settings, so an invoice keeps showing the company data/logo that were
  // actually current when it was sold, even if an admin changes them later.
  // `company_name` is only ever null for an invoice created before this fix
  // shipped (never for an empty-but-configured name, see
  // snapshotCompanyDataForInvoice) — such pre-migration invoices have no
  // snapshot to fall back to and keep the previous (live-lookup) behaviour.
  // `receiptNumberPrefix`/`systemSerial` are out of this fix's scope (neither
  // realistically changes after initial setup) and always come live.
  const liveSettings = await loadCompanySettings();
  const settings: CompanySettings = row.company_name !== null
    ? {
        name: row.company_name,
        addressLines: buildAddressLines(row.company_street, row.company_postal_code, row.company_city),
        taxNumber: row.company_tax_number ?? '',
        vatId: row.company_vat_id,
        receiptNumberPrefix: liveSettings.receiptNumberPrefix,
        systemSerial: liveSettings.systemSerial,
      }
    : liveSettings;
  const logo: CompanyLogo | null = row.company_name !== null
    ? (row.logo_version_id !== null ? await loadLogoVersion(row.logo_version_id) : null)
    : await loadLogoFor(logoTarget);
  const table = await loadTableInfo(row.id);

  return assembleReceiptData(row, positions, settings, logo, table);
}

/**
 * Looks up the dining table and earliest-order time for a Bedienungskasse
 * invoice, or `null` for a Bonkasse walk-up sale (no `order_item` on the
 * invoice carries a `dining_table_id`). The earliest order time prefers the
 * originating `service_order`'s own TSE start time (the actual signed
 * `Bestellung-V1` moment per DSFinV-K Tz. 2.7.2) and falls back to
 * `service_order.created_at`/`order_item.created_at` when the TSE wasn't
 * configured or signing failed.
 *
 * @param invoiceId - The invoice to look up.
 * @returns Table name + earliest order timestamp, or `null` if this invoice has no dining-table items.
 */
async function loadTableInfo(invoiceId: string): Promise<{ name: string; firstOrderTime: Date } | null> {
  const result = await query<{ table_name: string; first_order_time: Date }>(`
    SELECT dt.name AS table_name,
           MIN(COALESCE(so.tse_start_time, so.created_at, oi.created_at)) AS first_order_time
      FROM order_item oi
      LEFT JOIN dining_table dt ON dt.id = oi.dining_table_id
      LEFT JOIN service_order so ON so.id = oi.service_order_id
     WHERE oi.invoice_id = $1 AND oi.dining_table_id IS NOT NULL
     GROUP BY dt.name
  `, [invoiceId]);
  if (result.rows.length === 0) return null;
  return { name: result.rows[0]!.table_name, firstOrderTime: result.rows[0]!.first_order_time };
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

/** Builds the printed address block from its three parts, omitting empty lines — shared by the live and snapshot paths. */
function buildAddressLines(street: string | null, postalCode: string | null, city: string | null): string[] {
  const addressLines: string[] = [];
  if (street) addressLines.push(street);
  const cityLine = [postalCode, city].filter(Boolean).join(' ');
  if (cityLine) addressLines.push(cityLine);
  return addressLines;
}

/** Reads the company-related system settings into a typed object, with sensible empty defaults. */
async function loadCompanySettings(): Promise<CompanySettings> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [COMPANY_KEYS as unknown as string[]],
  );
  const map = new Map(result.rows.map((r) => [r.key, r.value]));
  return {
    name: map.get('company_name') ?? '',
    addressLines: buildAddressLines(map.get('company_street') ?? null, map.get('company_postal_code') ?? null, map.get('company_city') ?? null),
    taxNumber: map.get('company_tax_number') ?? '',
    vatId: map.get('company_vat_id') ?? null,
    receiptNumberPrefix: map.get('receipt_prefix') ?? 'RE-',
    systemSerial: map.get('system_serial') ?? '(noch nicht initialisiert)',
  };
}

/** Company data + logo reference to freeze onto a new `invoice` row at sale time — see {@link snapshotCompanyDataForInvoice}. */
export interface CompanySnapshot {
  companyName: string;
  companyStreet: string;
  companyPostalCode: string;
  companyCity: string;
  companyTaxNumber: string;
  companyVatId: string | null;
  logoVersionId: string | null;
}

/**
 * Reads the currently-active company data and (if enabled for `target`) the
 * currently-active logo, so a new invoice can freeze them onto its own row
 * at the moment of sale (Task #112/D-058) — a later change to the company
 * settings or the logo must not retroactively alter how an already-sold
 * receipt renders on PDF/reprint. Call this once per new invoice, before or
 * alongside its `INSERT`.
 *
 * @param target - Which document type this invoice will render as
 *   (`'cancellation'` vs. `'receipt'`), so the correct logo-visibility flag
 *   is checked — mirrors the target selection in `loadReceiptWhere()`.
 * @returns The values to insert alongside the new invoice row.
 */
export async function snapshotCompanyDataForInvoice(target: LogoTarget): Promise<CompanySnapshot> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [['company_name', 'company_street', 'company_postal_code', 'company_city', 'company_tax_number', 'company_vat_id']],
  );
  const map = new Map(result.rows.map((r) => [r.key, r.value]));
  const logo = (await isLogoEnabledFor(target)) ? await loadCompanyLogo() : null;
  const logoVersionId = await ensureLogoVersion(logo);
  return {
    companyName: map.get('company_name') ?? '',
    companyStreet: map.get('company_street') ?? '',
    companyPostalCode: map.get('company_postal_code') ?? '',
    companyCity: map.get('company_city') ?? '',
    companyTaxNumber: map.get('company_tax_number') ?? '',
    companyVatId: map.get('company_vat_id') ?? null,
    logoVersionId,
  };
}

/** Combines the raw invoice row, the aggregated positions and the company settings into `ReceiptData`. */
function assembleReceiptData(
  row: {
    receipt_number: number; receipt_type: 'sales_receipt' | 'cancellation' | 'training';
    payment_method: 'cash' | 'card'; created_at: Date; register_name: string;
    register_is_training: boolean;
    tse_transaction_number: string | null;
    tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null;
  },
  positions: ReceiptPosition[],
  settings: CompanySettings,
  logo: { pdfPng: Buffer; pdfWidth: number; pdfHeight: number; pdfWidthFactor: number; escposBytes: Buffer } | null,
  table: { name: string; firstOrderTime: Date } | null,
): ReceiptData {
  const isCancellation = row.receipt_type === 'cancellation';
  // `positions` already carry their own sign (D-068, 2026-09-12) — a
  // Bonstorno's `order_item.price`/`deposit_price` are stored negative from
  // the moment they're created (`routes/admin/cancellations.ts`), so the
  // printed/PDF receipt naturally shows negative amounts without any
  // transformation here. `isCancellation` is kept only for labelling
  // ("Stornobeleg" vs. "Beleg", see `receipt/blocks.ts`), not for sign.
  const displayPositions: ReceiptPosition[] = positions;

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
    isTraining: row.register_is_training,
    tableName: table?.name ?? null,
    firstOrderTime: table?.firstOrderTime ?? null,
    logoPng:         logo?.pdfPng ?? null,
    logoWidth:       logo?.pdfWidth ?? 0,
    logoHeight:      logo?.pdfHeight ?? 0,
    logoWidthFactor: logo?.pdfWidthFactor ?? 0,
    logoEscPos:      logo?.escposBytes ?? null,
    positions: displayPositions,
    totalGross: computeTotalGross(displayPositions),
    taxBreakdown: computeTaxBreakdown(displayPositions),
    tseTransactionNumber: row.tse_transaction_number ? Number(row.tse_transaction_number) : null,
    tseSignatureCounter: row.tse_signature_counter ? Number(row.tse_signature_counter) : null,
    tseSignature: row.tse_signature,
    tseStartTime: row.tse_start_time,
    tseEndTime: row.tse_end_time,
  };
}
