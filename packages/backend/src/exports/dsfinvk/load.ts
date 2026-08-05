/** Loads everything `buildDsfinvkExport` needs for one Kassenabschluss (Z-Bon) from the database. */
import { query } from '../../db/client.js';
import { config } from '../../config.js';
import { getTseCertificateInfo } from '../../tse/certificateInfo.js';
import type { DsfinvkSource, SourceLineItem, SourceVorgang, TseSignatureSource } from './rows.js';

const TAX_RATE_DESCRIPTIONS: Record<number, string> = {
  19: 'Allgemeiner Steuersatz',
  7: 'Ermäßigter Steuersatz',
  0: 'Steuerfrei',
};

/** Raw order_item columns shared by every Vorgang type (invoice/service_order/order_cancellation positions). */
interface RawItemRow {
  article_id: string | null;
  article_name: string;
  article_category_name: string;
  tax_rate: string;
  price: string;
  deposit_price: string | null;
}

function toLineItem(row: RawItemRow): SourceLineItem {
  return {
    articleId: row.article_id,
    articleName: row.article_name,
    categoryName: row.article_category_name,
    taxRate: Number(row.tax_rate),
    priceEuros: Number(row.price),
    depositPriceEuros: row.deposit_price === null ? null : Number(row.deposit_price),
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
 * Scoping: invoices are matched via the persisted `invoice.daily_closing_id`
 * (set when the Z-Bon was created, see `routes/admin/closings.ts`).
 * `service_order`/`order_cancellation` have no such link yet (see
 * docs/Rechtliche-Anforderungen.md Abschnitt 6.7) — as a pragmatic
 * approximation, they're scoped to the same register and calendar day
 * (`business_date`) as the closing. For FairPOS's actual usage (closings
 * per calendar day, per event) this matches the invoices' own scope; it can
 * misattribute rows for a register closed more than once on the same day.
 *
 * @param closingId - The `daily_closing` primary key.
 * @returns The loaded source data, or `null` if the closing doesn't exist.
 */
export async function loadDsfinvkSource(closingId: string): Promise<DsfinvkSource | null> {
  const closingResult = await query<{
    id: string; register_id: string; register_name: string; z_number: string;
    created_at: Date; business_date: string;
  }>(
    `SELECT c.id, c.register_id, r.name AS register_name, c.z_number::text,
            c.created_at, to_char(c.business_date, 'YYYY-MM-DD') AS business_date
       FROM daily_closing c
       JOIN register r ON r.id = c.register_id
      WHERE c.id = $1`,
    [closingId],
  );
  const closing = closingResult.rows[0];
  if (!closing) return null;

  const settingsResult = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
    [['company_name', 'company_street', 'company_postal_code', 'company_city', 'company_tax_number', 'company_vat_id', 'system_serial']],
  );
  const settings = new Map(settingsResult.rows.map((r) => [r.key, r.value]));

  // ── Invoices (BON_TYP = Beleg) — persisted link via daily_closing_id. ──────
  // Plain SELECT with no join to order_item: a Bedienungskasse invoice can
  // combine order_items placed by different staff over several order rounds
  // (dining_table_id/user_id live on order_item, not on invoice), so joining
  // and GROUP-BY-ing here would silently multiply one invoice into several
  // Bonkopf rows whenever those items disagree. Table/operator are instead
  // resolved below from exactly one representative order_item per invoice.
  const invoicesResult = await query<{
    id: string; receipt_number: string; receipt_type: 'sales_receipt' | 'cancellation' | 'training';
    created_at: Date; payment_method: 'cash' | 'card'; cancels_invoice_id: string | null;
    tse_transaction_number: string | null; tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null; tse_serial_number: string | null;
  }>(
    `SELECT id, receipt_number::text, receipt_type, created_at, payment_method, cancels_invoice_id,
            tse_transaction_number::text, tse_signature_counter::text, tse_signature,
            tse_start_time, tse_end_time, tse_serial_number
       FROM invoice
      WHERE daily_closing_id = $1`,
    [closingId],
  );

  const invoiceItemsResult = await query<RawItemRow & { invoice_id: string }>(
    `SELECT invoice_id, article_id, article_name, article_category_name, tax_rate::text, price::text, deposit_price::text
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
  const invoiceContextResult = await query<{ invoice_id: string; table_name: string | null; user_id: string | null; user_name: string | null }>(
    `SELECT DISTINCT ON (oi.invoice_id) oi.invoice_id, t.name AS table_name, u.id AS user_id, u.name AS user_name
       FROM order_item oi
       LEFT JOIN dining_table t ON t.id = oi.dining_table_id
       LEFT JOIN "user" u ON u.id = oi.user_id
      WHERE oi.invoice_id = ANY($1)
      ORDER BY oi.invoice_id, oi.created_at`,
    [invoicesResult.rows.map((r) => r.id)],
  );
  const invoiceContextById = new Map(invoiceContextResult.rows.map((r) => [r.invoice_id, r]));

  const invoiceVorgaenge: SourceVorgang[] = invoicesResult.rows.map((inv) => {
    const context = invoiceContextById.get(inv.id);
    return {
      id: inv.id,
      bonTyp: 'Beleg',
      bonName: null,
      receiptNumber: Number(inv.receipt_number),
      createdAt: inv.created_at,
      isStornoBeleg: inv.receipt_type === 'cancellation' || inv.cancels_invoice_id !== null,
      diningTableName: context?.table_name ?? null,
      operatorUserId: context?.user_id ?? null,
      operatorUserName: context?.user_name ?? null,
      paymentMethod: inv.payment_method,
      tse: toTseSignature(inv),
      items: (invoiceItemsById.get(inv.id) ?? []).map(toLineItem),
    };
  });

  // ── service_order (BON_TYP = AVBestellung) — scoped by register + business_date. ──
  const ordersResult = await query<{
    id: string; created_at: Date; table_name: string | null; user_id: string | null; user_name: string | null;
    tse_transaction_number: string | null; tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null;
  }>(
    `SELECT so.id, so.created_at, t.name AS table_name, u.id AS user_id, u.name AS user_name,
            so.tse_transaction_number::text, so.tse_signature_counter::text, so.tse_signature,
            so.tse_start_time, so.tse_end_time
       FROM service_order so
       LEFT JOIN dining_table t ON t.id = so.dining_table_id
       LEFT JOIN "user" u ON u.id = so.user_id
      WHERE so.register_id = $1 AND so.created_at::date = $2::date`,
    [closing.register_id, closing.business_date],
  );
  const orderItemsResult = await query<RawItemRow & { service_order_id: string }>(
    `SELECT service_order_id, article_id, article_name, article_category_name, tax_rate::text, price::text, deposit_price::text
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
    bonTyp: 'AVBestellung',
    bonName: null,
    receiptNumber: null,
    createdAt: so.created_at,
    isStornoBeleg: false,
    diningTableName: so.table_name,
    operatorUserId: so.user_id,
    operatorUserName: so.user_name,
    paymentMethod: null,
    tse: toTseSignature(so),
    items: (orderItemsById.get(so.id) ?? []).map(toLineItem),
  }));

  // ── order_cancellation (BON_TYP = AVSonstige) — scoped by register + business_date. ──
  const cancellationsResult = await query<{
    id: string; created_at: Date; cancelled_by: string | null; cancelled_by_name: string | null;
    cancellation_reason_name: string;
    tse_transaction_number: string | null; tse_signature_counter: string | null; tse_signature: string | null;
    tse_start_time: Date | null; tse_end_time: Date | null;
  }>(
    `SELECT oc.id, oc.created_at, u.id AS cancelled_by, u.name AS cancelled_by_name,
            cr.name AS cancellation_reason_name,
            oc.tse_transaction_number::text, oc.tse_signature_counter::text, oc.tse_signature,
            oc.tse_start_time, oc.tse_end_time
       FROM order_cancellation oc
       LEFT JOIN "user" u ON u.id = oc.cancelled_by
       JOIN cancellation_reason cr ON cr.id = oc.cancellation_reason_id
      WHERE oc.register_id = $1 AND oc.created_at::date = $2::date`,
    [closing.register_id, closing.business_date],
  );
  const cancellationItemsResult = await query<RawItemRow & { order_cancellation_id: string }>(
    `SELECT order_cancellation_id, article_id, article_name, article_category_name, tax_rate::text, price::text, deposit_price::text
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
    bonTyp: 'AVSonstige',
    bonName: oc.cancellation_reason_name,
    receiptNumber: null,
    createdAt: oc.created_at,
    isStornoBeleg: false,
    diningTableName: null,
    operatorUserId: oc.cancelled_by,
    operatorUserName: oc.cancelled_by_name,
    paymentMethod: null,
    tse: toTseSignature(oc),
    items: (cancellationItemsById.get(oc.id) ?? []).map(toLineItem),
  }));

  const vorgaenge = [...invoiceVorgaenge, ...orderVorgaenge, ...cancellationVorgaenge]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const usedTaxRates = [...new Set(
    [...invoiceItemsResult.rows, ...orderItemsResult.rows, ...cancellationItemsResult.rows].map((r) => Number(r.tax_rate)),
  )].sort((a, b) => a - b);

  const tseSerial = [...invoicesResult.rows].map((r) => r.tse_serial_number).find((s) => s !== null) ?? null;
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
    taxRates: usedTaxRates.map((rate) => ({ rate, description: TAX_RATE_DESCRIPTIONS[rate] ?? `Steuersatz ${rate}%` })),
    vorgaenge,
  };
}
