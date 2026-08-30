<script lang="ts">
  import { run } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import Modal from '$lib/components/Modal.svelte';
  import { longpress } from '$lib/longpress';

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
  let busy = $state(false);

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

  /**
   * Charges the selected quantities and navigates to the dedicated receipt
   * page (own route rather than a modal — Nutzervorgabe, 2026-08-30, so the
   * QR/print screen isn't squeezed into an in-page dialog on a phone).
   * Everything the receipt page needs travels as query params — it's a
   * one-shot handoff of data already in hand, not worth a new endpoint.
   */
  async function charge() {
    if (selectedCount === 0) return;
    busy = true; error = '';
    try {
      const result = await api.registerSession.chargeTable(registerId, tableId, selectedQuantities());
      const params = new URLSearchParams({
        invoiceId: result.invoice_id,
        receiptNumber: result.receipt_number_formatted,
        total: String(selectedTotal),
        count: String(selectedCount),
      });
      if (result.tse_warning) params.set('tseWarning', result.tse_warning);
      goto(`/register/${registerId}/tables/${tableId}/checkout/receipt?${params}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      busy = false;
    }
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
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if groups.length === 0}
    <p class="muted">Keine offenen Positionen am Tisch.</p>
  {:else}
    <p class="hint">Standardmäßig sind alle Positionen vollständig ausgewählt. Mit „Zurücksetzen" lässt sich einzeln zusammenstellen.</p>

    <table class="checkout-table">
      <thead>
        <tr>
          <th class="num">Offen</th>
          <th>Position</th>
          <th class="num">Auswahl</th>
        </tr>
      </thead>
      <tbody>
        {#each groups as g}
          {@const sel = selected.get(g.group_key) ?? 0}
          <tr>
            <td class="num">{g.quantity}</td>
            <td>
              <span class="g-name">{g.name}</span>
              {#if g.options}<span class="g-opts">{g.options}</span>{/if}
            </td>
            <td class="num">
              <div class="stepper">
                <button class="step-btn" onclick={() => changeQty(g, -1)} disabled={sel <= 0}>−</button>
                <span class="step-val">{sel}</span>
                <button class="step-btn" onclick={() => changeQty(g, +1)} disabled={sel >= g.quantity}>+</button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="summary-row">
      <button class="btn-ghost" onclick={resetAll}>Zurücksetzen</button>
      <div class="spacer"></div>
      <span class="summary-label muted">Summe</span>
      <span class="summary-total">{fmt(selectedTotal)} €</span>
    </div>

    <div class="actions">
      <button class="btn-ghost danger" onclick={openCancelDialog} disabled={selectedCount === 0 || busy}>
        Stornieren / Kostenfrei
      </button>
      <div class="spacer"></div>
      <button class="btn-primary hold-btn"
              disabled={selectedCount === 0 || busy}
              use:longpress={{ onHold: charge }}
              aria-label="Kassieren — gedrückt halten zum Bestätigen">
        <span class="hold-fill"></span>
        <span class="hold-label">⏱ {busy ? 'Kassiere…' : 'Kassieren (halten)'}</span>
      </button>
    </div>
  {/if}
</div>

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

  /* table-layout: fixed + an explicit width on "Offen" (narrow, numeric)
     and "Auswahl" (needs room for the stepper) keeps both visible at all
     times; the unconstrained middle column (Position) takes whatever
     space is left and truncates with an ellipsis instead of pushing the
     other two off-screen. Down to 3 columns (Einzeln/Summe removed, total
     moved below the table) specifically so this fits on a phone screen
     (Nutzerbericht, 2026-08-30: "Spalten sehr schmal"). */
  .checkout-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; table-layout: fixed; }
  .checkout-table th, .checkout-table td { padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--color-border); }
  .checkout-table th.num, .checkout-table td.num { text-align: right; }
  .checkout-table th:nth-child(1), .checkout-table td:nth-child(1) { width: 3.5em; }
  .checkout-table th:nth-child(3), .checkout-table td:nth-child(3) { width: 7.5em; }
  /* Ellipsis lives on .g-name specifically (not the whole <td>) so .g-opts
     can sit on its own line below instead of being squeezed onto the same
     truncated line — narrow column, too little room for both side by side. */
  .g-name {
    display: block; font-weight: 600;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .g-opts { display: block; font-size: 0.8rem; color: var(--color-text-muted); }
  .stepper { display: inline-flex; align-items: center; gap: 0.4rem; }
  .step-btn {
    width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--color-border);
    background: var(--color-surface); color: var(--color-text); cursor: pointer; font-size: 0.9rem;
  }
  .step-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .step-val { min-width: 1.5em; text-align: center; font-weight: 700; }

  /* Sum lives below the table now, not as a column (Nutzervorgabe) —
     no item-count number here anymore, just the price total. */
  .summary-row {
    display: flex; align-items: center; gap: 0.5rem;
    padding-top: 0.75rem; margin-top: 0.25rem; border-top: 2px solid var(--color-border);
  }
  .summary-row .spacer { flex: 1; }
  .summary-label { font-size: 0.9rem; }
  .summary-total { font-size: 1.15rem; font-weight: 700; }

  .actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; }
  .actions .spacer { flex: 1; }
  .actions .btn-primary { padding: 0.7rem 1.5rem; font-size: 1rem; }

  /* Hold-to-confirm (see $lib/longpress) — guards against a stray tap
     triggering the checkout. The fill sweeps left-to-right while held;
     .holding's transition duration must match the action's default
     durationMs (600ms) so the animation and the actual trigger line up. */
  .hold-btn { position: relative; overflow: hidden; user-select: none; -webkit-user-select: none; }
  .hold-fill {
    position: absolute; top: 0; left: 0; bottom: 0; width: 0;
    background: rgba(255, 255, 255, 0.28); pointer-events: none;
  }
  .hold-btn:global(.holding) .hold-fill { width: 100%; transition: width 600ms linear; }
  .hold-label { position: relative; }

  .modal-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; }
  .modal-actions .spacer { flex: 1; }
</style>
