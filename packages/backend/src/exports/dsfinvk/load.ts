/** Loads everything `buildDsfinvkExport` needs for one Kassenabschluss (Z-Bon) from the database. */
import { query } from '../../db/client.js';
import { config } from '../../config.js';
import { getTseCertificateInfo } from '../../tse/certificateInfo.js';
import { loadTaxRates, percentFor } from '../../tax/rates.js';
import type { DsfinvkSource, SourceLineItem, SourceVorgang, TseSignatureSource } from './rows.js';
import type { TaxCategory } from '@fairpos/shared';

/** Display order/description for `vat.csv` rows (Task #110 — category-based, not a raw percentage lookup). */
const CATEGORY_ORDER: TaxCategory[] = ['standard', 'reduced', 'zero'];
const CATEGORY_DESCRIPTIONS: Record<TaxCategory, string> = {
  standard: 'Allgemeiner Steuersatz',
  reduced: 'Ermäßigter Steuersatz',
  zero: 'Steuerfrei',
};

/** Raw order_item columns shared by every Vorgang type (invoice/service_order/order_cancellation positions). */
interface RawItemRow {
  article_id: string | null;
  article_name: string;
  article_category_name: string;
  tax_rate: string;
  tax_category: TaxCategory;
  price: string;
  deposit_price: string | null;
  deposit_tax_rate: string | null;
}

function toLineItem(row: RawItemRow): SourceLineItem {
  return {
    articleId: row.article_id,
    articleName: row.article_name,
    categoryName: row.article_category_name,
    taxRate: Number(row.tax_rate),
    taxCategory: row.tax_category,
    priceEuros: Number(row.price),
    depositPriceEuros: row.deposit_price === null ? null : Number(row.deposit_price),
    depositTaxRate: row.deposit_tax_rate === null ? null : Number(row.deposit_tax_rate),
  };
}

function toTseSignature(row: {
  tse_transaction_number: string | null; tse_signature_counter: string | null;
  tse_signature: string | null; tse_start_time: Date | null; tse_end_time: Date | null;
}): TseSignatureSource | null {
  if (row.tse_signature === null || row.tse_transaction_number === null || row.tse_start_time === null || row.tse_end_time === null) {
    return null;
  }
  return {
    transactionNumber: Number(row.tse_transaction_number),
    signatureCounter: Number(row.tse_signature_counter),
    signatureHex: row.tse_signature,
    startTime: row.tse_start_time,
    endTime: row.tse_end_time,
  };
}

/**
 * Loads the complete DSFinV-K source data for one `daily_closing`.
 *
 * Scoping: invoices, service_order and order_cancellation rows are all
 * matched via their persisted `daily_closing_id` (set when the Z-Bon was
 * created, see `routes/admin/closings.ts`) — an exact link, not an
 * approximation. `service_order`/`order_cancellation` only gained this
 * column in migration 0031 (Task #123); before that they were scoped via
 * register + calendar day (`business_date`), which could misattribute rows
 * when a register was closed more than once on the same day.
 *
 * @param closingId - The `daily_closing` primary key.
 * @returns The loaded source data, or `null` if the closing doesn't exist.
 */
