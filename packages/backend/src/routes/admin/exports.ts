/** Export endpoints: Excel (Tagesexport + Veranstaltungsexport), DSFinV-K, and Rechnungs-PDFs (ZIP). */

import type { FastifyInstance } from 'fastify';
import { ZipArchive } from 'archiver';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { pickDefaultEventId } from '../../reports/event-select.js';
import { buildExportRows, type ExportSourceRow } from '../../exports/rows.js';
import { buildExcelWorkbook } from '../../exports/workbook.js';
import { loadDsfinvkSource } from '../../exports/dsfinvk/load.js';
import { buildDsfinvkExport } from '../../exports/dsfinvk/rows.js';
import { buildDsfinvkZip } from '../../exports/dsfinvk/zip.js';
import { loadReceiptById } from '../../receipt/data.js';
import { renderReceiptPdf } from '../../receipt/pdf.js';

/**
 * Reads the configured receipt-number prefix from system_setting. Empty string
 * fallback so the export still works on a freshly-bootstrapped DB.
 *
 * @returns The prefix that gets prepended to the padded sequence number.
 */
async function readReceiptPrefix(): Promise<string> {
  const result = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = 'receipt_prefix'`,
  );
  return result.rows[0]?.value ?? '';
}

/**
 * Loads invoice + order_item rows in the inclusive-exclusive `[from, to)` window.
 * Only `sales_receipt` invoices contribute — cancellation/training invoices are not part
 * of the standard sales export.
 *
 * @param from - ISO timestamp marking the start of the window (inclusive).
 * @param to   - ISO timestamp marking the end of the window (exclusive).
 * @returns Raw rows ready to be aggregated by `buildExportRows`.
 */
async function loadExportSource(from: string, to: string): Promise<ExportSourceRow[]> {
  const result = await query<{
    invoice_id: string;
    receipt_number: string;
    invoice_created_at: Date;
    table_name: string | null;
    ordering_user_name: string | null;
    register_name: string;
    article_name: string;
    options: string | null;
    price: string;
    deposit_price: string | null;
    tax_rate: string;
  }>(`
    SELECT i.id                   AS invoice_id,
           i.receipt_number::text AS receipt_number,
           i.created_at           AS invoice_created_at,
           t.name                 AS table_name,
           u.name                 AS ordering_user_name,
           r.name                 AS register_name,
           oi.article_name,
           oi.options,
           oi.price::text,
           oi.deposit_price::text,
           oi.tax_rate::text
      FROM invoice i
      JOIN order_item oi ON oi.invoice_id = i.id
      JOIN register r ON r.id = i.register_id
      LEFT JOIN dining_table t ON t.id = oi.dining_table_id
      LEFT JOIN "user" u ON u.id = oi.user_id
     WHERE i.created_at >= $1 AND i.created_at < $2
       AND i.receipt_type = 'sales_receipt'
       AND oi.status IN ('paid', 'free')
     ORDER BY i.created_at, i.id, oi.created_at
  `, [from, to]);

  return result.rows.map((r) => ({
    invoice_id: r.invoice_id,
    receipt_number: Number(r.receipt_number),
    invoice_created_at: r.invoice_created_at,
    table_name: r.table_name,
    ordering_user_name: r.ordering_user_name,
    register_name: r.register_name,
    article_name: r.article_name,
    options: r.options,
    price: r.price,
    deposit_price: r.deposit_price,
    tax_rate: r.tax_rate,
  }));
}

/**
 * Resolves an event id (explicit or default) and returns the row plus its `[start, end)` range.
 *
 * @param eventId - Optional explicit selection from the request.
 * @returns Event with timestamps as ISO strings, or `null` if no events exist at all.
 */
async function resolveEvent(eventId: string | undefined): Promise<{ id: string; name: string; start: string; end: string } | null> {
  if (eventId) {
    const result = await query<{ id: string; name: string; start_time: Date; end_time: Date }>(
      `SELECT id, name, start_time, end_time FROM event WHERE id = $1`,
      [eventId],
    );
    const row = result.rows[0];
    if (row) {
      return { id: row.id, name: row.name, start: row.start_time.toISOString(), end: row.end_time.toISOString() };
    }
  }
  const all = await query<{ id: string; name: string; start_time: Date; end_time: Date }>(
    `SELECT id, name, start_time, end_time FROM event`,
  );
  const id = pickDefaultEventId(all.rows, new Date());
  if (!id) return null;
  const row = all.rows.find((e) => e.id === id);
  if (!row) return null;
  return { id: row.id, name: row.name, start: row.start_time.toISOString(), end: row.end_time.toISOString() };
}

/**
 * Validates a `YYYY-MM-DD` date string and returns the corresponding `[from, to)` window
 * in the server's local timezone. Returns null if the input is malformed.
 *
 * @param dateStr - The date to convert.
 * @returns The day's start (00:00) and the next day's start as ISO strings, or null.
 */
function dayRange(dateStr: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parts = dateStr.split('-').map(Number);
  const y = parts[0]!, m = parts[1]!, d = parts[2]!;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Suggests a safe filename for the export by replacing characters that confuse browsers / file systems.
 *
 * @param input - Raw filename including extension.
 * @returns Filename with whitespace collapsed and disallowed characters stripped.
 */
function safeFilename(input: string): string {
  return input.replace(/[\s/\\:*?"<>|]+/g, '_').replace(/_+/g, '_');
}

/**
 * Loads every invoice's id in the inclusive-exclusive `[from, to)` window,
 * across all receipt types (sales_receipt, cancellation, training) — unlike
 * the Excel sales export, this is meant as a complete archival record of
 * every issued receipt, not a business-reporting view.
 *
 * @param from - ISO timestamp marking the start of the window (inclusive).
 * @param to   - ISO timestamp marking the end of the window (exclusive).
 * @returns Invoice ids, ordered by receipt number.
 */
async function loadInvoiceIdsInRange(from: string, to: string): Promise<string[]> {
  const result = await query<{ id: string }>(`
    SELECT id FROM invoice
     WHERE created_at >= $1 AND created_at < $2
     ORDER BY receipt_number
  `, [from, to]);
  return result.rows.map((r) => r.id);
}

/**
 * Renders one PDF per invoice and packages them into a single ZIP archive,
 * one entry per invoice named after its (formatted) receipt number.
 *
 * @param invoiceIds - Invoice ids to include, in the desired file order.
 * @returns The complete ZIP archive as a Buffer.
 */
async function buildInvoicesZip(invoiceIds: string[]): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  for (const id of invoiceIds) {
    const data = await loadReceiptById(id);
    if (!data) continue; // defends against a concurrent delete between the id query above and here — shouldn't happen in practice (invoices are never deleted)
    const pdf = await renderReceiptPdf(data);
    archive.append(pdf, { name: `${safeFilename(data.receiptNumber)}.pdf` });
  }

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

/**
 * Registers `/api/admin/exports/*` routes for the Excel exports.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function exportsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/exports/excel/event — full-event sales export as an .xlsx file.
   * Query parameters: `event_id` (optional — defaults to current/last event).
   */
  app.get<{ Querystring: { event_id?: string } }>('/excel/event', async (req, reply) => {
    const ev = await resolveEvent(req.query.event_id);
    if (!ev) return reply.status(404).send({ error: 'Keine Veranstaltung verfügbar' });

    const source = await loadExportSource(ev.start, ev.end);
    const rows = buildExportRows(source, await readReceiptPrefix());
    const subtitleStart = new Date(ev.start).toLocaleDateString('de-DE');
    const subtitleEnd = new Date(ev.end).toLocaleDateString('de-DE');
    const buf = await buildExcelWorkbook({
      sheetName: ev.name.slice(0, 31),
      title: `Veranstaltung: ${ev.name}`,
      subtitle: `${subtitleStart} – ${subtitleEnd}`,
    }, rows);

    const filename = safeFilename(`fairpos_${ev.name}.xlsx`);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buf);
  });

  /**
   * GET /api/admin/exports/excel/day — single-day sales export as an .xlsx file.
   * Query parameters:
   *   - `date` (required) in `YYYY-MM-DD` form, interpreted in the server's local timezone.
   *   - `event_id` (optional) — included only for symmetry / future filtering; the day
   *     range is independent of the event boundaries.
   */
  app.get<{ Querystring: { date?: string; event_id?: string } }>('/excel/day', async (req, reply) => {
    if (!req.query.date) return reply.status(400).send({ error: 'Datum erforderlich (YYYY-MM-DD)' });
    const range = dayRange(req.query.date);
    if (!range) return reply.status(400).send({ error: 'Ungültiges Datum (erwartet YYYY-MM-DD)' });

    const source = await loadExportSource(range.from, range.to);
    const rows = buildExportRows(source, await readReceiptPrefix());

    const dateLabel = new Date(range.from).toLocaleDateString('de-DE');
    const buf = await buildExcelWorkbook({
      sheetName: `Tag ${req.query.date}`,
      title: 'Tagesexport',
      subtitle: dateLabel,
    }, rows);

    const filename = safeFilename(`fairpos_tag_${req.query.date}.xlsx`);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buf);
  });

  /**
   * GET /api/admin/exports/dsfinvk/:closingId — DSFinV-K export for one
   * Kassenabschluss (Z-Bon), as a ZIP archive (CSV files + index.xml).
   * See docs/Rechtliche-Anforderungen.md Abschnitt 6 for the specification
   * this implements, including known scoping simplifications and the two
   * fields (TSE certificate/signature algorithm) not yet available.
   */
  app.get<{ Params: { closingId: string } }>('/dsfinvk/:closingId', async (req, reply) => {
    const source = await loadDsfinvkSource(req.params.closingId);
    if (!source) return reply.status(404).send({ error: 'Kassenabschluss nicht gefunden' });

    const data = buildDsfinvkExport(source);
    const zip = await buildDsfinvkZip(data);

    const filename = safeFilename(`dsfinvk_${source.registerName}_z${source.closing.zNumber}.zip`);
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(zip);
  });

  /**
   * GET /api/admin/exports/invoices/day — one PDF per invoice issued on a
   * single calendar day, packaged as a ZIP. Includes every receipt type
   * (sales_receipt, cancellation, training) — a complete archival record,
   * not a business-reporting view.
   * Query parameters: `date` (required) in `YYYY-MM-DD` form.
   */
  app.get<{ Querystring: { date?: string } }>('/invoices/day', async (req, reply) => {
    if (!req.query.date) return reply.status(400).send({ error: 'Datum erforderlich (YYYY-MM-DD)' });
    const range = dayRange(req.query.date);
    if (!range) return reply.status(400).send({ error: 'Ungültiges Datum (erwartet YYYY-MM-DD)' });

    const invoiceIds = await loadInvoiceIdsInRange(range.from, range.to);
    if (invoiceIds.length === 0) return reply.status(404).send({ error: 'Keine Rechnungen an diesem Tag' });
    const zip = await buildInvoicesZip(invoiceIds);

    const filename = safeFilename(`fairpos_rechnungen_${req.query.date}.zip`);
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(zip);
  });

  /**
   * GET /api/admin/exports/invoices/event — one PDF per invoice issued
   * during a Veranstaltung, packaged as a ZIP. Same scoping semantics as
   * `/invoices/day` above, just windowed by the event's `[start, end)`.
   * Query parameters: `event_id` (optional — defaults to current/last event).
   */
  app.get<{ Querystring: { event_id?: string } }>('/invoices/event', async (req, reply) => {
    const ev = await resolveEvent(req.query.event_id);
    if (!ev) return reply.status(404).send({ error: 'Keine Veranstaltung verfügbar' });

    const invoiceIds = await loadInvoiceIdsInRange(ev.start, ev.end);
    if (invoiceIds.length === 0) return reply.status(404).send({ error: 'Keine Rechnungen in dieser Veranstaltung' });
    const zip = await buildInvoicesZip(invoiceIds);

    const filename = safeFilename(`fairpos_rechnungen_${ev.name}.zip`);
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(zip);
  });
}
