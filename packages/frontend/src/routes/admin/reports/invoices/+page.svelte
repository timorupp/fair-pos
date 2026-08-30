<script lang="ts">
  /**
   * "Erstellte Rechnungen" report: list of all invoices issued during the
   * selected event with a link to download the receipt PDF.
   */
  import { api } from '$lib/api';
  import EventSelector from '$lib/components/EventSelector.svelte';

  type InvoiceRow = {
    id: string; receipt_number: number; receipt_number_formatted: string; receipt_type: string;
    payment_method: string; created_at: string; register_name: string;
    receipt_token: string | null; total_gross: number;
  };

  let selectedEventId: string | null = $state(null);
  let invoices: InvoiceRow[] = $state([]);
  let loading = $state(false);
  let error = $state('');

  /** Id of the invoice currently being reprinted (one at a time so the row spinner is unambiguous). */
  let reprintingId: string | null = $state(null);
  let reprintError = $state('');
  let reprintMessage = $state('');

  /**
   * Re-queues the print job for an already-issued invoice. The result message
   * stays visible for a few seconds so the operator sees the confirmation.
   *
   * @param invoiceId - UUID of the invoice to reprint.
   */
  async function reprint(invoiceId: string) {
    reprintError = ''; reprintMessage = ''; reprintingId = invoiceId;
    try {
      await api.admin.invoices.reprint(invoiceId);
      reprintMessage = '✓ Druckauftrag erstellt';
      setTimeout(() => { if (reprintMessage === '✓ Druckauftrag erstellt') reprintMessage = ''; }, 4000);
    } catch (e) {
      reprintError = e instanceof Error ? e.message : 'Fehler beim Drucken';
    } finally {
      reprintingId = null;
    }
  }

  /**
   * Called by the EventSelector whenever the selection changes; triggers a reload.
   */
  async function onEventChange() {
    if (!selectedEventId) { invoices = []; return; }
    loading = true; error = '';
    try {
      const result = await api.admin.reports.invoices(selectedEventId);
      invoices = result.invoices;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  let total = $derived(invoices.reduce((s, i) => s + i.total_gross, 0));

  /**
   * Formats a number as a German euro amount with two decimals.
   *
   * @param n - Amount to format.
   * @returns The amount as a `1.234,56` string.
   */
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Formats an ISO timestamp as a short German date+time string.
   *
   * @param iso - ISO-8601 timestamp.
   * @returns Date+time formatted in the user's locale, or the raw input on error.
   */
  function timeLabel(iso: string): string {
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  }

  /**
   * Maps the database receipt type to a German label.
   *
   * @param t - The `receipt_type` value from the API.
   * @returns Human-readable German label.
   */
  function typeLabel(t: string): string {
    if (t === 'sales_receipt') return 'Verkauf';
    if (t === 'cancellation') return 'Storno';
    if (t === 'training') return 'Training';
    return t;
  }

  /**
   * Maps the database payment method to a German label.
   *
   * @param m - The `payment_method` value from the API.
   * @returns Human-readable German label.
   */
  function paymentLabel(m: string): string {
    if (m === 'cash') return 'Bar';
    if (m === 'card') return 'Karte';
    return m;
  }
</script>

<div class="page">
  <div class="page-header"><h1>Erstellte Rechnungen</h1></div>

  <EventSelector bind:selectedId={selectedEventId} on:change={onEventChange} />

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if !selectedEventId}
    <p class="muted">Bitte eine Veranstaltung wählen.</p>
  {:else if invoices.length === 0}
    <p class="muted">Keine Rechnungen in diesem Zeitraum.</p>
  {:else}
    <div class="summary">
      <span class="summary-label">{invoices.length} Rechnungen</span>
      <span class="summary-value">{fmt(total)} €</span>
    </div>

    <table>
      <thead>
        <tr>
          <th class="num">Beleg-Nr.</th>
          <th>Datum</th>
          <th>Typ</th>
          <th>Zahlung</th>
          <th>Kasse</th>
          <th class="num">Summe</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each invoices as inv}
          <tr>
            <td class="num">{inv.receipt_number_formatted}</td>
            <td>{timeLabel(inv.created_at)}</td>
            <td>{typeLabel(inv.receipt_type)}</td>
            <td>{paymentLabel(inv.payment_method)}</td>
            <td>{inv.register_name}</td>
            <td class="num">{fmt(inv.total_gross)} €</td>
            <td class="row-actions">
              <a class="btn-ghost" href={api.admin.invoices.pdfUrl(inv.id)} target="_blank" rel="noopener">PDF</a>
              <button class="btn-ghost"
                      onclick={() => reprint(inv.id)}
                      disabled={reprintingId === inv.id}
                      title="Bon erneut drucken">
                {reprintingId === inv.id ? '…' : '🖨'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if reprintError}<p class="error-text">{reprintError}</p>{/if}
    {#if reprintMessage}<p class="success-text">{reprintMessage}</p>{/if}
  {/if}
</div>

<style>
  .summary {
    display: flex; align-items: baseline; gap: 1.5rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 0.75rem 1.25rem; margin-bottom: 1rem;
  }
  .summary-label { font-size: 0.9rem; color: var(--color-text-muted); font-weight: 600; }
  .summary-value { font-size: 1.1rem; font-weight: 700; }
  .row-actions { display: flex; gap: 0.25rem; }
  .success-text { color: #4caf7d; font-size: 0.875rem; margin-top: 0.5rem; }
</style>
