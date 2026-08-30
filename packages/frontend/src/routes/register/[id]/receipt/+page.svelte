<script lang="ts">
  /**
   * Receipt confirmation (QR code + print) after a Bonkasse checkout — its
   * own route rather than a modal on top of the register page (Nutzervorgabe,
   * 2026-08-30: einheitliche UX mit der Bedienungskasse, siehe deren
   * `tables/[tableId]/checkout/receipt`). Everything shown here arrives via
   * query params from the register page's `startCheckout()` — a one-shot
   * handoff of data already in hand there, not worth a dedicated endpoint.
   */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  let registerId = $derived(page.params['id'] ?? '');
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

  /** Back to the register's article grid — a full navigation, so the order list is always freshly empty (no stale-state risk like the old in-page modal had). */
  function finish() {
    goto(`/register/${registerId}`);
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<div class="page">
  <header class="header">
    <h1>Rechnung {receiptNumber}</h1>
  </header>

  <div class="checkout-body">
    <div class="qr-wrap">
      <img class="qr" src={api.registerSession.qrUrl(invoiceId)} alt="QR-Code zur Rechnung" />
      <p class="qr-hint">Vom Kunden mit dem Smartphone scannen</p>
    </div>
    <div class="totals">
      <div class="total-final" class:negative={total < 0}>{fmt(total)} €</div>
      <div class="muted small">{count} Artikel</div>
    </div>
  </div>

  {#if tseWarning}<p class="warning-text">⚠ {tseWarning}</p>{/if}
  {#if printDone}<p class="success-text">✓ Bon wird gedruckt</p>{/if}
  {#if error}<p class="error-text">{error}</p>{/if}

  <div class="actions">
    <button class="btn-ghost" onclick={finish} disabled={printing}>Rechnung per QR Code gescannt</button>
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

  .checkout-body { display: flex; gap: 1.5rem; align-items: center; padding: 0.5rem 0; flex-wrap: wrap; }
  .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .qr { width: 200px; height: 200px; background: white; padding: 0.5rem; border-radius: var(--radius-sm); }
  .qr-hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; text-align: center; }
  .totals { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .total-final { font-size: 2rem; font-weight: 700; }
  .total-final.negative { color: var(--color-danger); }
  .small { font-size: 0.85rem; }

  .success-text { color: #4caf7d; font-size: 0.9rem; margin-top: 0.5rem; }
  .warning-text { color: #f59e0b; font-size: 0.9rem; margin-top: 0.5rem; font-weight: 600; }
  .error-text { color: var(--color-danger); font-size: 0.9rem; margin-top: 0.5rem; }

  .actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
  .actions .spacer { flex: 1; }
  .actions .btn-primary { padding: 0.7rem 1.5rem; font-size: 1rem; }
</style>
