<script lang="ts">
  import { run } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import type { Article } from '@fairpos/shared';
  import { num } from '$lib/order';
  import { currentRegisterName } from '$lib/stores/page-title';
  import Modal from '$lib/components/Modal.svelte';

  type Slot = { article_id: string; grid_row: number; grid_col: number; color: string };

  /** A line in the new-order list. Carries optional `options` so the same article can appear multiple times. */
  type OrderLine = { article_id: string; options: string | null; quantity: number };

  let registerId = $state('');
  let tableId = $state('');
  let gridCols = $state(4);
  let gridRows = $state(4);
  let slots: Slot[] = $state([]);
  /** Whether a layout (own or default) is configured for this register at all. */
  let hasLayout = $state(false);
  let articles: (Article & { tax_rate: string })[] = $state([]);
  let articleById = $state(new Map<string, Article & { tax_rate: string }>());
  let loading = $state(true);
  let error = $state('');
  let placing = $state(false);
  let placeError = $state('');

  let order: OrderLine[] = $state([]);

  // Options dialog state
  let optionsOpen = $state(false);
  let optionsArticle: Article | null = $state(null);
  let optionsLoading = $state(false);
  let availableOptions: { id: string; name: string }[] = $state([]);
  let selectedOptionNames: Set<string> = $state(new Set());

  run(() => {
    registerId = ($page.params['id'] ?? '') as string;
  });
  run(() => {
    tableId = ($page.params['tableId'] ?? '') as string;
  });

  run(() => {
    articleById = new Map(articles.map((a) => [a.id, a]));
  });
  let slotByCell = $derived(new Map(slots.map((s) => [`${s.grid_row}:${s.grid_col}`, s])));
  let gridMatrix = $derived(Array.from({ length: gridRows }, (_, r) =>
    Array.from({ length: gridCols }, (_, c) => slotByCell.get(`${r}:${c}`) ?? null),
  ));

  onMount(load);

  async function load() {
    loading = true; error = '';
    try {
      const ctx = await api.registerSession.register(registerId);
      currentRegisterName.set(ctx.register.name);
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

  async function tapSlot(s: Slot) {
    const article = articleById.get(s.article_id);
    if (!article) return;
    optionsLoading = true;
    try {
      const opts = await api.registerSession.articleOptions(article.id);
      if (opts.length === 0) {
        // No options → add directly with `options=null`.
        addLine(article.id, null);
      } else {
        optionsArticle = article;
        availableOptions = opts.map((o) => ({ id: o.id, name: o.name }));
        selectedOptionNames = new Set();
        optionsOpen = true;
      }
    } catch {
      // If the options endpoint fails, fall back to adding without options.
      addLine(article.id, null);
    } finally {
      optionsLoading = false;
    }
  }

  function toggleOption(name: string) {
    if (selectedOptionNames.has(name)) selectedOptionNames.delete(name);
    else selectedOptionNames.add(name);
    selectedOptionNames = new Set(selectedOptionNames); // trigger reactivity
  }

  function confirmOptions() {
    if (!optionsArticle) return;
    const optionsLabel = [...selectedOptionNames].sort().join(', ') || null;
    addLine(optionsArticle.id, optionsLabel);
    optionsOpen = false;
    optionsArticle = null;
  }

  /** Adds a unit to the existing matching line, or creates a new line. */
  function addLine(articleId: string, options: string | null) {
    const existing = order.find((l) => l.article_id === articleId && (l.options ?? '') === (options ?? ''));
    if (existing) {
      order = order.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
    } else {
      order = [...order, { article_id: articleId, options, quantity: 1 }];
    }
  }

  function changeQuantity(line: OrderLine, delta: number) {
    const next = line.quantity + delta;
    if (next <= 0) {
      order = order.filter((l) => l !== line);
    } else {
      order = order.map((l) => (l === line ? { ...l, quantity: next } : l));
    }
  }

  function unitPriceOf(articleId: string): number {
    const a = articleById.get(articleId);
    if (!a) return 0;
    return num(a.price) + num(a.deposit_price);
  }

  function nameOf(articleId: string): string {
    return articleById.get(articleId)?.name ?? '?';
  }

  function colorOf(articleId: string): string | null {
    const slot = slots.find((s) => s.article_id === articleId);
    return slot?.color ?? null;
  }

  let total = $derived(Math.round(
    order.reduce((s, l) => s + unitPriceOf(l.article_id) * l.quantity, 0) * 100,
  ) / 100);

  async function placeOrder() {
    if (order.length === 0) return;
    placing = true; placeError = '';
    try {
      const result = await api.registerSession.placeOrder(
        registerId, tableId,
        order.map((l) => ({ article_id: l.article_id, quantity: l.quantity, options: l.options })),
      );
      // Warn explicitly if some items had no printer to route to — the order
      // landed in the DB but no kitchen/bar slip was printed for those items.
      if (result.items_without_printer > 0) {
        alert(
          `Achtung: ${result.items_without_printer} Artikel konnten nicht gedruckt werden ` +
          `(kein Drucker am Artikel und kein Standarddrucker konfiguriert).`,
        );
      }
      // TSE-Signierung blockiert die Bestellung nie (siehe docs/TSE-Integration.md
      // → "TSE-Ausfall") — die Bestellung ist trotzdem angelegt, nur ohne Signatur.
      if (result.tse_warning) {
        alert(`⚠ ${result.tse_warning}`);
      }
      // After ordering: return to the table action chooser (Schritt 2b).
      goto(`/register/${registerId}/tables/${tableId}`);
    } catch (e) {
      placeError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      placing = false;
    }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<div class="order-page">
  <header class="header">
    <button class="btn-ghost" onclick={() => goto(`/register/${registerId}/tables/${tableId}`)}>← Tisch</button>
    <h1>Bestellen</h1>
  </header>

  {#if loading}
    <p class="muted center">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}

  <!-- Order list (fixed height, scrolls internally) -->
  <section class="order-section">
    {#if order.length === 0}
      <p class="empty">Noch keine Artikel.</p>
    {:else}
      <ul class="order-list">
        {#each order as line, i (i)}
          {@const c = colorOf(line.article_id)}
          <li class="order-line">
            <span class="line-dot" style="background:{c ?? '#888'}"></span>
            <span class="line-name">
              {nameOf(line.article_id)}
              {#if line.options}<span class="line-options"> · {line.options}</span>{/if}
            </span>
            <span class="line-unit muted">{fmt(unitPriceOf(line.article_id))} €</span>
            <div class="qty">
              <button class="qty-btn" onclick={() => changeQuantity(line, -1)}>−</button>
              <span class="qty-val">{line.quantity}</span>
              <button class="qty-btn" onclick={() => changeQuantity(line, +1)}>+</button>
            </div>
            <span class="line-total">{fmt(unitPriceOf(line.article_id) * line.quantity)} €</span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="total-row">
      <span class="total-label">Gesamt</span>
      <span class="total-value">{fmt(total)} €</span>
      <button class="btn-primary place-btn" disabled={order.length === 0 || placing} onclick={placeOrder}>
        {placing ? 'Bestelle…' : 'Bestellen'}
      </button>
    </div>
    {#if placeError}<p class="error-text">{placeError}</p>{/if}
  </section>

  <!-- Article grid -->
  <section class="grid-section">
    {#if !hasLayout}
      <p class="muted center">Für diese Kasse ist kein Layout konfiguriert. Bitte den Administrator informieren.</p>
    {:else if slots.length === 0}
      <p class="muted center">Das zugewiesene Layout enthält noch keine Artikel. Bitte den Administrator informieren.</p>
    {:else}
      <div class="article-grid" style="--cols:{gridCols}; --rows:{gridRows}">
        {#each gridMatrix as row}
          {#each row as slot}
            {#if slot}
              <button type="button" class="grid-btn" style="background:{slot.color}"
                      disabled={optionsLoading}
                      onclick={() => tapSlot(slot)}>
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

  {/if}
</div>

<!-- Options dialog -->
<Modal bind:open={optionsOpen} title={optionsArticle ? `Optionen — ${optionsArticle.name}` : 'Optionen'}>
  <p class="muted small">Mehrere Optionen möglich. Keine Auswahl = Artikel ohne Zusatz.</p>
  <ul class="option-list">
    {#each availableOptions as opt}
      <li>
        <label class="option-label">
          <input type="checkbox" checked={selectedOptionNames.has(opt.name)} onchange={() => toggleOption(opt.name)} />
          <span>{opt.name}</span>
        </label>
      </li>
    {/each}
  </ul>
  <div class="modal-actions">
    <button class="btn-ghost" onclick={() => (optionsOpen = false)}>Abbrechen</button>
    <div class="spacer"></div>
    <button class="btn-primary" onclick={confirmOptions}>Hinzufügen</button>
  </div>
</Modal>

<style>
  .order-page { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; min-height: calc(100vh - 60px); }
  .header { display: flex; align-items: center; gap: 1rem; }
  .header h1 { font-size: 1.2rem; margin: 0; flex: 1; }
  .center { text-align: center; padding: 1rem; }

  .order-section {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1rem;
    height: 35vh; min-height: 220px; display: flex; flex-direction: column;
  }
  .empty { color: var(--color-text-muted); font-size: 0.9rem; padding: 0.5rem 0; }
  .order-list { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; }
  .order-line {
    display: grid;
    grid-template-columns: 12px 1fr 4em auto 5em;
    align-items: center; gap: 0.6rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--color-border);
  }
  .order-line:last-child { border-bottom: none; }
  .line-dot { width: 10px; height: 10px; border-radius: 50%; }
  .line-name { font-weight: 600; }
  .line-options { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 400; }
  .line-unit { font-size: 0.8rem; text-align: right; }
  .line-total { font-weight: 600; text-align: right; }
  .qty { display: flex; align-items: center; gap: 0.4rem; }
  .qty-btn {
    width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--color-border);
    background: var(--color-bg); color: var(--color-text); cursor: pointer; font-size: 1rem;
  }
  .qty-val { min-width: 1.5em; text-align: center; font-weight: 700; }

  .total-row {
    display: flex; align-items: center; gap: 0.75rem;
    padding-top: 0.6rem; margin-top: 0.5rem; border-top: 1px solid var(--color-border);
  }
  .total-label { font-size: 0.9rem; font-weight: 600; }
  .total-value { font-size: 1.25rem; font-weight: 700; flex: 1; }
  .place-btn { padding: 0.6rem 1.5rem; font-size: 1rem; }

  .grid-section { flex: 1; min-height: 0; overflow: auto; }
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
  }
  .grid-btn:hover { filter: brightness(1.1); }
  .grid-btn:active { transform: scale(0.97); }
  .grid-empty { background: transparent; }

  .small { font-size: 0.85rem; }
  .option-list { list-style: none; padding: 0; margin: 0.5rem 0; }
  .option-list li { padding: 0.3rem 0; }
  .option-label { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
  .modal-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; }
  .modal-actions .spacer { flex: 1; }
</style>