export async function loadDsfinvkSource(closingId: string): Promise<DsfinvkSource | null> {
  const closingResult = await query<{
    id: string; register_id: string; register_name: string; register_is_training: boolean;
    z_number: string; created_at: Date; business_date: string;
  }>(
    `SELECT c.id, c.register_id, r.name AS register_name, r.is_training AS register_is_training,
            c.z_number::text,
            c.created_at, to_char(c.business_date, 'YYYY-MM-DD') AS business_date
       FROM daily_closing c
       JOIN register r ON r.id = c.register_id
      WHERE c.id = $1`,
    [closingId],
  );
  const closing = closingResult.rows[0];
  if (!closing) return null;

  // Task #130: every invoice/service_order/order_cancellation row that ever
  // gets `daily_closing_id` set to THIS closing's id was, by construction,
  // scoped to this same closing's `register_id` at that moment
  // (`closeRegister()` in routes/admin/closings.ts always filters
  // `WHERE register_id = $1` before assigning `daily_closing_id`) — so every
  // Vorgang loaded below belongs to this one register, and a single flag
  // read once here correctly classifies all of them as `AVTraining` (instead
  // of a separate register join per query).
  const isTrainingRegister = closing.register_is_training;

  const settingsResult = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [['company_name', 'company_street', 'company_postal_code', 'company_city', 'company_tax_number', 'company_vat_id', 'system_serial']],
  );
  const settings = new Map(settingsResult.rows.map((r) => [r.key, r.value]));

  // ── Invoices (BON_TYP = Beleg) — persisted link via daily_closing_id. ──────
  // Plain SELECT with no join to order_item: a Bedienungskasse invoice can
  // combine order_items placed by different staff over several order rounds
  // (dining_table_id/user_name live on order_item, not on invoice), so joining
  // and GROUP-BY-ing here would silently multiply one invoice into several
  // Bonkopf rows whenever those items disagree. Table/operator are instead
  // resolved below from exactly one representative order_item per invoice.
  const invoicesResult = await query<{
    id: string; receipt_number: string; receipt_type: 'sales_receipt' | 'cancellation' | 'training';
    created_at: Date; payment_method: 'cash' | 'card';
    tse_transaction_number: string | null; tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null; tse_serial_number: string | null;
  }>(
    `SELECT id, receipt_number::text, receipt_type, created_at, payment_method,
            tse_transaction_number::text, tse_signature_counter::text, tse_signature,
            tse_start_time, tse_end_time, tse_serial_number
       FROM invoice
      WHERE daily_closing_id = $1`,
    [closingId],
  );

  const invoiceItemsResult = await query<RawItemRow & { invoice_id: string }>(
    `SELECT invoice_id, article_id, article_name, article_category_name,
            tax_rate::text, tax_category, price::text, deposit_price::text, deposit_tax_rate::text
       FROM order_item
      WHERE invoice_id = ANY($1)`,
    [invoicesResult.rows.map((r) => r.id)],
  );
  const invoiceItemsById = new Map<string, RawItemRow[]>();
  for (const row of invoiceItemsResult.rows) {
    const list = invoiceItemsById.get(row.invoice_id) ?? [];
    list.push(row);
    invoiceItemsById.set(row.invoice_id, list);
  }

  // Representative table/operator per invoice: the earliest order_item, so
  // the choice is deterministic even when an invoice's items disagree.
  const invoiceContextResult = await query<{ invoice_id: string; table_name: string | null; user_name: string | null }>(
    `SELECT DISTINCT ON (oi.invoice_id) oi.invoice_id, t.name AS table_name, oi.user_name
       FROM order_item oi
       LEFT JOIN dining_table t ON t.id = oi.dining_table_id
      WHERE oi.invoice_id = ANY($1)
      ORDER BY oi.invoice_id, oi.created_at`,
    [invoicesResult.rows.map((r) => r.id)],
  );
  const invoiceContextById = new Map(invoiceContextResult.rows.map((r) => [r.invoice_id, r]));

  const invoiceVorgaenge: SourceVorgang[] = invoicesResult.rows.map((inv) => {
    const context = invoiceContextById.get(inv.id);
    return {
      id: inv.id,
      bonTyp: isTrainingRegister ? 'AVTraining' : 'Beleg',
      bonName: null,
      receiptNumber: Number(inv.receipt_number),
      createdAt: inv.created_at,
      isBonstorno: inv.receipt_type === 'cancellation',
      diningTableName: context?.table_name ?? null,
      // No stable operator id survives Task #97 (user rows are deletable, the
      // name is a text snapshot) — left null rather than reusing the name as
      // a fake id, so BEDIENER_ID honestly reflects that no such id exists.
      operatorUserId: null,
      operatorUserName: context?.user_name ?? null,
      paymentMethod: inv.payment_method,
      tse: toTseSignature(inv),
      items: (invoiceItemsById.get(inv.id) ?? []).map(toLineItem),
    };
  });

  // ── service_order (BON_TYP = AVBestellung) — scoped via daily_closing_id. ──
  const ordersResult = await query<{
    id: string; created_at: Date; table_name: string | null; user_name: string | null;
    tse_transaction_number: string | null; tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null; tse_serial_number: string | null;
  }>(
    `SELECT so.id, so.created_at, t.name AS table_name, so.user_name,
            so.tse_transaction_number::text, so.tse_signature_counter::text, so.tse_signature,
            so.tse_start_time, so.tse_end_time, so.tse_serial_number
       FROM service_order so
       LEFT JOIN dining_table t ON t.id = so.dining_table_id
      WHERE so.daily_closing_id = $1`,
    [closingId],
  );
  const orderItemsResult = await query<RawItemRow & { service_order_id: string }>(
    `SELECT service_order_id, article_id, article_name, article_category_name,
            tax_rate::text, tax_category, price::text, deposit_price::text, deposit_tax_rate::text
       FROM order_item
      WHERE service_order_id = ANY($1)`,
    [ordersResult.rows.map((r) => r.id)],
  );
  const orderItemsById = new Map<string, RawItemRow[]>();
  for (const row of orderItemsResult.rows) {
    const list = orderItemsById.get(row.service_order_id) ?? [];
    list.push(row);
    orderItemsById.set(row.service_order_id, list);
  }
  const orderVorgaenge: SourceVorgang[] = ordersResult.rows.map((so) => ({
    id: so.id,
    bonTyp: isTrainingRegister ? 'AVTraining' : 'AVBestellung',
    bonName: null,
    receiptNumber: null,
    createdAt: so.created_at,
    isBonstorno: false,
    diningTableName: so.table_name,
    operatorUserId: null, // no stable id survives Task #97, see invoice mapping above
    operatorUserName: so.user_name,
    paymentMethod: null,
    tse: toTseSignature(so),
    items: (orderItemsById.get(so.id) ?? []).map(toLineItem),
  }));

  // ── order_cancellation (BON_TYP = AVSonstige) — scoped via daily_closing_id. ──
  const cancellationsResult = await query<{
    id: string; created_at: Date; cancelled_by_name: string | null;
    cancellation_reason_name: string;
    tse_transaction_number: string | null; tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null; tse_serial_number: string | null;
  }>(
    `SELECT oc.id, oc.created_at, oc.cancelled_by_name,
            oc.cancellation_reason_name,
            oc.tse_transaction_number::text, oc.tse_signature_counter::text, oc.tse_signature,
            oc.tse_start_time, oc.tse_end_time, oc.tse_serial_number
       FROM order_cancellation oc
      WHERE oc.daily_closing_id = $1`,
    [closingId],
  );
  const cancellationItemsResult = await query<RawItemRow & { order_cancellation_id: string }>(
    `SELECT order_cancellation_id, article_id, article_name, article_category_name,
            tax_rate::text, tax_category, price::text, deposit_price::text, deposit_tax_rate::text
       FROM order_item
      WHERE order_cancellation_id = ANY($1)`,
    [cancellationsResult.rows.map((r) => r.id)],
  );
  const cancellationItemsById = new Map<string, RawItemRow[]>();
  for (const row of cancellationItemsResult.rows) {
    const list = cancellationItemsById.get(row.order_cancellation_id) ?? [];
    list.push(row);
    cancellationItemsById.set(row.order_cancellation_id, list);
  }
  const cancellationVorgaenge: SourceVorgang[] = cancellationsResult.rows.map((oc) => ({
    id: oc.id,
    bonTyp: isTrainingRegister ? 'AVTraining' : 'AVSonstige',
    bonName: oc.cancellation_reason_name,
    receiptNumber: null,
    createdAt: oc.created_at,
    isBonstorno: false,
    diningTableName: null,
    operatorUserId: null, // no stable id survives Task #97, see invoice mapping above
    operatorUserName: oc.cancelled_by_name,
    paymentMethod: null,
    tse: toTseSignature(oc),
    items: (cancellationItemsById.get(oc.id) ?? []).map(toLineItem),
  }));

  const vorgaenge = [...invoiceVorgaenge, ...orderVorgaenge, ...cancellationVorgaenge]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Distinct VAT categories actually present in this closing (Task #110) —
  // a deposit always counts as `standard` (Task #113) even when every sold
  // article itself is `reduced`/`zero`, so `vat.csv` doesn't end up missing
  // the Regelsteuersatz row whenever that happens.
  const allItemRows = [...invoiceItemsResult.rows, ...orderItemsResult.rows, ...cancellationItemsResult.rows];
  const usedCategories = new Set<TaxCategory>();
  for (const row of allItemRows) {
    usedCategories.add(row.tax_category);
    if (row.deposit_price !== null && Number(row.deposit_price) !== 0) usedCategories.add('standard');
  }
  const taxRates = await loadTaxRates();

  // D-074 (2026-09-12): must also check service_order/order_cancellation,
  // not just invoice — a closing made up entirely of AVBestellung/AVSonstige
  // Vorgänge (no Beleg at all) still gets those signed by the TSE and has its
  // own tse_serial_number per row, but previously only `invoice` was checked
  // here, so tse.csv (Stamm_TSE) was silently omitted from the whole export
  // even though transactions_tse.csv referenced a TSE_ID with no matching
  // master row — found live against a real export missing tse.csv entirely.
  const tseSerial = [...invoicesResult.rows, ...ordersResult.rows, ...cancellationsResult.rows]
    .map((r) => r.tse_serial_number).find((s) => s !== null) ?? null;
  // Best-effort — getTseCertificateInfo() never throws, returns null when the
  // TSE is unconfigured/unreachable (see rows.ts, which leaves the tse.csv
  // fields empty in that case rather than failing the whole export).
  const tseCertificate = await getTseCertificateInfo();

  return {
    closing: {
      zNumber: Number(closing.z_number),
      createdAt: closing.created_at,
      businessDate: closing.business_date,
      firstVorgangId: vorgaenge[0]?.id ?? '',
      lastVorgangId: vorgaenge[vorgaenge.length - 1]?.id ?? '',
    },
    registerId: closing.register_id,
    registerName: closing.register_name,
    systemSerial: settings.get('system_serial') ?? '',
    tseClientId: config.tseClientId,
    tseSerial,
    tseCertificate,
    company: {
      name: settings.get('company_name') ?? '',
      street: settings.get('company_street') ?? '',
      postalCode: settings.get('company_postal_code') ?? '',
      city: settings.get('company_city') ?? '',
      taxNumber: settings.get('company_tax_number') ?? '',
      vatId: settings.get('company_vat_id') ?? null,
    },
    taxRates: CATEGORY_ORDER
      .filter((category) => usedCategories.has(category))
      .map((category) => ({
        category, rate: percentFor(category, taxRates), description: CATEGORY_DESCRIPTIONS[category],
      })),
    vorgaenge,
  };
}
