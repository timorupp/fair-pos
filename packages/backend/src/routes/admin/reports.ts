/**
 * Admin report endpoints. Each report accepts an optional `event_id` query parameter;
 * when omitted, the server picks the default event via `pickDefaultEventId`.
 * Date filtering uses each event's `[start_time, end_time)` interval.
 */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { pickDefaultEventId, type EventLike } from '../../reports/event-select.js';
import { formatReceiptNumber, readReceiptPrefix } from '../../receipt/format-receipt-number.js';

/**
 * Returns the time range (ISO strings) of the event identified by `eventId`, or `null`
 * when no event was found.
 *
 * @param eventId - Primary key of the event.
 * @returns `{ start, end }` ISO timestamps, or `null` if the event id is unknown.
 */
async function loadEventRange(eventId: string): Promise<{ start: string; end: string } | null> {
  const result = await query<{ start_time: Date; end_time: Date }>(
    `SELECT start_time, end_time FROM event WHERE id = $1`,
    [eventId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { start: row.start_time.toISOString(), end: row.end_time.toISOString() };
}

/**
 * Resolves the event to report on:
 *   - explicit `eventId` parameter wins if it matches a row;
 *   - otherwise pick the default event (current → most-recent-past);
 *   - returns null if no events exist at all.
 *
 * @param eventId - Optional explicit selection from the request.
 * @returns `{ id, start, end }` of the chosen event, or `null`.
 */
async function resolveReportEvent(
  eventId: string | undefined,
): Promise<{ id: string; start: string; end: string } | null> {
  if (eventId) {
    const range = await loadEventRange(eventId);
    if (range) return { id: eventId, ...range };
  }
  const all = await query<EventLike & { id: string }>(
    `SELECT id, start_time, end_time FROM event`,
  );
  const id = pickDefaultEventId(all.rows, new Date());
  if (!id) return null;
  const range = await loadEventRange(id);
  if (!range) return null;
  return { id, ...range };
}

/**
 * Registers `/api/admin/reports/*` routes.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function reportsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/reports/events — minimal event list for the selector dropdown.
   * Annotates each entry with `is_current` so the UI can highlight it.
   */
  app.get('/events', async (_req, reply) => {
    const result = await query<{ id: string; name: string; start_time: Date; end_time: Date }>(
      `SELECT id, name, start_time, end_time FROM event ORDER BY start_time DESC`,
    );
    const defaultId = pickDefaultEventId(result.rows, new Date());
    return reply.send({
      events: result.rows,
      default_event_id: defaultId,
    });
  });

  /**
   * GET /api/admin/reports/open-positions — open order items grouped by table.
   * `event_id` is accepted but currently ignored: open positions are always
   * "now" data, not historical. Kept for symmetry with the other endpoints.
   */
  app.get<{ Querystring: { event_id?: string } }>('/open-positions', async (_req, reply) => {
    const result = await query<{
      table_id: string | null; table_name: string | null;
      article_name: string; options: string | null;
      tax_rate: string; price: string; deposit_price: string | null;
      qty: string; line_gross: string;
      oldest_order: Date;
    }>(`
      SELECT oi.dining_table_id AS table_id,
             t.name             AS table_name,
             oi.article_name,
             oi.options,
             oi.tax_rate::text,
             oi.price::text,
             oi.deposit_price::text,
             COUNT(*)::text                                                   AS qty,
             (COUNT(*) * (oi.price + COALESCE(oi.deposit_price, 0)))::text   AS line_gross,
             MIN(oi.created_at) AS oldest_order
        FROM order_item oi
        LEFT JOIN dining_table t ON t.id = oi.dining_table_id
       WHERE oi.status = 'open'
       GROUP BY oi.dining_table_id, t.name, oi.article_name, oi.options,
                oi.tax_rate, oi.price, oi.deposit_price
       ORDER BY t.name NULLS LAST, oldest_order
    `);

    // Re-structure into one block per table for easier rendering.
    const tables = new Map<string, {
      table_id: string | null; table_name: string;
      total_gross: number;
      positions: {
        name: string; options: string | null; qty: number;
        unit_price: number; unit_deposit: number | null;
        tax_rate: number; line_gross: number;
        oldest_order: string;
      }[];
    }>();
    for (const row of result.rows) {
      const key = row.table_id ?? '__no_table__';
      if (!tables.has(key)) {
        tables.set(key, {
          table_id: row.table_id,
          table_name: row.table_name ?? '(ohne Tisch)',
          total_gross: 0, positions: [],
        });
      }
      const block = tables.get(key)!;
      const lineGross = Number(row.line_gross);
      block.total_gross = Math.round((block.total_gross + lineGross) * 100) / 100;
      block.positions.push({
        name: row.article_name,
        options: row.options,
        qty: Number(row.qty),
        unit_price: Number(row.price),
        unit_deposit: row.deposit_price === null ? null : Number(row.deposit_price),
        tax_rate: Number(row.tax_rate),
        line_gross: lineGross,
        oldest_order: row.oldest_order.toISOString(),
      });
    }
    return reply.send({ tables: [...tables.values()] });
  });

  /**
   * GET /api/admin/reports/invoices — all invoices issued during the selected event.
   * Each row includes the aggregated gross total and the receipt token so the UI can
   * link to the PDF download.
   */
  app.get<{ Querystring: { event_id?: string } }>('/invoices', async (req, reply) => {
    const ev = await resolveReportEvent(req.query.event_id);
    if (!ev) return reply.send({ event: null, invoices: [] });

    const result = await query<{
      id: string; receipt_number: string; receipt_type: string; payment_method: string;
      created_at: Date; register_id: string; register_name: string;
      receipt_token: string | null;
      total_gross: string;
    }>(`
      SELECT i.id,
             i.receipt_number::text,
             i.receipt_type,
             i.payment_method,
             i.created_at,
             i.register_id,
             r.name AS register_name,
             i.receipt_token,
             COALESCE(SUM(oi.price + COALESCE(oi.deposit_price, 0)), 0)::text AS total_gross
        FROM invoice i
        JOIN register r ON r.id = i.register_id
        LEFT JOIN order_item oi ON oi.invoice_id = i.id
       WHERE i.created_at >= $1 AND i.created_at < $2
       GROUP BY i.id, r.name
       ORDER BY i.created_at DESC
    `, [ev.start, ev.end]);

    const prefix = await readReceiptPrefix();
    return reply.send({
      event: { id: ev.id, start: ev.start, end: ev.end },
      invoices: result.rows.map((r) => ({
        id: r.id,
        receipt_number: Number(r.receipt_number),
        receipt_number_formatted: formatReceiptNumber(Number(r.receipt_number), prefix),
        receipt_type: r.receipt_type,
        payment_method: r.payment_method,
        created_at: r.created_at.toISOString(),
        register_name: r.register_name,
        receipt_token: r.receipt_token,
        total_gross: Number(r.total_gross),
      })),
    });
  });

  /**
   * GET /api/admin/reports/cash-balance — single-figure cash balance per register.
   * Balance = (Σ deposits) + (Σ paid cash invoices) − (Σ withdrawals).
   * Filtered to the selected event's time window.
   */
  app.get<{ Querystring: { event_id?: string } }>('/cash-balance', async (req, reply) => {
    const ev = await resolveReportEvent(req.query.event_id);
    if (!ev) return reply.send({ event: null, registers: [] });

    const result = await query<{
      id: string; name: string; type: string;
      deposits: string; withdrawals: string; cash_takings: string; balance: string;
    }>(`
      SELECT r.id, r.name, r.type,
             COALESCE(d.total, 0)::text     AS deposits,
             COALESCE(w.total, 0)::text     AS withdrawals,
             COALESCE(c.total, 0)::text     AS cash_takings,
             (COALESCE(d.total, 0) + COALESCE(c.total, 0) - COALESCE(w.total, 0))::text AS balance
        FROM register r
        LEFT JOIN (
          SELECT register_id, SUM(amount) AS total
            FROM cash_transaction
           WHERE type = 'deposit' AND created_at >= $1 AND created_at < $2
           GROUP BY register_id
        ) d ON d.register_id = r.id
        LEFT JOIN (
          SELECT register_id, SUM(amount) AS total
            FROM cash_transaction
           WHERE type = 'withdrawal' AND created_at >= $1 AND created_at < $2
           GROUP BY register_id
        ) w ON w.register_id = r.id
        LEFT JOIN (
          -- Cash takings exclude cancellation receipts (they would otherwise inflate
          -- the balance) AND cancelled/free items (they did not produce cash either:
          -- free-of-charge items are issued on a 0 € invoice per KassenSichV, and
          -- cancelled items never reached the cash drawer at all).
          SELECT i.register_id, SUM(oi.price + COALESCE(oi.deposit_price, 0)) AS total
            FROM invoice i
            JOIN order_item oi ON oi.invoice_id = i.id
           WHERE i.payment_method = 'cash'
             AND i.receipt_type = 'sales_receipt'
             AND oi.status = 'paid'
             AND i.created_at >= $1 AND i.created_at < $2
           GROUP BY i.register_id
        ) c ON c.register_id = r.id
       ORDER BY r.name
    `, [ev.start, ev.end]);

    return reply.send({
      event: { id: ev.id, start: ev.start, end: ev.end },
      registers: result.rows.map((r) => ({
        id: r.id, name: r.name, type: r.type,
        deposits: Number(r.deposits),
        withdrawals: Number(r.withdrawals),
        cash_takings: Number(r.cash_takings),
        balance: Number(r.balance),
      })),
    });
  });

  /**
   * GET /api/admin/reports/cancellations — all `cancelled` and `free` order items
   * within the selected event, joined to user (who) and table (where). A summary
   * per user is included so the operator can spot misuse at a glance.
   */
  app.get<{ Querystring: { event_id?: string } }>('/cancellations', async (req, reply) => {
    const ev = await resolveReportEvent(req.query.event_id);
    if (!ev) return reply.send({ event: null, items: [], summary: [] });

    const items = await query<{
      id: string; cancelled_at: Date | null; created_at: Date;
      user_id: string | null; user_name: string | null;
      table_name: string | null;
      article_name: string; options: string | null;
      price: string; deposit_price: string | null;
      reason_name: string | null; booking_type: string | null;
    }>(`
      SELECT oi.id,
             oi.cancelled_at,
             oi.created_at,
             oi.cancelled_by AS user_id,
             u.name          AS user_name,
             t.name          AS table_name,
             oi.article_name,
             oi.options,
             oi.price::text,
             oi.deposit_price::text,
             cr.name         AS reason_name,
             cr.booking_type AS booking_type
        FROM order_item oi
        LEFT JOIN "user" u ON u.id = oi.cancelled_by
        LEFT JOIN dining_table t ON t.id = oi.dining_table_id
        LEFT JOIN cancellation_reason cr ON cr.id = oi.cancellation_reason_id
       WHERE oi.status IN ('cancelled', 'free')
         AND oi.cancelled_at >= $1 AND oi.cancelled_at < $2
       ORDER BY oi.cancelled_at DESC
    `, [ev.start, ev.end]);

    const summary = await query<{ user_id: string | null; user_name: string | null; count: string; total: string }>(`
      SELECT oi.cancelled_by AS user_id,
             u.name          AS user_name,
             COUNT(*)::text  AS count,
             COALESCE(SUM(oi.price + COALESCE(oi.deposit_price, 0)), 0)::text AS total
        FROM order_item oi
        LEFT JOIN "user" u ON u.id = oi.cancelled_by
       WHERE oi.status IN ('cancelled', 'free')
         AND oi.cancelled_at >= $1 AND oi.cancelled_at < $2
       GROUP BY oi.cancelled_by, u.name
       ORDER BY total DESC
    `, [ev.start, ev.end]);

    return reply.send({
      event: { id: ev.id, start: ev.start, end: ev.end },
      summary: summary.rows.map((r) => ({
        user_id: r.user_id, user_name: r.user_name ?? '(unbekannt)',
        count: Number(r.count), total: Number(r.total),
      })),
      items: items.rows.map((r) => ({
        id: r.id,
        cancelled_at: r.cancelled_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
        user_name: r.user_name ?? '(unbekannt)',
        table_name: r.table_name ?? '(ohne Tisch)',
        article_name: r.article_name,
        options: r.options,
        price: Number(r.price),
        deposit_price: r.deposit_price === null ? null : Number(r.deposit_price),
        line_gross: Number(r.price) + (r.deposit_price === null ? 0 : Number(r.deposit_price)),
        reason_name: r.reason_name ?? '(unbekannt)',
        booking_type: r.booking_type ?? '',
      })),
    });
  });

  /**
   * GET /api/admin/reports/tse-outages — TSE outage log (Task #72), sourced
   * from `tse_outage` (see tse/outage.ts — written automatically by every
   * signing attempt, AEAO zu § 146a AO Nr. 1.14.1). Unlike the other reports
   * here this isn't scoped to an event: an outage isn't tied to a specific
   * Veranstaltung, so there's no `event_id` filter. Capped at the 500 most
   * recent rows, newest first.
   */
  app.get('/tse-outages', async (_req, reply) => {
    const result = await query<{ id: string; started_at: Date; ended_at: Date | null; reason: string }>(
      `SELECT id, started_at, ended_at, reason
         FROM tse_outage
        ORDER BY started_at DESC
        LIMIT 500`,
    );
    return reply.send(
      result.rows.map((r) => ({
        id: r.id,
        started_at: r.started_at.toISOString(),
        ended_at: r.ended_at?.toISOString() ?? null,
        reason: r.reason,
      })),
    );
  });
}
