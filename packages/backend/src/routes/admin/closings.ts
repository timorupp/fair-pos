/**
 * Daily-closing (Z-Bon) endpoints.
 *
 * Per-register endpoints are nested under `/registers/:id/closings`; the
 * "close all" shortcut lives at `/closings/close-all`. Each closing assigns
 * a fresh per-register sequential `z_number`, aggregates everything not yet
 * assigned to a previous closing, persists the result, and queues an ESC/POS
 * print job on the register's printer.
 */

import type { FastifyInstance } from 'fastify';
import { query, withTransaction } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import {
  computeClosingTotals, type ClosingInvoice, type ClosingItem,
} from '../../closing/totals.js';
import { buildZBonEscPos } from '../../closing/escpos.js';
import { pendingClosingDays, localDateString } from '../../closing/pending.js';
import { findPendingDaysForRegister } from '../../closing/pending-db.js';
import { loadClosingById } from '../../closing/load.js';
import { renderZBonPdf } from '../../closing/pdf.js';
import { enqueuePrintJob } from '../../print/enqueue.js';
import { resolvePrinterForRegister } from '../../print/resolve-printer.js';
import { loadLogoFor } from '../../logo/visibility.js';

/** Settings keys read for the Z-Bon header. */
const COMPANY_SETTING_KEYS = ['company_name', 'system_serial'] as const;

/** Result of one successful closing call. */
interface CloseResult {
  closing_id: string;
  register_id: string;
  z_number: number;
  is_zero_closing: boolean;
  print_job_id: string | null;
}

/**
 * Closes one specific calendar day for a register and produces a Z-Bon.
 *
 * If `date` is given, only invoices created on that calendar day (server local
 * timezone) are aggregated. If omitted, the closing covers ALL still-unassigned
 * invoices of the register — used by the "close right now" button.
 *
 * Idempotent across calls only in the trivial sense that a second call would
 * simply produce another Z-Bon with the next number — the caller (UI / catch-up
 * loop) is expected to gate this.
 *
 * @param registerId - The register to close.
 * @param userName - Name of the administrator performing the closing, stored
 *   as a text snapshot (Task #97) rather than a foreign key.
 * @param date - Optional `YYYY-MM-DD` string scoping the closing to one day.
 * @returns Details about the created closing including the enqueued print job id.
 */
