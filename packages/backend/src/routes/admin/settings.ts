import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../db/client.js';
import { authenticateAdmin } from '../../middleware/authenticate.js';
import { buildDemoReceipt } from '../../receipt/data.js';
import { renderReceiptPdf } from '../../receipt/pdf.js';
import { raiseCounterFloor } from '../../receipt/sequence.js';
import { rerenderStoredLogo } from '../../logo/logo.js';
import { loadLogoFor } from '../../logo/visibility.js';
import { applyTseSettings, TSE_SETTING_KEYS } from '../../tse/settings.js';

/** Keys used in the system_setting table. */
const ALLOWED_KEYS = new Set([
  'company_name', 'company_street', 'company_postal_code', 'company_city',
  'company_tax_number', 'company_vat_id', 'receipt_prefix', 'receipt_counter_start',
  'vat_rate_deposit',
  // Per-document-type checkboxes for the company logo.
  'logo_on_receipt', 'logo_on_cancellation', 'logo_on_z_bon',
  'logo_on_order_slip', 'logo_on_pickup_slip', 'logo_on_deposit_slip',
  // Zoom (1–500 %) that scales the rendered logo relative to the bon width.
  'logo_zoom_percent',
  // TSE connection (mount path, client id, persisted TimeAdmin-PIN — see
  // docs/TSE-Integration.md Abschnitt 7).
  ...TSE_SETTING_KEYS,
]);

/**
 * Keys editable only by a System-Administrator (Task #94) — everything else
 * in `ALLOWED_KEYS` is editable by a Veranstaltungs-Administrator too. A
 * renting club needs to set its own company data/logo/TSE connection, but
 * must not touch the legally-sensitive global receipt numbering or the
 * statutory deposit VAT rate.
 */
const SYSTEM_ONLY_KEYS = new Set([
  'receipt_prefix', 'receipt_counter_start', 'vat_rate_deposit',
]);

/** Admin routes for system settings (key-value store). */
export async function settingsAdminRoute(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  /** GET /api/admin/settings — return all settings as a flat object. */
  app.get('/', async (_req, reply) => {
    const result = await query('SELECT key, value FROM system_setting');
    const settings: Record<string, string> = {};
    for (const row of result.rows as { key: string; value: string }[]) {
      settings[row.key] = row.value;
    }
    return reply.send(settings);
  });

  /**
   * PUT /api/admin/settings — upsert a batch of key-value pairs.
   *
   * Side effect: when `receipt_counter_start` is updated, the actual counter row
   * (`receipt_counter`) is pulled UP to `start - 1` if it is currently lower —
   * so the next issued receipt number respects the new floor. The counter is
   * never lowered, because KassenSichV forbids regression of an already-issued
   * sequence.
   */
  app.put('/', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const entries = Object.entries(body).filter(
      ([k]) => ALLOWED_KEYS.has(k) && (req.adminUser.is_admin || !SYSTEM_ONLY_KEYS.has(k)),
    );

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO system_setting (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value],
      );
      if (key === 'receipt_counter_start') {
        const desired = Number(value);
        if (Number.isFinite(desired) && desired > 0) {
          await raiseCounterFloor(pool, desired);
        }
      }
      if (key === 'logo_zoom_percent') {
        // Re-render the stored logo with the new zoom. No-op when nothing is
        // uploaded; clamping happens inside `rerenderStoredLogo`.
        await rerenderStoredLogo(Number(value));
      }
    }
    // Mount path / client id are read synchronously from `config` on the hot
    // checkout path (see tse/client.ts) — apply immediately so a save takes
    // effect without a backend restart.
    applyTseSettings(Object.fromEntries(entries));
    return reply.status(204).send();
  });

  /**
   * GET /api/admin/settings/receipt-preview — renders a demo receipt PDF for
   * the company-data UI. `buildDemoReceipt()` stays DB-free (used as-is in
   * unit tests) — the logo (gated by the "logo_on_receipt" checkbox, same as
   * a real sales receipt) is loaded here and merged in separately, otherwise
   * the preview would never show the logo even when configured to appear on
   * receipts.
   */
  app.get('/receipt-preview', async (_req, reply) => {
    const logo = await loadLogoFor('receipt');
    const pdf = await renderReceiptPdf({
      ...buildDemoReceipt(),
      logoPng: logo?.pdfPng ?? null,
      logoWidth: logo?.pdfWidth ?? 0,
      logoHeight: logo?.pdfHeight ?? 0,
      logoWidthFactor: logo?.pdfWidthFactor ?? 0,
      // Task #105: the shared block builder now needs the ESC/POS raster
      // too (a receipt's logo block carries both representations), even
      // though this endpoint only ever renders the PDF — without this, the
      // logo image block was silently skipped entirely, PDF or not.
      logoEscPos: logo?.escposBytes ?? null,
    });
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'inline; filename="bon-vorschau.pdf"')
      .header('Cache-Control', 'no-store')
      .send(pdf);
  });
}
