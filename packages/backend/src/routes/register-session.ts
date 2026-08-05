/**
 * Routes consumed by the cash-register session UIs (Bonkasse and Bedienungskasse).
 *
 * All endpoints require an authenticated user; access to a specific register is
 * additionally gated by the `user_register` assignment table.
 */

import type { FastifyInstance } from 'fastify';
import type { Article, RegisterType } from '@fairpos/shared';
import { query, withTransaction } from '../db/client.js';
import { authenticateRegister } from '../middleware/authenticate.js';
import { generateReceiptToken } from '../receipt/numbering.js';
import { nextReceiptNumber } from '../receipt/sequence.js';
import { buildReceiptEscPos } from '../receipt/escpos-receipt.js';
import { loadReceiptByToken } from '../receipt/data.js';
import { enqueuePrintJob } from '../print/enqueue.js';
import { renderQrPng } from '../receipt/qr.js';
import {
  bucketItemsByPrinter, buildOrderSlipEscPos,
  buildPickupSlipEscPos, buildDepositSlipEscPos,
  type OrderSlipItem,
} from '../print/order-slip.js';
import { resolvePrinterForRegister } from '../print/resolve-printer.js';
import { loadLogoFor } from '../logo/visibility.js';
import { signTseTransaction } from '../tse/signing.js';
import {
  buildKassenbelegProcessData, buildAvBestellungProcessData, buildAvSonstigeProcessData,
} from '../tse/processData.js';
import { formatReceiptNumber, readReceiptPrefix } from '../receipt/format-receipt-number.js';
import { makeGroupKey, pickItemsToCharge } from '../order/grouping.js';
import { isRegisterUnlocked, findPendingDaysForRegister } from '../closing/pending-db.js';

/** Resolves the effective layout for a register: explicit `layout_id`, else the per-type default from settings, else null. */
async function resolveLayoutId(registerLayoutId: string | null, registerType: RegisterType): Promise<string | null> {
  if (registerLayoutId) return registerLayoutId;
  const key = registerType === 'receipt_register'
    ? 'default_layout_receipt_register'
    : 'default_layout_service_register';
  const result = await query<{ value: string }>(
    `SELECT value FROM system_setting WHERE key = $1`,
    [key],
  );
  return result.rows[0]?.value ?? null;
}

