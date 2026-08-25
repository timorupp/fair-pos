<script lang="ts">
  import { run } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import Modal from '$lib/components/Modal.svelte';

  type OpenGroup = {
    group_key: string;
    name: string;
    options: string | null;
    unit_price: number;
    unit_deposit: number | null;
    tax_rate: number;
    quantity: number;       // total quantity open at the table
    line_total: number;     // gross total for that quantity
  };

  let registerId = $state('');
  let tableId = $state('');
  let groups: OpenGroup[] = $state([]);
  // Map from group_key → quantity selected for this checkout.
  let selected: Map<string, number> = $state(new Map());
  let loading = $state(true);
  let error = $state('');

  // Confirmation / result modal — reuses the same QR-dialog pattern as the Bonkasse.
  let confirmationOpen = $state(false);
  let busy = $state(false);
  let lastInvoiceId: string | null = $state(null);
  let lastReceiptNumber: string | null = $state(null);
  let printDone = $state(false);
  let printing = $state(false);
  /** Set when a configured TSE failed to sign the sale — the sale still went through, see docs/TSE-Integration.md. */
  let tseWarning: string | null = $state(null);

  // Cancel dialog
  let cancelOpen = $state(false);
  let cancelReasonId = $state('');
  let cancelReasons: { id: string; name: string; booking_type: 'cancellation' | 'free_of_charge' }[] = $state([]);
  let canceling = $state(false);
  let cancelError = $state('');

  run(() => {
    registerId = ($page.params['id'] ?? '') as string;
  });
  run(() => {
    tableId = ($page.params['tableId'] ?? '') as string;
  });

  onMount(async () => {
    await Promise.all([loadOpen(), loadReasons()]);
  });

  async function loadOpen() {
    loading = true; error = '';
    try {
      const result = await api.registerSession.openItems(registerId, tableId);
      groups = result.groups;
      // Default: full quantity per group selected — operator can reduce as needed.
      const next = new Map<string, number>();
      for (const g of groups) next.set(g.group_key, g.quantity);
      selected = next;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  async function loadReasons() {
    try {
      cancelReasons = await api.registerSession.cancellationReasons();
      cancelReasonId = cancelReasons[0]?.id ?? '';
    } catch {
      cancelReasons = [];
    }
  }

  function changeQty(g: OpenGroup, delta: number) {
    const cur = selected.get(g.group_key) ?? 0;
    const next = Math.max(0, Math.min(g.quantity, cur + delta));
    selected = new Map(selected.set(g.group_key, next));
  }

  function resetAll() {
    const next = new Map<string, number>();
    for (const g of groups) next.set(g.group_key, 0);
    selected = next;
  }

  let selectedCount = $derived([...selected.values()].reduce((s, n) => s + n, 0));
  let selectedTotal = $derived(Math.round(groups.reduce((s, g) => {
    const n = selected.get(g.group_key) ?? 0;
    return s + (g.unit_price + (g.unit_deposit ?? 0)) * n;
  }, 0) * 100) / 100);

  /** Returns the quantities-array to send to the API, dropping zero entries. */
  function selectedQuantities(): { group_key: string; count: number }[] {
    return [...selected.entries()]
      .filter(([, count]) => count > 0)
      .map(([group_key, count]) => ({ group_key, count }));
  }

  async function charge() {
    if (selectedCount === 0) return;
    busy = true; error = '';
    try {
      const result = await api.registerSession.chargeTable(registerId, tableId, selectedQuantities());
      lastInvoiceId = result.invoice_id;
      lastReceiptNumber = result.receipt_number_formatted;
      tseWarning = result.tse_warning;
      confirmationOpen = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      busy = false;
    }
  }

  async function printReceipt() {
    if (!lastInvoiceId) return;
    printing = true; error = '';
    try {
      await api.registerSession.print(lastInvoiceId);
      printDone = true;
      setTimeout(finishConfirmation, 1200);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      printing = false;
    }
  }

  function finishConfirmation() {
    confirmationOpen = false;
    lastInvoiceId = null;
    lastReceiptNumber = null;
    printDone = false;
    tseWarning = null;
    // Refresh open items and return to the table action chooser if everything was paid.
    goto(`/register/${registerId}/tables/${tableId}`);
  }

  function openCancelDialog() {
    if (selectedCount === 0) return;
    cancelError = '';
    cancelOpen = true;
  }

  async function confirmCancel() {
    if (!cancelReasonId) { cancelError = 'Stornogrund wählen'; return; }
    canceling = true; cancelError = '';
    try {
      const result = await api.registerSession.cancelAtTable(registerId, tableId, selectedQuantities(), cancelReasonId);
      cancelOpen = false;
      // TSE-Signierung blockiert die Stornierung nie (siehe docs/TSE-Integration.md
      // → "TSE-Ausfall"). The dialog closes right away, so an inline warning
      // wouldn't be seen — alert() matches the pattern used on the order page.
      if (result.tse_warning) alert(`⚠ ${result.tse_warning}`);
      // Reload to reflect the (now removed/transitioned) items, then back to action chooser.
      goto(`/register/${registerId}/tables/${tableId}`);
    } catch (e) {
      cancelError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      canceling = false;
    }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bookingLabel = (t: 'cancellation' | 'free_of_charge') =>
    t === 'cancellation' ? 'Storno' : '100 % Rabatt';
</script>

<div class="page">
  <header class="header">
    <button class="btn-ghost" onclick={() => goto(`/register/${registerId}/tables/${tableId}`)}>← Tisch</button>
    <h1>Kassieren</h1>
  </header>

  {#if loading}
    <p class="muted center">Lade…</p>
  {:else if error && !confirmationOpen}
    <p class="error-text">{error}</p>
  {:else if groups.length === 0}
    <p class="muted">Keine offenen Positionen am Tisch.</p>
  {:else}
    <p class="hint">Standardmäßig sind alle Positionen vollständig ausgewählt. Mit „Zurücksetzen" lässt sich einzeln zusammenstellen.</p>

    <table class="checkout-table">
      <thead>
        <tr>
          <th>Position</th>
          <th class="num">Offen</th>
          <th class="num">Auswahl</th>
          <th class="num">Einzeln</th>
          <th class="num">Summe</th>
        </tr>
      </thead>
      <tbody>
        {#each groups as g}
          {@const sel = selected.get(g.group_key) ?? 0}
          {@const unit = g.unit_price + (g.unit_deposit ?? 0)}
          <tr>
            <td>
              <span class="g-name">{g.name}</span>
              {#if g.options}<span class="g-opts"> · {g.options}</span>{/if}
            </td>
            <td class="num">{g.quantity}</td>
            <td class="num">
              <div class="stepper">
                <button class="step-btn" onclick={() => changeQty(g, -1)} disabled={sel <= 0}>−</button>
                <span class="step-val">{sel}</span>
                <button class="step-btn" onclick={() => changeQty(g, +1)} disabled={sel >= g.quantity}>+</button>
              </div>
            </td>
            <td class="num">{fmt(unit)} €</td>
            <td class="num">{fmt(unit * sel)} €</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><button class="btn-ghost" onclick={resetAll}>Zurücksetzen</button></td>
          <td class="num"><strong>{selectedCount}</strong></td>
          <td class="num muted">Summe</td>
          <td class="num total"><strong>{fmt(selectedTotal)} €</strong></td>
        </tr>
      </tfoot>
    </table>

    <div class="actions">
      <button class="btn-ghost danger" onclick={openCancelDialog} disabled={selectedCount === 0 || busy}>
        Stornieren / Kostenfrei
      </button>
      <div class="spacer"></div>
      <button class="btn-primary" onclick={charge} disabled={selectedCount === 0 || busy}>
        {busy ? 'Kassiere…' : 'Kassieren'}
      </button>
    </div>
  {/if}
</div>

<!-- Receipt confirmation dialog (mirrors the Bonkasse) -->
<Modal bind:open={confirmationOpen} title="Rechnung {lastReceiptNumber ?? ''}">
  {#if lastInvoiceId}
    <div class="checkout-body">
      <div class="qr-wrap">
        <img class="qr" src={api.registerSession.qrUrl(lastInvoiceId)} alt="QR-Code zur Rechnung" />
        <p class="qr-hint">Vom Kunden mit dem Smartphone scannen</p>
      </div>
      <div class="totals">
        <div class="total-final">{fmt(selectedTotal)} €</div>
        <div class="muted small">{selectedCount} Artikel</div>
      </div>
    </div>
    {#if tseWarning}<p class="warning-text">⚠ {tseWarning}</p>{/if}
    {#if printDone}<p class="success-text">✓ Bon wird gedruckt</p>{/if}

    <div class="modal-actions">
      <button class="btn-ghost" onclick={finishConfirmation} disabled={printing}>Rechnung per QR Code gescannt</button>
      <div class="spacer"></div>
      <button class="btn-primary" onclick={printReceipt} disabled={printing || printDone}>
        {printing ? 'Drucke…' : 'Rechnung drucken'}
      </button>
    </div>
  {/if}
</Modal>

<!-- Cancel / free-of-charge dialog -->
<Modal bind:open={cancelOpen} title="Stornieren / Kostenfrei">
  <p>
    {selectedCount} Position{selectedCount === 1 ? '' : 'en'} für insgesamt
    <strong>{fmt(selectedTotal)} €</strong> ausgewählt.
  </p>

  <div class="field">
    <label for="reason">Stornogrund</label>
    <select id="reason" bind:value={cancelReasonId} disabled={canceling}>
      {#if cancelReasons.length === 0}
        <option value="">Keine Gründe konfiguriert</option>
      {:else}
        {#each cancelReasons as r}
          <option value={r.id}>{r.name} ({bookingLabel(r.booking_type)})</option>
        {/each}
      {/if}
    </select>
  </div>
  {#if cancelError}<p class="error-text">{cancelError}</p>{/if}

  <div class="modal-actions">
    <button class="btn-ghost" onclick={() => (cancelOpen = false)} disabled={canceling}>Abbrechen</button>
    <div class="spacer"></div>
    <button class="btn-primary danger" onclick={confirmCancel} disabled={canceling || !cancelReasonId}>
      {canceling ? 'Bestätige…' : 'Bestätigen'}
    </button>
  </div>
</Modal>

<style>
  .page { padding: 1rem; max-width: 900px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .header h1 { font-size: 1.2rem; margin: 0; flex: 1; }
  .center { text-align: center; padding: 1rem; }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 1rem; }

  .checkout-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  .checkout-table th, .checkout-table td { padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--color-border); }
  .checkout-table th.num, .checkout-table td.num { text-align: right; }
  .g-name { font-weight: 600; }
  .g-opts { font-size: 0.8rem; color: var(--color-text-muted); }
  .stepper { display: inline-flex; align-items: center; gap: 0.4rem; }
  .step-btn {
    width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--color-border);
    background: var(--color-surface); color: var(--color-text); cursor: pointer; font-size: 0.9rem;
  }
  .step-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .step-val { min-width: 1.5em; text-align: center; font-weight: 700; }
  tfoot td { border-top: 2px solid var(--color-border); padding-top: 0.75rem; }
  tfoot .total { font-size: 1.15rem; }

  .actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; }
  .actions .spacer { flex: 1; }
  .actions .btn-primary { padding: 0.7rem 1.5rem; font-size: 1rem; }

  /* Receipt confirmation reuses Bonkasse styles */
  .checkout-body { display: flex; gap: 1.5rem; align-items: center; padding: 0.5rem 0; }
  .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .qr { width: 200px; height: 200px; background: white; padding: 0.5rem; border-radius: var(--radius-sm); }
  .qr-hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; text-align: center; }
  .totals { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .total-final { font-size: 2rem; font-weight: 700; }
  .small { font-size: 0.85rem; }
  .modal-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; }
  .modal-actions .spacer { flex: 1; }
  .success-text { color: #4caf7d; font-size: 0.9rem; margin-top: 0.5rem; }
  .warning-text { color: #f59e0b; font-size: 0.9rem; margin-top: 0.5rem; font-weight: 600; }
</style>
