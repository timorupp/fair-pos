<script lang="ts">
  /**
   * Receipt confirmation (print or decline) after a table checkout — its own
   * route rather than a modal on top of the checkout page (Nutzervorgabe,
   * 2026-08-30: too cramped as an in-page dialog on a phone). Everything
   * shown here arrives via query params from the checkout page's `charge()`
   * — a one-shot handoff of data already in hand there, not worth a
   * dedicated endpoint.
   * No customer-facing QR code anymore (Task #100, 2026-09-01) — the digital
   * guest receipt feature was removed; "Kunde wünscht keinen Beleg" replaces
   * the old "Rechnung per QR Code gescannt" button but keeps its behavior
   * (close without printing).
   */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  let registerId = $derived(page.params['id'] ?? '');
  let tableId = $derived(page.params['tableId'] ?? '');
  let invoiceId = $derived(page.url.searchParams.get('invoiceId') ?? '');
  let receiptNumber = $derived(page.url.searchParams.get('receiptNumber') ?? '');
  let total = $derived(Number(page.url.searchParams.get('total') ?? '0'));
  let count = $derived(Number(page.url.searchParams.get('count') ?? '0'));
  let tseWarning = $derived(page.url.searchParams.get('tseWarning'));

  let printing = $state(false);
  let printDone = $state(false);
  let error = $state('');

  async function printReceipt() {
    if (!invoiceId) return;
    printing = true; error = '';
    try {
      await api.registerSession.print(invoiceId);
      printDone = true;
      setTimeout(finish, 1200);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      printing = false;
    }
  }

  /** Back to the table's action chooser — a full navigation, so the open-items list is always freshly loaded (no stale-state risk like the old in-page modal had, see D-047). */
  function finish() {
    goto(`/register/${registerId}/tables/${tableId}`);
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<div class="page">
  <header class="header">
    <h1>Rechnung {receiptNumber}</h1>
  </header>

  <div class="checkout-body">
    <div class="totals">
      <div class="total-final">{fmt(total)} €</div>
      <div class="muted small">{count} Artikel</div>
    </div>
  </div>

  {#if tseWarning}<p class="warning-text">⚠ {tseWarning}</p>{/if}
  {#if printDone}<p class="success-text">✓ Bon wird gedruckt</p>{/if}
  {#if error}<p class="error-text">{error}</p>{/if}

  <div class="actions">
    <button class="btn-ghost" onclick={finish} disabled={printing}>Kunde wünscht keinen Beleg</button>
    <div class="spacer"></div>
    <button class="btn-primary" onclick={printReceipt} disabled={printing || printDone}>
      {printing ? 'Drucke…' : 'Rechnung drucken'}
    </button>
  </div>
</div>

<style>
  .page { padding: 1rem; max-width: 500px; margin: 0 auto; }
  .header { margin-bottom: 1.25rem; }
  .header h1 { font-size: 1.2rem; margin: 0; }

  .checkout-body { display: flex; padding: 0.5rem 0; }
  .totals { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .total-final { font-size: 2rem; font-weight: 700; }
  .small { font-size: 0.85rem; }

  .success-text { color: #4caf7d; font-size: 0.9rem; margin-top: 0.5rem; }
  .warning-text { color: #f59e0b; font-size: 0.9rem; margin-top: 0.5rem; font-weight: 600; }

  .actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
  .actions .spacer { flex: 1; }
  .actions .btn-primary { padding: 0.7rem 1.5rem; font-size: 1rem; }
</style>