/** Confirms the authenticated user has been assigned the given register. Returns 403 via reply if not. */
async function userHasRegister(userId: string, registerId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM user_register WHERE user_id = $1 AND register_id = $2`,
    [userId, registerId],
  );
  return result.rowCount! > 0;
}

/**
 * Returns a `{ status, body }` pair describing the "register locked" 409 response
 * when the register has outstanding Z-Bons. Returns `null` when the register is OK.
 *
 * Centralised here so every mutating endpoint can call it before doing work and
 * present the operator a consistent error message that points back to the admin.
 *
 * @param registerId - The register to validate.
 * @returns The error payload to send, or `null` to proceed.
 */
async function lockedResponse(registerId: string): Promise<{ status: 409; body: { error: string; pending_days: string[]; locked: true } } | null> {
  const pending = await findPendingDaysForRegister(registerId);
  if (pending.length === 0) return null;
  return {
    status: 409,
    body: {
      error:
        `Diese Kasse ist gesperrt: ${pending.length} Tagesabschluss${pending.length === 1 ? '' : '/üsse'} ` +
        `(${pending[0]}${pending.length > 1 ? ` … ${pending[pending.length - 1]}` : ''}) müssen vom Administrator nachgeholt werden, bevor weiter kassiert werden kann.`,
      pending_days: pending,
      locked: true,
    },
  };
}

/** Registers /api/register-session routes. */
export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateRegister);

  /**
   * GET /me — current user plus the list of registers they may operate.
   * Each register is annotated with its pending-Z-Bon state so the UI can
   * show a "locked" indicator on the chooser screen.
   */
  app.get('/me', async (req, reply) => {
    const result = await query<{
      id: string; name: string; type: RegisterType;
      printer_id: string | null; layout_id: string | null;
    }>(`
      SELECT r.id, r.name, r.type, r.printer_id, r.layout_id
        FROM register r
        JOIN user_register ur ON ur.register_id = r.id
       WHERE ur.user_id = $1
       ORDER BY r.name
    `, [req.registerUser.id]);

    const today = new Date();
    const registers = [];
    for (const r of result.rows) {
      const pending = await findPendingDaysForRegister(r.id, today);
      registers.push({ ...r, locked: pending.length > 0, pending_days: pending });
    }
    return reply.send({
      user: { id: req.registerUser.id, name: req.registerUser.name, is_admin: req.registerUser.is_admin },
      registers,
    });
  });

  /** GET /registers/:id — full operating context for the active register (layout, articles). */
  app.get('/registers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await userHasRegister(req.registerUser.id, id))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }

    const regResult = await query<{
      id: string; name: string; type: RegisterType;
      printer_id: string | null; layout_id: string | null;
    }>(
      `SELECT id, name, type, printer_id, layout_id FROM register WHERE id = $1`,
      [id],
    );
    const register = regResult.rows[0];
    if (!register) return reply.status(404).send({ error: 'Kasse nicht gefunden' });

    const layoutId = await resolveLayoutId(register.layout_id, register.type);
    let layout: null | {
      id: string; name: string; grid_cols: number; grid_rows: number;
      slots: { article_id: string; grid_row: number; grid_col: number; color: string }[];
    } = null;
    if (layoutId) {
      const lay = await query<{ id: string; name: string; grid_cols: number; grid_rows: number }>(
        `SELECT id, name, grid_cols, grid_rows FROM register_layout WHERE id = $1`,
        [layoutId],
      );
      if (lay.rows[0]) {
        const slots = await query<{ article_id: string; grid_row: number; grid_col: number; color: string }>(
          `SELECT article_id, grid_row, grid_col, color
             FROM register_layout_slot
            WHERE register_layout_id = $1`,
          [layoutId],
        );
        layout = { ...lay.rows[0], slots: slots.rows };
      }
    }

    const articles = await query<Article & { category_name: string; tax_rate: string }>(
      `SELECT a.id, a.category_id, a.name, a.receipt_text, a.price, a.deposit_price,
              a.print_deposit_receipt, a.printer_id, a.is_active, a.created_at,
              c.name AS category_name, c.tax_rate
         FROM article a
         JOIN article_category c ON c.id = a.category_id
        WHERE a.is_active = true`,
    );

    const pending = await findPendingDaysForRegister(register.id);
    return reply.send({
      register,
      layout,
      articles: articles.rows,
      locked: pending.length > 0,
      pending_days: pending,
    });
  });

  /**
   * POST /registers/:id/checkout — finalises a sale.
   *
   * Body: `{ positions: [{ article_id, quantity }] }`
   *
   * Sequence:
   *  1. Fetches and validates the referenced articles.
   *  2. If a TSE is configured (`TSE_MOUNT_POINT`/`TSE_CLIENT_ID`), signs a
   *     `Kassenbeleg-V1` transaction BEFORE opening the DB transaction. A TSE
   *     failure does NOT block the sale (AEAO zu § 146a Nr. 1.14.3 explicitly
   *     tolerates continued operation without a working TSE) — the invoice's
   *     `tse_*` columns stay `null` and `tse_warning` in the response tells the
   *     operator to get the TSE fixed. Same fallback when the TSE isn't
   *     configured at all (dev/test). See docs/TSE-Integration.md → „TSE-Ausfall".
   *  3. Inside a single DB transaction: acquires an advisory xact lock so the
   *     receipt-number sequence is race-free, computes the next receipt
   *     number, generates a cryptographic `receipt_token`, inserts the
   *     invoice (including the TSE signature fields, if any), and inserts one
   *     `order_item` row per ordered unit, copying the article snapshot.
   */
  app.post<{ Params: { id: string }; Body: { positions: { article_id: string; quantity: number }[] } }>(
    '/registers/:id/checkout',
    async (req, reply) => {
      const { id: registerId } = req.params;
      const { positions } = req.body;

      if (!Array.isArray(positions) || positions.length === 0) {
        return reply.status(400).send({ error: 'Bestellliste ist leer' });
      }
      for (const p of positions) {
        if (!p.article_id || typeof p.quantity !== 'number' || !Number.isInteger(p.quantity) || p.quantity < 1) {
          return reply.status(400).send({ error: 'Ungültige Position' });
        }
      }

      if (!(await userHasRegister(req.registerUser.id, registerId))) {
        return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
      }
      const locked = await lockedResponse(registerId);
      if (locked) return reply.status(locked.status).send(locked.body);

      // At the Bonkasse, self-pickup slips go to the register's own printer
      // (fallback: system default). The per-article printer is intentionally
      // NOT used here — that's a Bedienungskasse-only rule. See
      // docs/Anforderungen.md → "Selbstabholerbon-Druckregeln (Bonkasse)".
      const slipPrinterId = await resolvePrinterForRegister(registerId);

      // Collect one slip-spec per article-unit (no grouping at the Bonkasse).
      // `depositEuros` carries the per-unit deposit if any; `separateDepositSlip`
      // mirrors `article.print_deposit_receipt` and decides whether the deposit
      // is printed as an extra slip or as an extra line on the article slip.
      const slipUnits: { name: string; priceEuros: number; depositEuros: number | null; separateDepositSlip: boolean }[] = [];
      let registerName = '';

      // Articles are fetched once, up front, so the same snapshot can be used
      // both to build the TSE process-data payload and for the order_item
      // inserts inside the transaction below.
      const articleIds = [...new Set(positions.map((p) => p.article_id))];
      const articlesResult = await query<{
        id: string; name: string; receipt_text: string | null; price: string;
        deposit_price: string | null; print_deposit_receipt: boolean;
        printer_id: string | null;
        category_name: string; tax_rate: string;
      }>(
        `SELECT a.id, a.name, a.receipt_text, a.price, a.deposit_price,
                a.print_deposit_receipt, a.printer_id,
                c.name AS category_name, c.tax_rate
           FROM article a
           JOIN article_category c ON c.id = a.category_id
          WHERE a.id = ANY($1)`,
        [articleIds],
      );
      const articleById = new Map(articlesResult.rows.map((a) => [a.id, a]));
      for (const pos of positions) {
        if (!articleById.has(pos.article_id)) {
          return reply.status(400).send({ error: `Artikel ${pos.article_id} nicht gefunden` });
        }
      }

      // TSE-Signierung (Kassenbeleg-V1) läuft VOR der DB-Transaktion. `signTseTransaction`
      // blockiert den Kassiervorgang nicht — siehe docs/TSE-Integration.md Abschnitt 8.1
      // ("TSE-Ausfall", AEAO zu § 146a Nr. 1.14.3) für die vollständige Begründung.
      const kassenbelegSnapshot = buildKassenbelegProcessData({
        registerId,
        paymentMethod: 'cash',
        receiptType: 'sales_receipt',
        positions: positions.map((p) => {
          const article = articleById.get(p.article_id)!;
          return {
            articleId: article.id,
            name: article.receipt_text ?? article.name,
            quantity: p.quantity,
            unitPriceEuros: Number(article.price),
            depositPriceEuros: article.deposit_price === null ? null : Number(article.deposit_price),
            taxRatePercent: Number(article.tax_rate),
          };
        }),
      });
      const { signature: tse, warning: tseWarning } = await signTseTransaction('Kassenbeleg-V1', kassenbelegSnapshot);

      const result = await withTransaction(async (client) => {
        // Atomic increment of the global receipt counter — row-level lock held
        // only for the duration of the UPDATE itself, not the whole checkout.
        const receiptNumber = await nextReceiptNumber(client);
        const receiptToken = generateReceiptToken();

        const invoiceResult = await client.query<{ id: string }>(
          `INSERT INTO invoice (
             register_id, receipt_number, receipt_type, payment_method, receipt_token,
             tse_transaction_number, tse_start_time, tse_end_time,
             tse_signature, tse_signature_counter, tse_serial_number
           )
           VALUES ($1, $2, 'sales_receipt', 'cash', $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            registerId, receiptNumber, receiptToken,
            tse?.transactionNumber ?? null, tse?.startTime ?? null, tse?.endTime ?? null,
            tse?.signature ?? null, tse?.signatureCounter ?? null, tse?.serialNumber ?? null,
          ],
        );
        const invoiceId = invoiceResult.rows[0]!.id;

        // Register name for the slip header — used so a returned slip can be
        // matched to the right Bonkasse during cancellation.
        const regNameResult = await client.query<{ name: string }>(
          `SELECT name FROM register WHERE id = $1`, [registerId],
        );
        registerName = regNameResult.rows[0]?.name ?? '';

        for (const pos of positions) {
          const article = articleById.get(pos.article_id)!;
          const displayName = article.receipt_text ?? article.name;
          for (let i = 0; i < pos.quantity; i++) {
            await client.query(
              `INSERT INTO order_item (
                 invoice_id, register_id, user_id, article_id,
                 article_name, article_category_name, tax_rate, price, deposit_price,
                 status
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'paid')`,
              [
                invoiceId, registerId, req.registerUser.id, article.id,
                displayName, article.category_name,
                article.tax_rate, article.price, article.deposit_price,
              ],
            );
            const depositRaw = article.deposit_price === null ? 0 : Number(article.deposit_price);
            slipUnits.push({
              name: displayName,
              priceEuros: Number(article.price),
              depositEuros: depositRaw > 0 ? depositRaw : null,
              separateDepositSlip: depositRaw > 0 && article.print_deposit_receipt,
            });
          }
        }

        return { invoice_id: invoiceId, receipt_number: receiptNumber, receipt_token: receiptToken };
      });

      // After the transaction: one self-pickup slip per article-unit on the
      // register's own printer, plus an optional separate deposit slip per
      // unit when the article is flagged for it. If the register has no
      // printer at all (neither assigned nor default) the invoice still
      // succeeds — `slip_printer_missing` surfaces the state so the UI can
      // warn without losing the sale.
      const now = new Date();
      const slipCtx = { registerName, serverName: req.registerUser.name, createdAt: now };
      // Logos are looked up once per checkout; pickup and deposit slips have
      // independent flags, so we resolve both up-front (both `null` is fine).
      const pickupLogo  = await loadLogoFor('pickup_slip');
      const depositLogo = await loadLogoFor('deposit_slip');
      let slipsEnqueued = 0;
      if (slipPrinterId) {
        for (const unit of slipUnits) {
          // Article slip: includes the deposit line only when there is a
          // deposit AND the article is NOT configured for a separate slip.
          const inlineDeposit = unit.separateDepositSlip ? null : unit.depositEuros;
          const articleBytes = buildPickupSlipEscPos(
            { name: unit.name, priceEuros: unit.priceEuros, depositEuros: inlineDeposit },
            slipCtx,
            pickupLogo?.escposBytes ?? null,
          );
          await enqueuePrintJob(slipPrinterId, 'order_slip', articleBytes);
          slipsEnqueued += 1;

          if (unit.separateDepositSlip && unit.depositEuros !== null) {
            const depositBytes = buildDepositSlipEscPos(
              { depositEuros: unit.depositEuros },
              slipCtx,
              depositLogo?.escposBytes ?? null,
            );
            await enqueuePrintJob(slipPrinterId, 'order_slip', depositBytes);
            slipsEnqueued += 1;
          }
        }
      }

      const prefix = await readReceiptPrefix();
      return reply.send({
        ...result,
        receipt_number_formatted: formatReceiptNumber(result.receipt_number, prefix),
        slips_enqueued: slipsEnqueued,
        slip_printer_missing: !slipPrinterId,
        tse_warning: tseWarning,
      });
    },
  );

  /**
   * POST /invoices/:id/print — enqueues a print job for the receipt printer assigned to the register.
   * Renders the ESC/POS bytes from the stored invoice data so reprints stay byte-identical.
   */
  app.post<{ Params: { id: string } }>('/invoices/:id/print', async (req, reply) => {
    const { id } = req.params;
    const invResult = await query<{ register_id: string; receipt_token: string | null }>(
      `SELECT register_id, receipt_token FROM invoice WHERE id = $1`,
      [id],
    );
    const inv = invResult.rows[0];
    if (!inv) return reply.status(404).send({ error: 'Rechnung nicht gefunden' });
    if (!(await userHasRegister(req.registerUser.id, inv.register_id))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }
    if (!inv.receipt_token) return reply.status(500).send({ error: 'Rechnung ohne Token' });

    const printerId = await resolvePrinterForRegister(inv.register_id);
    if (!printerId) {
      return reply.status(400).send({
        error: 'Kein Drucker verfügbar — der Kasse ist keiner zugeordnet und es ist kein Standarddrucker konfiguriert.',
      });
    }

    const data = await loadReceiptByToken(inv.receipt_token);
    if (!data) return reply.status(404).send({ error: 'Rechnungsdaten nicht ladbar' });

    const bytes = buildReceiptEscPos(data);
    const job = await enqueuePrintJob(printerId, 'receipt', bytes, id);
    return reply.send({ print_job_id: job.id });
  });

  /** GET /invoices/:id/qr.png — PNG QR-code carrying the public receipt URL for customer scanning. */
  app.get<{ Params: { id: string } }>('/invoices/:id/qr.png', async (req, reply) => {
    const { id } = req.params;
    const result = await query<{ register_id: string; receipt_token: string | null }>(
      `SELECT register_id, receipt_token FROM invoice WHERE id = $1`,
      [id],
    );
    const inv = result.rows[0];
    if (!inv) return reply.status(404).send({ error: 'Rechnung nicht gefunden' });
    if (!(await userHasRegister(req.registerUser.id, inv.register_id))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }
    if (!inv.receipt_token) return reply.status(500).send({ error: 'Rechnung ohne Token' });

    const addr = await query<{ value: string }>(
      `SELECT value FROM system_setting WHERE key = 'server_address'`,
    );
    const host = addr.rows[0]?.value ?? req.headers.host ?? 'localhost';
    const url = `http://${host}/receipt/${inv.receipt_token}`;
    const png = await renderQrPng(url, 320);
    reply.header('Content-Type', 'image/png').header('Cache-Control', 'no-store').send(png);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Bedienungskasse (service register) endpoints — operate on tables and open
  // order-items. The receipt-register endpoints above don't touch dining tables
  // because they always go straight from cart → paid invoice in one step.
  // ──────────────────────────────────────────────────────────────────────────

  /** GET /registers/:id/floor-plan — tables visible to the operator with per-table occupancy status. */
  app.get<{ Params: { id: string } }>('/registers/:id/floor-plan', async (req, reply) => {
    const { id: registerId } = req.params;
    if (!(await userHasRegister(req.registerUser.id, registerId))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }

    const tables = await query<{
      id: string; name: string; col_label: string; row_label: string;
      col_order: number; row_order: number; status: string;
      open_count: string;     // BIGINT — returned as string by pg
    }>(`
      SELECT t.id, t.name, t.col_label, t.row_label,
             c.col_order, r.row_order, t.status,
             COALESCE(o.cnt, 0)::text AS open_count
        FROM dining_table t
        JOIN floor_plan_column c ON c.label = t.col_label
        JOIN floor_plan_row    r ON r.label = t.row_label
        LEFT JOIN (
          SELECT dining_table_id, COUNT(*) AS cnt
            FROM order_item
           WHERE status = 'open' AND dining_table_id IS NOT NULL
           GROUP BY dining_table_id
        ) o ON o.dining_table_id = t.id
       WHERE t.status <> 'hidden'
       ORDER BY c.col_order, r.row_order
    `);

    return reply.send({
      tables: tables.rows.map((t) => ({
        id: t.id, name: t.name,
        col_label: t.col_label, row_label: t.row_label,
        col_order: t.col_order, row_order: t.row_order,
        status: t.status,
        has_open_items: Number(t.open_count) > 0,
      })),
    });
  });

  /** GET /articles/:id/options — list of product options for the given article. */
  app.get<{ Params: { id: string } }>('/articles/:id/options', async (req, reply) => {
    const { id } = req.params;
    const result = await query(
      `SELECT id, article_id, name, price_surcharge
         FROM product_option
        WHERE article_id = $1
        ORDER BY name`,
      [id],
    );
    return reply.send(result.rows);
  });

  /** GET /cancellation-reasons — active cancellation reasons available to the operator. */
  app.get('/cancellation-reasons', async (_req, reply) => {
    const result = await query(
      `SELECT id, name, booking_type, is_active
         FROM cancellation_reason
        WHERE is_active = true
        ORDER BY name`,
    );
    return reply.send(result.rows);
  });

  /**
   * GET /registers/:id/tables/:tableId/open-items — pending order items at the table,
   * already aggregated into groups so the frontend can render one row per (article+options)
   * combination with a quantity. The `group_key` returned here is the exact same string
   * that must be sent back in the checkout / cancel calls.
   */
  app.get<{ Params: { id: string; tableId: string } }>(
    '/registers/:id/tables/:tableId/open-items',
    async (req, reply) => {
      const { id: registerId, tableId } = req.params;
      if (!(await userHasRegister(req.registerUser.id, registerId))) {
        return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
      }

      const result = await query<{
        id: string; article_id: string | null; article_name: string;
        options: string | null; tax_rate: string; price: string;
        deposit_price: string | null; created_at: Date;
      }>(
        `SELECT id, article_id, article_name, options, tax_rate, price, deposit_price, created_at
           FROM order_item
          WHERE dining_table_id = $1 AND status = 'open'
          ORDER BY created_at`,
        [tableId],
      );

      // Aggregate by group_key — identical (article_id, options, price, deposit) merge into one row.
      const groups = new Map<string, {
        group_key: string; name: string; options: string | null;
        unit_price: number; unit_deposit: number | null; tax_rate: number;
        quantity: number; line_total: number;
      }>();
      for (const row of result.rows) {
        const key = makeGroupKey(row);
        const unitPrice = Number(row.price);
        const unitDeposit = row.deposit_price === null ? null : Number(row.deposit_price);
        const existing = groups.get(key);
        if (existing) {
          existing.quantity += 1;
          existing.line_total = Math.round((existing.line_total + unitPrice + (unitDeposit ?? 0)) * 100) / 100;
        } else {
          groups.set(key, {
            group_key: key,
            name: row.article_name,
            options: row.options,
            unit_price: unitPrice,
            unit_deposit: unitDeposit,
            tax_rate: Number(row.tax_rate),
            quantity: 1,
            line_total: Math.round((unitPrice + (unitDeposit ?? 0)) * 100) / 100,
          });
        }
      }
      return reply.send({ groups: [...groups.values()] });
    },
  );

  /**
   * POST /registers/:id/tables/:tableId/orders — places a new order at the table.
   *
   * Body: `{ positions: [{ article_id, quantity, options? }] }`
   *
   * Sequence:
   *  1. Fetches and validates the referenced articles.
   *  2. Signs one `AVBestellung` TSE transaction for the whole order (not per
   *     position) BEFORE opening the DB transaction. Never blocks the order —
   *     a TSE failure just means `service_order`'s `tse_*` columns stay `null`
   *     and `tse_warning` is set in the response; see docs/TSE-Integration.md
   *     → "TSE-Ausfall".
   *  3. Inside a single DB transaction: inserts the `service_order` row
   *     (including the TSE fields, if any) and one `order_item` per ordered
   *     unit with `status='open'`.
   *  4. Builds kitchen-/bar-order-slip ESC/POS payloads grouped by printer
   *     (with default-printer fallback) and enqueues one print job per target printer.
   */
  app.post<{
    Params: { id: string; tableId: string };
    Body: { positions: { article_id: string; quantity: number; options?: string | null }[] };
  }>('/registers/:id/tables/:tableId/orders', async (req, reply) => {
    const { id: registerId, tableId } = req.params;
    const { positions } = req.body;

    if (!Array.isArray(positions) || positions.length === 0) {
      return reply.status(400).send({ error: 'Bestellliste ist leer' });
    }
    for (const p of positions) {
      if (!p.article_id || typeof p.quantity !== 'number' || !Number.isInteger(p.quantity) || p.quantity < 1) {
        return reply.status(400).send({ error: 'Ungültige Position' });
      }
    }
    if (!(await userHasRegister(req.registerUser.id, registerId))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }
    {
      const locked = await lockedResponse(registerId);
      if (locked) return reply.status(locked.status).send(locked.body);
    }

    // Validate the table exists and is bookable (active). Hidden / inactive tables refuse new orders.
    const tableCheck = await query<{ name: string; status: string }>(
      `SELECT name, status FROM dining_table WHERE id = $1`, [tableId],
    );
    if (tableCheck.rows.length === 0) return reply.status(404).send({ error: 'Tisch nicht gefunden' });
    if (tableCheck.rows[0]!.status !== 'active') {
      return reply.status(409).send({ error: 'Tisch ist nicht bestellbar' });
    }
    const tableName = tableCheck.rows[0]!.name;

    // Find the default printer (used as fallback when an article has no printer assignment).
    const defaultPrinter = await query<{ id: string }>(
      `SELECT id FROM printer WHERE is_default = true LIMIT 1`,
    );
    const defaultPrinterId = defaultPrinter.rows[0]?.id ?? null;

    // Articles fetched once, up front — reused for the TSE snapshot and the order_item inserts.
    const articleIds = [...new Set(positions.map((p) => p.article_id))];
    const articlesResult = await query<{
      id: string; name: string; receipt_text: string | null; price: string;
      deposit_price: string | null; printer_id: string | null;
      category_name: string; tax_rate: string;
    }>(
      `SELECT a.id, a.name, a.receipt_text, a.price, a.deposit_price, a.printer_id,
              c.name AS category_name, c.tax_rate
         FROM article a
         JOIN article_category c ON c.id = a.category_id
        WHERE a.id = ANY($1)`,
      [articleIds],
    );
    const articleById = new Map(articlesResult.rows.map((a) => [a.id, a]));
    for (const pos of positions) {
      if (!articleById.has(pos.article_id)) {
        return reply.status(400).send({ error: `Artikel ${pos.article_id} nicht gefunden` });
      }
    }

    // One AVBestellung signature per Bestellvorgang, not per position — see
    // docs/Anforderungen.md → "Zu signierende Vorgänge in FairPOS".
    const avBestellungSnapshot = buildAvBestellungProcessData({
      registerId,
      diningTableId: tableId,
      positions: positions.map((p) => {
        const article = articleById.get(p.article_id)!;
        return {
          articleId: article.id,
          name: article.receipt_text ?? article.name,
          quantity: p.quantity,
          unitPriceEuros: Number(article.price),
          depositPriceEuros: article.deposit_price === null ? null : Number(article.deposit_price),
          taxRatePercent: Number(article.tax_rate),
        };
      }),
    });
    const { signature: tse, warning: tseWarning } = await signTseTransaction('AVBestellung', avBestellungSnapshot);

    const slipItems: OrderSlipItem[] = [];

    await withTransaction(async (client) => {
      // One `service_order` per Bestellvorgang. All order_items from this
      // call reference the same service_order.
      const soResult = await client.query<{ id: string }>(
        `INSERT INTO service_order (
           register_id, dining_table_id, user_id,
           tse_transaction_number, tse_start_time, tse_end_time,
           tse_signature, tse_signature_counter, tse_serial_number
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          registerId, tableId, req.registerUser.id,
          tse?.transactionNumber ?? null, tse?.startTime ?? null, tse?.endTime ?? null,
          tse?.signature ?? null, tse?.signatureCounter ?? null, tse?.serialNumber ?? null,
        ],
      );
      const serviceOrderId = soResult.rows[0]!.id;

      for (const pos of positions) {
        const article = articleById.get(pos.article_id)!;
        const options = pos.options?.trim() ? pos.options.trim() : null;
        for (let i = 0; i < pos.quantity; i++) {
          await client.query(
            `INSERT INTO order_item (
               service_order_id, dining_table_id, register_id, user_id, article_id,
               article_name, article_category_name, tax_rate, price, deposit_price,
               options, status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open')`,
            [
              serviceOrderId, tableId, registerId, req.registerUser.id, article.id,
              article.receipt_text ?? article.name, article.category_name,
              article.tax_rate, article.price, article.deposit_price,
              options,
            ],
          );
          slipItems.push({
            name: article.receipt_text ?? article.name,
            options,
            printer_id: article.printer_id,
            category_name: article.category_name,
          });
        }
      }
    });

    // Enqueue one slip per printer bucket. Items routed to an unknown printer
    // (no per-article and no default) are silently dropped — we cannot print them.
    const buckets = bucketItemsByPrinter(slipItems, defaultPrinterId);
    const now = new Date();
    const orderLogo = await loadLogoFor('order_slip');
    let enqueued = 0, skipped = 0;
    for (const bucket of buckets) {
      if (!bucket.printer_id) { skipped += bucket.lines.length; continue; }
      const bytes = buildOrderSlipEscPos(bucket, {
        tableName, serverName: req.registerUser.name, createdAt: now,
      }, orderLogo?.escposBytes ?? null);
      await enqueuePrintJob(bucket.printer_id, 'order_slip', bytes);
      enqueued += 1;
    }

    return reply.send({
      ok: true, slips_enqueued: enqueued, items_without_printer: skipped, tse_warning: tseWarning,
    });
  });

  /**
   * POST /registers/:id/tables/:tableId/checkout — finalises a partial-or-full payment.
   *
   * Body: `{ quantities: [{ group_key, count }] }`
   *
   * Sequence:
   *  1. Loads the table's open items and picks `count` items per group (FIFO
   *     by `created_at`) — exactly once; the picked IDs are used as-is below
   *     instead of being re-derived, so the TSE-signed snapshot always
   *     matches what actually gets invoiced.
   *  2. Signs one `Kassenbeleg-V1` TSE transaction for the picked items
   *     BEFORE opening the DB transaction. Never blocks the payment — see
   *     docs/TSE-Integration.md → "TSE-Ausfall".
   *  3. Inside a single DB transaction: re-checks the picked items are still
   *     `open` (defends against a concurrent change to the same table),
   *     inserts an invoice with a fresh receipt number (including the TSE
   *     fields, if any), and updates the picked `order_item` rows to
   *     `status='paid'`, linked to the invoice.
   */
  app.post<{
    Params: { id: string; tableId: string };
    Body: { quantities: { group_key: string; count: number }[] };
  }>('/registers/:id/tables/:tableId/checkout', async (req, reply) => {
    const { id: registerId, tableId } = req.params;
    const { quantities } = req.body;

    if (!Array.isArray(quantities) || quantities.length === 0) {
      return reply.status(400).send({ error: 'Keine Positionen ausgewählt' });
    }
    if (!(await userHasRegister(req.registerUser.id, registerId))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }
    {
      const locked = await lockedResponse(registerId);
      if (locked) return reply.status(locked.status).send(locked.body);
    }

    const quantitiesMap = new Map<string, number>();
    for (const q of quantities) {
      if (!q.group_key || typeof q.count !== 'number' || !Number.isInteger(q.count) || q.count < 0) {
        return reply.status(400).send({ error: 'Ungültige Mengenangabe' });
      }
      if (q.count > 0) quantitiesMap.set(q.group_key, q.count);
    }
    if (quantitiesMap.size === 0) {
      return reply.status(400).send({ error: 'Keine Positionen ausgewählt' });
    }

    const open = await query<{
      id: string; article_id: string | null; article_name: string; options: string | null;
      tax_rate: string; price: string; deposit_price: string | null; created_at: Date;
    }>(
      `SELECT id, article_id, article_name, options, tax_rate, price, deposit_price, created_at
         FROM order_item
        WHERE dining_table_id = $1 AND status = 'open'`,
      [tableId],
    );
    const ids = pickItemsToCharge(open.rows, quantitiesMap);
    if (ids.length === 0) {
      return reply.status(409).send({ error: 'Keine passenden offenen Positionen am Tisch' });
    }
    const pickedById = new Map(open.rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r]));

    const kassenbelegSnapshot = buildKassenbelegProcessData({
      registerId,
      paymentMethod: 'cash',
      receiptType: 'sales_receipt',
      positions: ids.map((id) => {
        const item = pickedById.get(id)!;
        return {
          articleId: item.article_id ?? '',
          name: item.article_name,
          quantity: 1,
          unitPriceEuros: Number(item.price),
          depositPriceEuros: item.deposit_price === null ? null : Number(item.deposit_price),
          taxRatePercent: Number(item.tax_rate),
        };
      }),
    });
    const { signature: tse, warning: tseWarning } = await signTseTransaction('Kassenbeleg-V1', kassenbelegSnapshot);

    const result = await withTransaction(async (client) => {
      // Defends against a concurrent change (another checkout/cancel on the
      // same table) between the pick above and this transaction — the TSE
      // signature must describe exactly what gets invoiced, so we verify
      // rather than re-pick.
      const stillOpen = await client.query(
        `SELECT id FROM order_item WHERE id = ANY($1) AND status = 'open'`, [ids],
      );
      if (stillOpen.rowCount !== ids.length) {
        throw Object.assign(
          new Error('Einige Positionen wurden zwischenzeitlich verändert — bitte erneut versuchen.'),
          { httpStatus: 409 },
        );
      }

      // Atomic increment of the global receipt counter (row-level lock only).
      const receiptNumber = await nextReceiptNumber(client);
      const receiptToken = generateReceiptToken();

      const inv = await client.query<{ id: string }>(
        `INSERT INTO invoice (
           register_id, receipt_number, receipt_type, payment_method, receipt_token,
           tse_transaction_number, tse_start_time, tse_end_time,
           tse_signature, tse_signature_counter, tse_serial_number
         )
         VALUES ($1, $2, 'sales_receipt', 'cash', $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          registerId, receiptNumber, receiptToken,
          tse?.transactionNumber ?? null, tse?.startTime ?? null, tse?.endTime ?? null,
          tse?.signature ?? null, tse?.signatureCounter ?? null, tse?.serialNumber ?? null,
        ],
      );
      const invoiceId = inv.rows[0]!.id;

      await client.query(
        `UPDATE order_item SET status = 'paid', invoice_id = $1 WHERE id = ANY($2)`,
        [invoiceId, ids],
      );

      return { invoice_id: invoiceId, receipt_number: receiptNumber, receipt_token: receiptToken, items_charged: ids.length };
    }).catch((err: Error & { httpStatus?: number }) => {
      if (err.httpStatus) return { error: err.message, status: err.httpStatus };
      throw err;
    });

    if ('error' in result) return reply.status(result.status).send({ error: result.error });
    const prefix = await readReceiptPrefix();
    return reply.send({
      ...result,
      receipt_number_formatted: formatReceiptNumber(result.receipt_number, prefix),
      tse_warning: tseWarning,
    });
  });

  /**
   * POST /registers/:id/tables/:tableId/cancel — cancels or marks-as-free selected positions.
   *
   * Body: `{ quantities, cancellation_reason_id }`
   *
   * Behaviour depends on the reason's `booking_type` (`cancellation` → order
   * items set to `status='cancelled'`; `free_of_charge` → `status='free'`),
   * but both are signed as one `AVSonstige` TSE transaction per Stornovorgang
   * — see docs/Anforderungen.md → "Zu signierende Vorgänge in FairPOS", which
   * lists both "Storno einer offenen Bestellposition" and "kostenfreie Abgabe
   * vor Kassierung" as AVSonstige examples. Never blocks the cancellation —
   * see docs/TSE-Integration.md → "TSE-Ausfall".
   *
   * Sequence: picks the affected items once (FIFO by `created_at`), signs
   * AVSonstige for that exact set, then re-verifies inside the DB transaction
   * that they're still open before applying the status change — same
   * pick-once-then-verify pattern as the checkout endpoint above.
   */
  app.post<{
    Params: { id: string; tableId: string };
    Body: {
      quantities: { group_key: string; count: number }[];
      cancellation_reason_id: string;
    };
  }>('/registers/:id/tables/:tableId/cancel', async (req, reply) => {
    const { id: registerId, tableId } = req.params;
    const { quantities, cancellation_reason_id } = req.body;

    if (!cancellation_reason_id) return reply.status(400).send({ error: 'Stornogrund erforderlich' });
    if (!Array.isArray(quantities) || quantities.length === 0) {
      return reply.status(400).send({ error: 'Keine Positionen ausgewählt' });
    }
    if (!(await userHasRegister(req.registerUser.id, registerId))) {
      return reply.status(403).send({ error: 'Keine Berechtigung für diese Kasse' });
    }
    {
      const locked = await lockedResponse(registerId);
      if (locked) return reply.status(locked.status).send(locked.body);
    }

    const reasonResult = await query<{ booking_type: 'cancellation' | 'free_of_charge'; is_active: boolean }>(
      `SELECT booking_type, is_active FROM cancellation_reason WHERE id = $1`,
      [cancellation_reason_id],
    );
    const reason = reasonResult.rows[0];
    if (!reason || !reason.is_active) {
      return reply.status(404).send({ error: 'Stornogrund nicht gefunden' });
    }

    const quantitiesMap = new Map<string, number>();
    for (const q of quantities) {
      if (q.count > 0) quantitiesMap.set(q.group_key, q.count);
    }
    if (quantitiesMap.size === 0) return reply.status(400).send({ error: 'Keine Positionen ausgewählt' });

    const open = await query<{
      id: string; article_id: string | null; article_name: string; options: string | null;
      price: string; deposit_price: string | null; created_at: Date;
    }>(
      `SELECT id, article_id, article_name, options, price, deposit_price, created_at
         FROM order_item
        WHERE dining_table_id = $1 AND status = 'open'`,
      [tableId],
    );
    const ids = pickItemsToCharge(open.rows, quantitiesMap);
    if (ids.length === 0) {
      return reply.status(409).send({ error: 'Keine passenden offenen Positionen am Tisch' });
    }
    const pickedById = new Map(open.rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r]));

    const avSonstigeSnapshot = buildAvSonstigeProcessData({
      registerId,
      bookingType: reason.booking_type,
      cancellationReasonId: cancellation_reason_id,
      positions: ids.map((id) => {
        const item = pickedById.get(id)!;
        return {
          articleId: item.article_id ?? '',
          name: item.article_name,
          quantity: 1,
          unitPriceEuros: Number(item.price),
        };
      }),
    });
    const { signature: tse, warning: tseWarning } = await signTseTransaction('AVSonstige', avSonstigeSnapshot);

    const result = await withTransaction(async (client) => {
      const stillOpen = await client.query(
        `SELECT id FROM order_item WHERE id = ANY($1) AND status = 'open'`, [ids],
      );
      if (stillOpen.rowCount !== ids.length) {
        throw Object.assign(
          new Error('Einige Positionen wurden zwischenzeitlich verändert — bitte erneut versuchen.'),
          { httpStatus: 409 },
        );
      }

      const nextStatus = reason.booking_type === 'cancellation' ? 'cancelled' : 'free';

      // One `order_cancellation` per Stornovorgang. All order_items affected
      // by this call reference the same cancellation.
      const cancellationResult = await client.query<{ id: string }>(
        `INSERT INTO order_cancellation (
           register_id, cancellation_reason_id, cancelled_by,
           tse_transaction_number, tse_start_time, tse_end_time,
           tse_signature, tse_signature_counter, tse_serial_number
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          registerId, cancellation_reason_id, req.registerUser.id,
          tse?.transactionNumber ?? null, tse?.startTime ?? null, tse?.endTime ?? null,
          tse?.signature ?? null, tse?.signatureCounter ?? null, tse?.serialNumber ?? null,
        ],
      );
      const cancellationId = cancellationResult.rows[0]!.id;

      await client.query(
        `UPDATE order_item
            SET status = $1,
                cancellation_reason_id = $2,
                cancelled_by = $3,
                cancelled_at = now(),
                order_cancellation_id = $5
          WHERE id = ANY($4)`,
        [nextStatus, cancellation_reason_id, req.registerUser.id, ids, cancellationId],
      );

      return { items_cancelled: ids.length, booking_type: reason.booking_type };
    }).catch((err: Error & { httpStatus?: number }) => {
      if (err.httpStatus) return { error: err.message, status: err.httpStatus };
      throw err;
    });

    if ('error' in result) return reply.status(result.status).send({ error: result.error });
    return reply.send({ ...result, tse_warning: tseWarning });
  });
}
