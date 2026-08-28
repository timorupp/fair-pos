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
  import { longpress } from '$lib/longpress';

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
  /** Whether the "+ Freitext" link has been clicked to reveal the free-text input (Task #86). */
  let freetextOpen = $state(false);
  let freetextValue = $state('');
  /**
   * Max length for the combined `options` string (selected option names +
   * free text) — a UI convention (chosen to fit the Bestellbon/order-list
   * display), not a DB limit (`order_item.options` is an unbounded `TEXT`
   * column). Shared by the #86 dialog (enforced on the combined result, not
   * just the free-text input alone) and the #88 note-editor dialog below
   * (enforced directly via the single field's `maxlength`, since there the
   * whole string is one editable field).
   */
  const OPTIONS_MAX_LENGTH = 50;

  // "Hinweis hinzufügen" note-editor dialog state (Task #88) — lets staff
  // attach/change a note on an already-placed position, splitting off part
  // of its quantity if needed. Works on any line — kept generic rather than
  // limited to articles without predefined options, since the mechanism
  // doesn't care either way.
  let noteDialogOpen = $state(false);
  let noteStep: 'select' | 'edit' = $state('select');
  /** Index into `order` of the line being edited, or `null` before a line is picked. */
  let noteSelectedIndex: number | null = $state(null);
  let noteQuantity = $state(1);
  let noteText = $state('');

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
        freetextOpen = false;
        freetextValue = '';
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

  /**
   * Combines selected option names and free text into the single string
   * stored as `order_item.options` — options first, free text appended last,
   * both joined with the same ", " separator.
   *
   * @param names - Selected option names.
   * @param freetext - Raw free-text input (untrimmed).
   * @returns The combined label, or `null` if both are empty.
   */
  function buildOptionsLabel(names: string[], freetext: string): string | null {
    const parts = [...names].sort();
    const trimmedFreetext = freetext.trim();
    if (trimmedFreetext) parts.push(trimmedFreetext);
    return parts.join(', ') || null;
  }

  /** Live preview of the combined options string — drives the length check below. */
  let optionsCombinedLabel = $derived(buildOptionsLabel([...selectedOptionNames], freetextValue));
  /** Selected options + free text together must not exceed {@link OPTIONS_MAX_LENGTH} (Task #88 follow-up — previously only the free-text input itself was capped). */
  let optionsTooLong = $derived((optionsCombinedLabel?.length ?? 0) > OPTIONS_MAX_LENGTH);

  function confirmOptions() {
    if (!optionsArticle || optionsTooLong) return;
    addLine(optionsArticle.id, optionsCombinedLabel);
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

  /** Opens the "Hinweis hinzufügen" dialog (Task #88) at the position-selection step. */
  function openNoteDialog() {
    noteStep = 'select';
    noteSelectedIndex = null;
    noteDialogOpen = true;
  }

  /**
   * Picks the line to edit in the note dialog and advances to the edit step.
   *
   * @param i - Index of the chosen line in `order`.
   */
  function selectNoteLine(i: number) {
    const line = order[i];
    if (!line) return;
    noteSelectedIndex = i;
    noteQuantity = 1;
    noteText = line.options ?? '';
    noteStep = 'edit';
  }

  /**
   * Clamps the note-editor's quantity stepper between 1 and the selected
   * line's total quantity — that quantity is how many units of the line the
   * new note text will apply to (the rest, if any, keeps its current text).
   *
   * @param delta - `+1` or `-1`.
   */
  function changeNoteQuantity(delta: number) {
    if (noteSelectedIndex === null) return;
    const max = order[noteSelectedIndex]?.quantity ?? 1;
    noteQuantity = Math.min(max, Math.max(1, noteQuantity + delta));
  }

  let noteSelectedLine = $derived(noteSelectedIndex !== null ? (order[noteSelectedIndex] ?? null) : null);
  /** The text field is capped at {@link OPTIONS_MAX_LENGTH} via `maxlength`, so only the no-op case needs checking here — disables OK when nothing would actually change. */
  let noteOkDisabled = $derived(
    !noteSelectedLine || (noteText.trim() || null) === (noteSelectedLine.options ?? null),
  );

  /**
   * Merges `quantity` units of `articleId`/`options` into an existing
   * matching line in `lines` (mutated in place), or inserts a new line at
   * `insertAt` if no match exists — the same "identical options merge"
   * behaviour as {@link addLine}, reused here so splitting/editing a note
   * never leaves two lines with the same `(article_id, options)` around.
   *
   * @param lines - The working copy of `order` to mutate.
   * @param articleId - Article of the line being merged/inserted.
   * @param options - Resulting options string (or `null`).
   * @param quantity - Units to merge/insert.
   * @param insertAt - Index to insert at when no existing match is found.
   */
  function mergeOrInsertLine(
    lines: OrderLine[],
    articleId: string,
    options: string | null,
    quantity: number,
    insertAt: number,
  ): void {
    const existingIndex = lines.findIndex((l) => l.article_id === articleId && (l.options ?? '') === (options ?? ''));
    if (existingIndex !== -1) {
      lines[existingIndex] = { ...lines[existingIndex]!, quantity: lines[existingIndex]!.quantity + quantity };
    } else {
      lines.splice(insertAt, 0, { article_id: articleId, options, quantity });
    }
  }

  /**
   * Applies the note dialog's edit step (Task #88): the selected quantity of
   * the chosen line gets the new options text, splitting the line in two if
   * that's fewer than its total quantity. Silently merges into an existing
   * identical line if the result happens to match one, same as normal
   * add-to-order behaviour.
   */
  function applyNoteEdit(): void {
    if (noteSelectedIndex === null || noteOkDisabled) return;
    const line = order[noteSelectedIndex];
    if (!line) return;
    const newValue = noteText.trim() || null;

    const remaining = line.quantity - noteQuantity;
    const updated = [...order];
    if (remaining <= 0) {
      updated.splice(noteSelectedIndex, 1);
      mergeOrInsertLine(updated, line.article_id, newValue, line.quantity, noteSelectedIndex);
    } else {
      updated[noteSelectedIndex] = { ...line, quantity: remaining };
      mergeOrInsertLine(updated, line.article_id, newValue, noteQuantity, noteSelectedIndex + 1);
    }
    order = updated;
    noteDialogOpen = false;
  }

  function unitPriceOf(articleId: string): number {
    const a = articleById.get(articleId);
    if (!a) return 0;
    return num(a.price) + num(a.deposit_price);
  }

  function nameOf(articleId: string): string {
    return articleById.get(articleId)?.name ?? '?';
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

    <!-- Order list -->
    <section class="order-section">
      <div class="order-card">
        {#if order.length === 0}
          <p class="empty">Noch keine Artikel.</p>
        {:else}
          <ul class="order-list">
            {#each order as line, i (i)}
              <li class="order-line">
                <span class="line-name">
                  <span class="line-name-text">{nameOf(line.article_id)}</span>
                  {#if line.options}<span class="line-options">{line.options}</span>{/if}
                </span>
                <span class="line-unit muted">{fmt(unitPriceOf(line.article_id))} €</span>
                <div class="qty">
                  <button class="qty-btn" onclick={() => changeQuantity(line, -1)}>−</button>
                  <span class="qty-val">{line.quantity}</span>
                  <button class="qty-btn" onclick={() => changeQuantity(line, +1)}>+</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        <div class="total-row">
          <span class="total-value">{fmt(total)} €</span>
          <button class="btn-primary place-btn hold-btn"
                  disabled={order.length === 0 || placing}
                  use:longpress={{ onHold: placeOrder }}
                  aria-label="Bestellen — gedrückt halten zum Bestätigen">
            <span class="hold-fill"></span>
            <span class="hold-label">⏱ {placing ? 'Bestelle…' : 'Bestellen (halten)'}</span>
          </button>
        </div>
        {#if placeError}<p class="error-text">{placeError}</p>{/if}
      </div>

      <!-- Task #88: rare use case (a note/adjustment on an already-placed
           position), deliberately kept outside the order card so it doesn't
           visually compete with the primary "Bestellen" action. -->
      <button
        type="button"
        class="btn-ghost note-btn"
        disabled={order.length === 0}
        onclick={openNoteDialog}
      >
        Hinweis hinzufügen
      </button>
    </section>
  </div>

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
  {#if freetextOpen}
    <label class="freetext-label">
      Freitext
      <input
        type="text"
        maxlength={OPTIONS_MAX_LENGTH}
        bind:value={freetextValue}
        placeholder="z. B. bitte extra heiß"
      />
    </label>
  {:else}
    <button class="btn-ghost freetext-link" onclick={() => (freetextOpen = true)}>+ Freitext</button>
  {/if}
  {#if optionsTooLong}
    <p class="error-text small">Zu lang ({optionsCombinedLabel?.length}/{OPTIONS_MAX_LENGTH} Zeichen) — bitte Optionen oder Freitext kürzen.</p>
  {/if}
  <div class="modal-actions">
    <button class="btn-ghost" onclick={() => (optionsOpen = false)}>Abbrechen</button>
    <div class="spacer"></div>
    <button class="btn-primary" disabled={optionsTooLong} onclick={confirmOptions}>Hinzufügen</button>
  </div>
</Modal>

<!-- "Hinweis hinzufügen" note-editor dialog (Task #88) — two steps: pick a
     position, then edit its note text (optionally for only part of its
     quantity, splitting the line). Works on any position, not just ones
     whose article has no predefined options — the split/merge logic doesn't
     care either way. -->
<Modal
  bind:open={noteDialogOpen}
  title={noteStep === 'select' || !noteSelectedLine ? 'Position wählen' : `Hinweis — ${nameOf(noteSelectedLine.article_id)}`}
>
  {#if noteStep === 'select'}
    {#if order.length === 0}
      <p class="muted">Keine Positionen vorhanden.</p>
    {:else}
      <ul class="note-select-list">
        {#each order as line, i (i)}
          <li>
            <button type="button" class="note-select-item" onclick={() => selectNoteLine(i)}>
              <span class="note-select-qty">{line.quantity}×</span>
              <span class="note-select-name">
                {nameOf(line.article_id)}
                {#if line.options}<span class="line-options">{line.options}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="modal-actions">
      <button class="btn-ghost" onclick={() => (noteDialogOpen = false)}>Abbrechen</button>
    </div>
  {:else if noteSelectedLine}
    <p class="muted small">Für wie viele Einheiten soll der Hinweis gelten?</p>
    <div class="qty note-qty">
      <button class="qty-btn" onclick={() => changeNoteQuantity(-1)}>−</button>
      <span class="qty-val">{noteQuantity}</span>
      <button class="qty-btn" onclick={() => changeNoteQuantity(+1)}>+</button>
      <span class="muted small">von {noteSelectedLine.quantity}</span>
    </div>
    <label class="freetext-label">
      Hinweis
      <input
        type="text"
        maxlength={OPTIONS_MAX_LENGTH}
        bind:value={noteText}
        placeholder="z. B. ohne Eis, bitte extra heiß"
      />
    </label>
    <div class="modal-actions">
      <button class="btn-ghost" onclick={() => (noteDialogOpen = false)}>Abbrechen</button>
      <div class="spacer"></div>
      <button class="btn-primary" disabled={noteOkDisabled} onclick={applyNoteEdit}>OK</button>
    </div>
  {/if}
</Modal>

<style>
  .order-page { padding: 1rem; display: flex; flex-direction: column; gap: 1rem; min-height: calc(100vh - 60px); }
  .header { display: flex; align-items: center; gap: 1rem; }
  .header h1 { font-size: 1.2rem; margin: 0; flex: 1; }
  .center { text-align: center; padding: 1rem; }

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
  /* .order-section is the grid-area container for the whole sidebar column —
     the visible bordered "card" look lives on the inner .order-card instead,
     so the Task #88 "Hinweis hinzufügen" button can sit below the card
     without visually being part of it (see the template comment there). */
  .order-section { grid-area: order; display: flex; flex-direction: column; gap: 0.75rem; }
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

  .order-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1rem;
    display: flex; flex-direction: column;
  }
  .note-btn { align-self: stretch; }
  .empty { color: var(--color-text-muted); font-size: 0.9rem; padding: 0.5rem 0; }
  .order-list { list-style: none; padding: 0; margin: 0; }
  .order-line {
    display: grid;
    grid-template-columns: 1fr 4em auto;
    align-items: center; gap: 0.6rem;
    padding: 0.4rem 0; border-bottom: 1px solid var(--color-border);
  }
  .order-line:last-child { border-bottom: none; }
  /* min-width: 0 overrides the grid item's implicit min-width: auto (min-content), which
     would otherwise refuse to shrink below the full name's width and push the price
     columns off-screen — truncate with an ellipsis instead of wrapping or overflowing.
     On a wider viewport (e.g. landscape) the 1fr track simply gets more room, so more
     of the name shows before truncation kicks in — no separate breakpoint needed. */
  .line-name {
    font-weight: 600;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  /* Options always go on their own line below the name — the name column is
     narrow (see min-width: 0 above), too little room to fit both side by
     side without truncating one or the other unreadably. */
  .line-name-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .line-options { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 400; }
  .line-unit { font-size: 0.8rem; text-align: right; }
  .qty { display: flex; align-items: center; gap: 0.3rem; }
  .qty-btn {
    border-radius: 50%; border: 1px solid var(--color-border);
    background: var(--color-bg); color: var(--color-text); cursor: pointer;
  }
  /* Narrow-phone fix (found live, 2026-08-26): the app-wide 44px touch-target
     rule in register/+layout.svelte left almost no room for the article name
     on a narrow screen once the dot and total columns were also removed
     below for the same reason — shrink just this row's steppers instead of
     relaxing the touch-target rule everywhere else it applies. Needs to
     out-specificity (not just out-!important) the global rule, since both
     sides use !important. */
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
  .place-btn { padding: 0.6rem 1.5rem; font-size: 1rem; }

  /* Hold-to-confirm (see $lib/longpress) — guards against a stray tap
     triggering the order. The fill sweeps left-to-right while held;
     .holding's transition duration must match the action's default
     durationMs (600ms) so the animation and the actual trigger line up. */
  .hold-btn { position: relative; overflow: hidden; user-select: none; -webkit-user-select: none; }
  .hold-fill {
    position: absolute; top: 0; left: 0; bottom: 0; width: 0;
    background: rgba(255, 255, 255, 0.28); pointer-events: none;
  }
  .hold-btn:global(.holding) .hold-fill { width: 100%; transition: width 600ms linear; }
  .hold-label { position: relative; }

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

  .small { font-size: 0.85rem; }
  .option-list { list-style: none; padding: 0; margin: 0.5rem 0; }
  .option-list li { padding: 0.3rem 0; }
  .option-label { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; }
  .freetext-link { padding: 0; margin-top: 0.4rem; }
  .freetext-label { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.6rem; font-size: 0.85rem; color: var(--color-text-muted); }
  .freetext-label input { padding: 0.4rem 0.6rem; font-size: 1rem; }
  .modal-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; }
  .modal-actions .spacer { flex: 1; }

  .note-select-list { list-style: none; padding: 0; margin: 0; }
  .note-select-item {
    display: flex; align-items: center; gap: 0.6rem; width: 100%;
    padding: 0.5rem 0.3rem; border: none; border-bottom: 1px solid var(--color-border);
    background: none; color: inherit; text-align: left; cursor: pointer;
  }
  .note-select-list li:last-child .note-select-item { border-bottom: none; }
  .note-select-qty { font-weight: 600; min-width: 2.5em; }
  .note-select-name { display: flex; flex-direction: column; }
  .note-qty { margin: 0.5rem 0; }
</style>