async function closeRegister(registerId: string, userName: string, date?: string): Promise<CloseResult> {
  return withTransaction(async (client) => {
    // Serialise per-register Z-number issuance with an advisory lock based on the register UUID hash.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [registerId]);

    // Load register metadata. The printer is resolved separately below via the
    // shared helper so the system-default-printer fallback kicks in when the
    // register itself has no explicit printer assigned.
    const regResult = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM register WHERE id = $1`,
      [registerId],
    );
    const register = regResult.rows[0];
    if (!register) throw Object.assign(new Error('Kasse nicht gefunden'), { httpStatus: 404 });

    // Pick the invoice scope: scoped to one day, or every unassigned row of the register.
    // The day-scoped variant uses the server's local timezone via `created_at::date`.
    const invResult = date
      ? await client.query<{
          id: string; payment_method: 'cash' | 'card';
          receipt_type: 'sales_receipt' | 'cancellation' | 'training';
        }>(
          `SELECT id, payment_method, receipt_type
             FROM invoice
            WHERE register_id = $1
              AND daily_closing_id IS NULL
              AND created_at::date = $2::date`,
          [registerId, date],
        )
      : await client.query<{
          id: string; payment_method: 'cash' | 'card';
          receipt_type: 'sales_receipt' | 'cancellation' | 'training';
        }>(
          `SELECT id, payment_method, receipt_type
             FROM invoice
            WHERE register_id = $1 AND daily_closing_id IS NULL`,
          [registerId],
        );

    let invoices: ClosingInvoice[] = [];
    if (invResult.rows.length > 0) {
      const ids = invResult.rows.map((r) => r.id);
      const itemsResult = await client.query<{
        invoice_id: string; status: ClosingItem['status'];
        tax_rate: string; price: string; deposit_price: string | null;
      }>(
        `SELECT invoice_id, status, tax_rate::text, price::text, deposit_price::text
           FROM order_item
          WHERE invoice_id = ANY($1)`,
        [ids],
      );
      const itemsByInvoice = new Map<string, ClosingItem[]>();
      for (const row of itemsResult.rows) {
        const list = itemsByInvoice.get(row.invoice_id) ?? [];
        list.push({
          status: row.status,
          tax_rate: Number(row.tax_rate),
          price: Number(row.price),
          deposit_price: row.deposit_price === null ? null : Number(row.deposit_price),
        });
        itemsByInvoice.set(row.invoice_id, list);
      }
      invoices = invResult.rows.map((inv) => ({
        id: inv.id,
        payment_method: inv.payment_method,
        receipt_type: inv.receipt_type,
        items: itemsByInvoice.get(inv.id) ?? [],
      }));
    }

    const totals = computeClosingTotals(invoices);

    // Compute the next Z-number for this register.
    const seqResult = await client.query<{ max_z: string | null; cnt: string }>(
      `SELECT MAX(z_number)::text AS max_z, COUNT(*)::text AS cnt
         FROM daily_closing WHERE register_id = $1`,
      [registerId],
    );
    const nextZ = (Number(seqResult.rows[0]!.max_z) || 0) + 1;
    const zeroCounter = Number(seqResult.rows[0]!.cnt) + 1; // includes the closing we're about to insert

    // business_date carries the calendar day the Z-Bon belongs to. For a
    // catch-up it is the explicit `date` argument; for an in-day closing
    // it falls back to the database `current_date`, set via DEFAULT.
    const closingInsert = await client.query<{ id: string }>(
      `INSERT INTO daily_closing (
         register_id, z_number, created_by_name, is_zero_closing,
         total_gross, total_tax_standard, total_tax_reduced, total_tax_zero,
         total_cash, total_cancellations,
         business_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::date, current_date))
       RETURNING id`,
      [
        registerId, nextZ, userName, totals.is_zero_closing,
        totals.total_gross, totals.total_tax_standard, totals.total_tax_reduced, totals.total_tax_zero,
        totals.total_cash, totals.total_cancellations,
        date ?? null,
      ],
    );
    const closingId = closingInsert.rows[0]!.id;

    // Link the aggregated invoices to the new closing.
    if (invoices.length > 0) {
      await client.query(
        `UPDATE invoice SET daily_closing_id = $1 WHERE id = ANY($2)`,
        [closingId, invoices.map((i) => i.id)],
      );
    }

    // Read company-data settings inside the same transaction so the printed Z-Bon
    // reflects the values at closing time.
    const settingsResult = await client.query<{ key: string; value: string }>(
      `SELECT key, value FROM system_setting WHERE key = ANY($1)`,
      [COMPANY_SETTING_KEYS as unknown as string[]],
    );
    const settings = new Map(settingsResult.rows.map((r) => [r.key, r.value]));

    // Printer = register's own assignment, falling back to the system default.
    // Resolved via the shared helper so the rule stays identical to receipts
    // and order slips.
    const printerId = await resolvePrinterForRegister(registerId);
    let printJobId: string | null = null;
    if (printerId) {
      const logo = await loadLogoFor('z_bon');
      const bytes = buildZBonEscPos({
        company_name:  settings.get('company_name')  ?? '',
        register_name: register.name,
        system_serial: settings.get('system_serial') ?? '(noch nicht initialisiert)',
        z_number:      nextZ,
        created_at:    new Date(),
        zero_counter:  zeroCounter,
      }, totals, logo?.escposBytes ?? null);
      const job = await enqueuePrintJob(printerId, 'daily_closing', bytes, closingId);
      printJobId = job.id;
    }

    return {
      closing_id: closingId,
      register_id: registerId,
      z_number: nextZ,
      is_zero_closing: totals.is_zero_closing,
      print_job_id: printJobId,
    };
  });
}

/**
 * Registers `/api/admin/closings/*` and `/api/admin/registers/:id/closings/*`.
 *
 * @param app - The Fastify scope under which to register the routes.
 */
export async function closingsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /**
   * POST /api/admin/registers/:id/closings — closes the day for one register.
   * Returns the new closing id, Z-number, zero-closing flag, and print job id.
   */
  app.post<{ Params: { id: string } }>('/registers/:id/closings', async (req, reply) => {
    const { id } = req.params;
    try {
      const result = await closeRegister(id, req.adminUser.name);
      return reply.send(result);
    } catch (err) {
      const e = err as Error & { httpStatus?: number };
      if (e.httpStatus) return reply.status(e.httpStatus).send({ error: e.message });
      throw err;
    }
  });

  /**
   * GET /api/admin/registers/:id/closings — list of past Z-Bons for this register, newest first.
   */
  app.get<{ Params: { id: string } }>('/registers/:id/closings', async (req, reply) => {
    const { id } = req.params;
    const result = await query<{
      id: string; z_number: string;
      created_at: Date; business_date: string;
      is_zero_closing: boolean;
      total_gross: string; total_cash: string; total_cancellations: string;
      created_by_name: string | null;
    }>(
      `SELECT c.id, c.z_number::text,
              c.created_at, to_char(c.business_date, 'YYYY-MM-DD') AS business_date,
              c.is_zero_closing,
              c.total_gross::text, c.total_cash::text, c.total_cancellations::text,
              c.created_by_name
         FROM daily_closing c
        WHERE c.register_id = $1
        ORDER BY c.z_number DESC`,
      [id],
    );
    return reply.send({
      closings: result.rows.map((r) => ({
        id: r.id,
        z_number: Number(r.z_number),
        created_at: r.created_at.toISOString(),
        business_date: r.business_date,
        is_zero_closing: r.is_zero_closing,
        total_gross: Number(r.total_gross),
        total_cash: Number(r.total_cash),
        total_cancellations: Number(r.total_cancellations),
        created_by_name: r.created_by_name ?? '(unbekannt)',
      })),
    });
  });

  /**
   * POST /api/admin/closings/close-all — system-wide shortcut: closes every register
   * that has at least one unassigned invoice OR (per Anforderungen) no prior closing
   * for the calendar day. The simple implementation here closes ALL registers, which
   * lets the auto-zero-closing requirement reuse the same code path.
   */
  app.post('/closings/close-all', async (req, reply) => {
    const regs = await query<{ id: string }>(`SELECT id FROM register ORDER BY name`);
    const closings: CloseResult[] = [];
    for (const r of regs.rows) {
      try {
        closings.push(await closeRegister(r.id, req.adminUser.name));
      } catch (err) {
        const e = err as Error & { httpStatus?: number };
        // If a register cannot be closed (deleted mid-loop etc.) we skip it but keep going.
        if (e.httpStatus === 404) continue;
        throw err;
      }
    }
    return reply.send({ closings });
  });

  /**
   * GET /api/admin/closings/pending — pending-Z-Bon summary for every register.
   *
   * For each register, returns the list of past calendar days (oldest first) that
   * still need a Z-Bon. Used to drive the global admin banner, the overview badges,
   * and the per-register catch-up list.
   */
  app.get('/closings/pending', async (_req, reply) => {
    const regs = await query<{ id: string; name: string }>(`SELECT id, name FROM register ORDER BY name`);
    const today = new Date();
    const result = [];
    for (const r of regs.rows) {
      const pending = await findPendingDaysForRegister(r.id, today);
      result.push({ register_id: r.id, register_name: r.name, pending_days: pending });
    }
    return reply.send({
      today: localDateString(today),
      registers: result,
      total_pending_registers: result.filter((r) => r.pending_days.length > 0).length,
      total_pending_days: result.reduce((s, r) => s + r.pending_days.length, 0),
    });
  });

  /**
   * POST /api/admin/registers/:id/close-pending — closes every outstanding past day
   * for one register in oldest-first order. Each iteration produces a separate Z-Bon
   * with the next sequential number. Stops on the first error.
   */
  app.post<{ Params: { id: string } }>('/registers/:id/close-pending', async (req, reply) => {
    const { id } = req.params;
    const today = new Date();
    const pending = await findPendingDaysForRegister(id, today);
    const closings: CloseResult[] = [];
    for (const day of pending) {
      try {
        closings.push(await closeRegister(id, req.adminUser.name, day));
      } catch (err) {
        const e = err as Error & { httpStatus?: number };
        if (e.httpStatus) return reply.status(e.httpStatus).send({ error: e.message, closings });
        throw err;
      }
    }
    return reply.send({ closings, pending_days_remaining: 0 });
  });

  /**
   * GET /api/admin/closings/:id/pdf — re-renders an existing Z-Bon as PDF for
   * in-browser preview. Session-authenticated; the byte stream is rebuilt from
   * the persisted totals row (no re-aggregation across invoices).
   */
  app.get<{ Params: { id: string } }>('/closings/:id/pdf', async (req, reply) => {
    const stored = await loadClosingById(req.params.id);
    if (!stored) return reply.status(404).send({ error: 'Z-Bon nicht gefunden' });
    const pdf = await renderZBonPdf(stored.ctx, stored.totals, stored.business_date, stored.logo);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="z-bon-${stored.ctx.z_number}.pdf"`)
      .header('Cache-Control', 'no-store')
      .send(pdf);
  });

  /**
   * POST /api/admin/closings/:id/reprint — re-queues an ESC/POS print job for
   * an already-issued Z-Bon. Useful when the original print attempt failed or
   * the operator wants a second copy. Falls back to the system-default printer
   * if the register itself has none assigned.
   */
  app.post<{ Params: { id: string } }>('/closings/:id/reprint', async (req, reply) => {
    const stored = await loadClosingById(req.params.id);
    if (!stored) return reply.status(404).send({ error: 'Z-Bon nicht gefunden' });
    const printerId = await resolvePrinterForRegister(stored.register_id);
    if (!printerId) {
      return reply.status(400).send({
        error: 'Kein Drucker verfügbar — der Kasse ist keiner zugeordnet und es ist kein Standarddrucker konfiguriert.',
      });
    }
    const bytes = buildZBonEscPos(stored.ctx, stored.totals, stored.logo?.escposBytes ?? null);
    const job = await enqueuePrintJob(printerId, 'daily_closing', bytes, stored.id);
    return reply.send({ print_job_id: job.id });
  });
}
