/**
 * Admin report endpoints. Scoped to the currently active event (Task #95) —
 * a register (and everything booked through it) belongs to exactly one
 * event for its whole lifetime, so filtering by `register.event_id` is both
 * simpler and more precise than the old manual event-selector / date-range
 * heuristic it replaces (see docs/Umsetzungsplan-94-95.txt Phase 2.7).
 */

import type { FastifyInstance } from 'fastify';
import { query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { config } from '../../config.js';
import { formatReceiptNumber, readReceiptPrefix } from '../../receipt/format-receipt-number.js';

/**
 * Loads the active event's own id/start/end, or `null` when no event is
 * currently active (should not normally happen — every fresh install seeds
 * one — but handled defensively, same as before).
 *
 * @returns `{ id, start, end }` of the active event, or `null`.
 */
async function loadActiveEvent(): Promise<{ id: string; start: string; end: string } | null> {
  if (!config.activeEventId) return null;
  const result = await query<{ id: string; start_time: Date; end_time: Date }>(
    `SELECT id, start_time, end_time FROM event WHERE id = $1`,
    [config.activeEventId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, start: row.start_time.toISOString(), end: row.end_time.toISOString() };
}

/**
 * Registers `/api/admin/reports/*` routes.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function reportsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/reports/open-positions — open order items grouped by table.
   * Deliberately NOT scoped to the active event: an open item represents
   * goods already served but not yet paid, and must stay visible even if the
   * admin switches the active event before the table is settled — hiding it
   * would risk revenue silently slipping through the cracks.
   */
  app.get('/open-positions', async (_req, reply) => {
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
   * GET /api/admin/reports/invoices — all invoices issued on a register of
   * the active event. Each row includes the aggregated gross total and the
   * receipt token so the UI can link to the PDF download.
   */
  app.get('/invoices', async (_req, reply) => {
    const ev = await loadActiveEvent();
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
       WHERE r.event_id = $1
       GROUP BY i.id, r.name
       ORDER BY i.created_at DESC
    `, [ev.id]);

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
   * GET /api/admin/reports/cash-balance — single-figure cash balance per
   * register of the active event.
   * Balance = (Σ deposits) + (Σ paid cash invoices) − (Σ withdrawals).
   */
  app.get('/cash-balance', async (_req, reply) => {
    const ev = await loadActiveEvent();
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
           WHERE type = 'deposit'
           GROUP BY register_id
        ) d ON d.register_id = r.id
        LEFT JOIN (
          SELECT register_id, SUM(amount) AS total
            FROM cash_transaction
           WHERE type = 'withdrawal'
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
           GROUP BY i.register_id
        ) c ON c.register_id = r.id
       WHERE r.event_id = $1
       ORDER BY r.name
    `, [ev.id]);

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
   * GET /api/admin/reports/today-revenue — total gross revenue booked today
   * (Task #63 dashboard follow-up), across both payment methods. Mirrors the
   * `cash_takings` exclusions in `/cash-balance` (a cancellation receipt or a
   * cancelled/free item never produced real revenue) but — unlike every
   * other report here — is not scoped to an event: it's a plain calendar-day
   * figure, "today" resolved by Postgres itself so it follows whatever
   * timezone the server is configured with (Task #60).
   */
  app.get('/today-revenue', async (_req, reply) => {
    const result = await query<{ total: string }>(`
      SELECT COALESCE(SUM(oi.price + COALESCE(oi.deposit_price, 0)), 0)::text AS total
        FROM invoice i
        JOIN order_item oi ON oi.invoice_id = i.id
       WHERE i.receipt_type = 'sales_receipt'
         AND oi.status = 'paid'
         AND i.created_at >= CURRENT_DATE
         AND i.created_at < CURRENT_DATE + INTERVAL '1 day'
    `);
    return reply.send({ total: Number(result.rows[0]!.total) });
  });

  /**
   * GET /api/admin/reports/cancellations — all `cancelled` and `free` order
   * items booked on a register of the active event, joined to user (who) and
   * table (where). A summary per user is included so the operator can spot
   * misuse at a glance.
   */
  app.get('/cancellations', async (_req, reply) => {
    const ev = await loadActiveEvent();
    if (!ev) return reply.send({ event: null, items: [], summary: [] });

    const items = await query<{
      id: string; cancelled_at: Date | null; created_at: Date;
      cancelled_by_name: string | null;
      table_name: string | null;
      article_name: string; options: string | null;
      price: string; deposit_price: string | null;
      reason_name: string | null; booking_type: string | null;
    }>(`
      SELECT oi.id,
             oi.cancelled_at,
             oi.created_at,
             oi.cancelled_by_name,
             t.name          AS table_name,
             oi.article_name,
             oi.options,
             oi.price::text,
             oi.deposit_price::text,
             cr.name         AS reason_name,
             cr.booking_type AS booking_type
        FROM order_item oi
        JOIN register r ON r.id = oi.register_id
        LEFT JOIN dining_table t ON t.id = oi.dining_table_id
        LEFT JOIN cancellation_reason cr ON cr.id = oi.cancellation_reason_id
       WHERE oi.status IN ('cancelled', 'free')
         AND r.event_id = $1
       ORDER BY oi.cancelled_at DESC
    `, [ev.id]);

    const summary = await query<{ cancelled_by_name: string | null; count: string; total: string }>(`
      SELECT oi.cancelled_by_name,
             COUNT(*)::text  AS count,
             COALESCE(SUM(oi.price + COALESCE(oi.deposit_price, 0)), 0)::text AS total
        FROM order_item oi
        JOIN register r ON r.id = oi.register_id
       WHERE oi.status IN ('cancelled', 'free')
         AND r.event_id = $1
       GROUP BY oi.cancelled_by_name
       ORDER BY total DESC
    `, [ev.id]);

    return reply.send({
      event: { id: ev.id, start: ev.start, end: ev.end },
      summary: summary.rows.map((r) => ({
        user_name: r.cancelled_by_name ?? '(unbekannt)',
        count: Number(r.count), total: Number(r.total),
      })),
      items: items.rows.map((r) => ({
        id: r.id,
        cancelled_at: r.cancelled_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
        user_name: r.cancelled_by_name ?? '(unbekannt)',
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
   * Veranstaltung. Capped at the 500 most recent rows, newest first.
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
