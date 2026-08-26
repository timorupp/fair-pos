<script lang="ts">
  import { run } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import type { Article } from '@fairpos/shared';
  import { adjustQuantity, computeOrderTotal, num, type OrderLine } from '$lib/order';
  import { currentRegisterName } from '$lib/stores/page-title';
  import Modal from '$lib/components/Modal.svelte';

  type Slot = { article_id: string; grid_row: number; grid_col: number; color: string };

  let registerId = $state('');
  let registerName = $state('');
  let registerType: 'receipt_register' | 'service_register' = $state('receipt_register');
  /** Whether the register is locked because past calendar days still need a Z-Bon. */
  let locked = $state(false);
  let pendingDays: string[] = $state([]);
  let gridCols = $state(4);
  let gridRows = $state(4);
  let slots: Slot[] = $state([]);
  /** Whether a layout (own or default) is configured for this register at all. */
  let hasLayout = $state(false);
  let articles: (Article & { tax_rate: string })[] = $state([]);
  let articleById = $state(new Map<string, Article & { tax_rate: string }>());
  let loading = $state(true);
  let error = $state('');

  let order: OrderLine[] = $state([]);

  // Checkout dialog
  let checkoutOpen = $state(false);
  let checkoutBusy = $state(false);
  let checkoutError = $state('');
  let lastInvoiceId: string | null = $state(null);
  let lastReceiptNumber: string | null = $state(null);
  let printing = $state(false);
  let printDone = $state(false);
  /** Set when a configured TSE failed to sign the sale — the sale still went through, see docs/TSE-Integration.md. */
  let tseWarning: string | null = $state(null);

  run(() => {
    registerId = ($page.params['id'] ?? '') as string;
  });
  let total = $derived(computeOrderTotal(order, articles));
  // Reset the order any time the receipt dialog closes — regardless of how
  // (X button, backdrop click, Escape). Listening for the Modal's explicit
  // `close` event is more reliable than the previous reactive cascade
  // (`$: if (!checkoutOpen && lastInvoiceId) reset();`), which had Svelte
  // update-ordering quirks that left the total stale while the order list
  // was already cleared.
  function onCheckoutClosed(): void { reset(); }

  // Lookup helpers
  run(() => {
    articleById = new Map(articles.map((a) => [a.id, a]));
  });
  let slotByCell = $derived(new Map(slots.map((s) => [`${s.grid_row}:${s.grid_col}`, s])));

  /** Builds a 2D matrix from gridRows × gridCols. */
  let gridMatrix = $derived(Array.from({ length: gridRows }, (_, r) =>
    Array.from({ length: gridCols }, (_, c) => slotByCell.get(`${r}:${c}`) ?? null),
  ));

  onMount(load);

  async function load() {
    loading = true; error = '';
    try {
      const ctx = await api.registerSession.register(registerId);
      registerName = ctx.register.name;
      currentRegisterName.set(registerName);
      registerType = ctx.register.type;
      locked = ctx.locked;
      pendingDays = ctx.pending_days;
      if (registerType === 'service_register') {
        goto(`/register/${registerId}/floor-plan`, { replaceState: true });
        return;
      }
      if (ctx.layout) {
        hasLayout = true;
        gridCols = ctx.layout.grid_cols;
        gridRows = ctx.layout.grid_rows;
        slots = ctx.layout.slots;
      } else {
        hasLayout = false;
        slots = [];
      }
      articles = ctx.articles;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  function tapSlot(s: Slot) {
    order = adjustQuantity(order, s.article_id, 1);
  }

  function plus(articleId: string)  { order = adjustQuantity(order, articleId, 1); }
  function minus(articleId: string) { order = adjustQuantity(order, articleId, -1); }

  function nameOf(articleId: string): string {
    return articleById.get(articleId)?.name ?? '?';
  }

  function unitPriceOf(articleId: string): number {
    const a = articleById.get(articleId);
    if (!a) return 0;
    return num(a.price) + num(a.deposit_price);
  }

  function reset() {
    order = [];
    lastInvoiceId = null;
    lastReceiptNumber = null;
    printDone = false;
    printing = false;
    checkoutError = '';
    tseWarning = null;
  }

  async function startCheckout() {
    if (order.length === 0) return;
    checkoutBusy = true; checkoutError = '';
    try {
      const result = await api.registerSession.checkout(
        registerId,
        order.map((l) => ({ article_id: l.article_id, quantity: l.quantity })),
      );
      lastInvoiceId = result.invoice_id;
      lastReceiptNumber = result.receipt_number_formatted;
      tseWarning = result.tse_warning;
      checkoutOpen = true;
    } catch (e) {
      checkoutError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      checkoutBusy = false;
    }
  }

  async function printReceipt() {
    if (!lastInvoiceId) return;
    printing = true; checkoutError = '';
    try {
      await api.registerSession.print(lastInvoiceId);
      printDone = true;
      // Close the dialog after a short success indication and reset for the next customer.
      setTimeout(finish, 1200);
    } catch (e) {
      checkoutError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      printing = false;
    }
  }

  function scannedConfirmed() {
    finish();
  }

  function finish() {
    checkoutOpen = false;
    reset();
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<div class="register-shell">
  {#if loading}
    <p class="muted center">Lade Kasse…</p>
  {:else if error}
    <p class="error-text center">{error}</p>
  {:else if registerType === 'service_register'}
    <div class="center">
      <p class="muted">Bedienungskasse erkannt — leite zum Saalplan…</p>
    </div>
  {:else if locked}
    <header class="register-header">
      <h1>{registerName}</h1>
    </header>
    <div class="lock-screen">
      <div class="lock-icon">🔒</div>
      <h2>Kasse gesperrt</h2>
      <p>
        Für diese Kasse müssen noch
        <strong>{pendingDays.length} Tagesabschluss{pendingDays.length === 1 ? '' : '/üsse'}</strong>
        erstellt werden, bevor weiter kassiert werden kann.
      </p>
      <ul class="pending-list">
        {#each pendingDays as day}<li>{day}</li>{/each}
      </ul>
      <p class="muted">Bitte den Administrator informieren.</p>
    </div>
  {:else}
    <header class="register-header">
      <h1>{registerName}</h1>
    </header>

    <!-- Responsive: article grid + order list reflow via CSS grid-template-areas
         (see .pos-layout) — narrow screens stack grid-then-list top to bottom with
         no internal scrolling (the whole page scrolls); from the tablet breakpoint
         up, the list becomes a sticky sidebar next to the grid instead. Same
         markup/order in the DOM either way, only the CSS placement changes. -->
    <div class="pos-layout">
      <!-- Article grid -->
      <section class="grid-section">
        {#if !hasLayout}
          <p class="muted center">Für diese Kasse ist kein Layout konfiguriert. Bitte den Administrator informieren.</p>
        {:else if slots.length === 0}
          <p class="muted center">Das zugewiesene Layout enthält noch keine Artikel. Bitte den Administrator informieren.</p>
        {:else}
          <div class="article-grid" style="--cols:{gridCols}; --rows:{gridRows}">
            {#each gridMatrix as row, ri}
              {#each row as slot, ci (`${ri}:${ci}`)}
                {#if slot}
                  <button
                    type="button"
                    class="grid-btn"
                    style="background:{slot.color}"
                    onclick={() => tapSlot(slot)}
                  >
                    {nameOf(slot.article_id)}
                  </button>
                {:else}
                  <div class="grid-empty"></div>
                {/if}
              {/each}
            {/each}
          </div>
        {/if}
      </section>

      <!-- Order list -->
      <section class="order-section">
        {#if order.length === 0}
          <p class="empty">Noch keine Artikel.</p>
        {:else}
          <ul class="order-list">
            {#each order as line (line.article_id)}
              <li class="order-line">
                <span class="line-name">{nameOf(line.article_id)}</span>
                <span class="line-unit muted">{fmt(unitPriceOf(line.article_id))} €</span>
                <div class="qty">
                  <button class="qty-btn" onclick={() => minus(line.article_id)}>−</button>
                  <span class="qty-val">{line.quantity}</span>
                  <button class="qty-btn" onclick={() => plus(line.article_id)}>+</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="total-row">
          <span class="total-value" class:negative={total < 0}>{fmt(total)} €</span>
          <button class="btn-primary checkout-btn"
                  onclick={startCheckout}
                  disabled={order.length === 0 || checkoutBusy}>
            {checkoutBusy ? 'Kassiere…' : 'Kassieren'}
          </button>
        </div>
        {#if checkoutError && !checkoutOpen}<p class="error-text">{checkoutError}</p>{/if}
      </section>
    </div>
  {/if}
</div>

<!-- Checkout dialog ─────────────────────────────────────────────────────── -->
<Modal bind:open={checkoutOpen} title="Rechnung {lastReceiptNumber ?? ''}" on:close={onCheckoutClosed}>
  {#if lastInvoiceId}
    <div class="checkout-body">
      <div class="qr-wrap">
        <img class="qr" src={api.registerSession.qrUrl(lastInvoiceId)} alt="QR-Code zur Rechnung" />
        <p class="qr-hint">Vom Kunden mit dem Smartphone scannen</p>
      </div>
      <div class="totals">
        <div class="total-final" class:negative={total < 0}>{fmt(total)} €</div>
        <div class="muted small">{order.reduce((s, l) => s + l.quantity, 0)} Artikel</div>
      </div>
    </div>
    {#if tseWarning}<p class="warning-text">⚠ {tseWarning}</p>{/if}
    {#if checkoutError}<p class="error-text">{checkoutError}</p>{/if}
    {#if printDone}<p class="success-text">✓ Bon wird gedruckt</p>{/if}

    <div class="modal-actions">
      <button class="btn-ghost" onclick={scannedConfirmed} disabled={printing}>Rechnung per QR Code gescannt</button>
      <div class="spacer"></div>
      <button class="btn-primary" onclick={printReceipt} disabled={printing || printDone}>
        {printing ? 'Drucke…' : 'Rechnung drucken'}
      </button>
    </div>
  {/if}
</Modal>

<style>
  .register-shell { flex: 1; display: flex; flex-direction: column; padding: 1rem; gap: 1rem; max-width: 100%; }
  .register-header { display: flex; align-items: center; gap: 1rem; }
  .register-header h1 { font-size: 1.1rem; font-weight: 700; margin: 0; }
  .lock-screen {
    max-width: 540px; margin: 3rem auto; text-align: center;
    background: #f59e0b22; border: 1px solid #f59e0b88; border-radius: var(--radius);
    padding: 2rem;
  }
  .lock-icon { font-size: 3rem; margin-bottom: 0.5rem; }
  .lock-screen h2 { color: #c87a00; margin: 0.25rem 0 1rem; }
  .lock-screen .pending-list { list-style: none; padding: 0; font-family: monospace; margin: 1rem 0; }
  .center { text-align: center; padding: 2rem; }

  /* ── Responsive grid+list layout ──────────────────────────────────────
     Narrow (default): single column, grid above list, both grow with their
     content — no internal scrolling, the whole page scrolls. From the
     tablet breakpoint up: two columns, list becomes a sticky sidebar that
     scrolls on its own so it stays visible while scrolling the grid. Same
     DOM/markup order either way — see the template comment above. */
  .pos-layout {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-areas: "grid" "order";
    gap: 1rem;
  }
  .grid-section { grid-area: grid; }
  .order-section { grid-area: order; }
  @media (min-width: 768px) {
    .pos-layout {
      grid-template-columns: 1fr 30%;
      grid-template-areas: "grid order";
      align-items: start;
    }
    .order-section {
      position: sticky;
      top: 1rem;
      max-height: calc(100vh - 2rem);
      overflow-y: auto;
    }
  }

  /* ── Order list ─────────────────────────────────────────────────────── */
  .order-section {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1rem; display: flex; flex-direction: column;
  }
  .empty { color: var(--color-text-muted); font-size: 0.9rem; padding: 0.5rem 0; }
  .order-list { list-style: none; padding: 0; margin: 0; }
  .order-line {
    display: grid;
    grid-template-columns: 1fr 4em auto;
    align-items: center; gap: 0.6rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--color-border);
  }
  .order-line:last-child { border-bottom: none; }
  /* min-width: 0 overrides the grid item's implicit min-width: auto (min-content) so the
     name can shrink instead of pushing the price columns off-screen — see the matching
     comment in .../order/+page.svelte for the full rationale (same layout pattern here). */
  .line-name {
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .line-unit { font-size: 0.8rem; text-align: right; }
  .qty { display: flex; align-items: center; gap: 0.3rem; }
  .qty-btn {
    border-radius: 50%; border: 1px solid var(--color-border);
    background: var(--color-bg); color: var(--color-text); cursor: pointer;
  }
  .qty-btn:hover { background: var(--color-surface-hover); }
  /* Narrow-phone fix, see .../order/+page.svelte for the full rationale. */
  .order-line .qty-btn {
    width: 32px !important; height: 32px !important;
    min-width: 32px !important; min-height: 32px !important;
    font-size: 1rem !important;
  }
  .qty-val { min-width: 1.5em; text-align: center; font-weight: 700; }

  .total-row {
    display: flex; align-items: center; gap: 0.75rem;
    padding-top: 0.6rem; margin-top: 0.5rem; border-top: 1px solid var(--color-border);
  }
  .total-value { font-size: 1.25rem; font-weight: 700; flex: 1; }
  .total-value.negative { color: var(--color-danger); }
  .checkout-btn { padding: 0.6rem 1.5rem; font-size: 1rem; }

  /* ── Article grid ───────────────────────────────────────────────────── */
  .article-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(80px, 1fr));
    grid-template-rows: repeat(var(--rows), minmax(70px, auto));
    gap: 0.5rem;
  }
  .grid-btn {
    border: none; border-radius: var(--radius); color: white; font-weight: 700; font-size: 1rem;
    padding: 0.5rem; cursor: pointer; min-height: 70px;
    transition: filter 0.05s, transform 0.05s;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    overflow-wrap: anywhere;
  }
  .grid-btn:hover { filter: brightness(1.1); }
  .grid-btn:active { transform: scale(0.97); }
  .grid-empty { background: transparent; }

  /* ── Checkout dialog ────────────────────────────────────────────────── */
  .checkout-body { display: flex; gap: 1.5rem; align-items: center; padding: 0.5rem 0; }
  .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .qr { width: 200px; height: 200px; background: white; padding: 0.5rem; border-radius: var(--radius-sm); }
  .qr-hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; text-align: center; }
  .totals { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .total-final { font-size: 2rem; font-weight: 700; }
  .total-final.negative { color: var(--color-danger); }
  .small { font-size: 0.85rem; }
  .modal-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; }
  .modal-actions .spacer { flex: 1; }
  .success-text { color: #4caf7d; font-size: 0.9rem; margin-top: 0.5rem; }
  .error-text { color: var(--color-danger); font-size: 0.9rem; margin-top: 0.5rem; }
  .warning-text { color: #f59e0b; font-size: 0.9rem; margin-top: 0.5rem; font-weight: 600; }
</style>
