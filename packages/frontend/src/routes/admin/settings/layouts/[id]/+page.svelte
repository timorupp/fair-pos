<script lang="ts">
  import { run, createBubbler, preventDefault, stopPropagation } from 'svelte/legacy';

  const bubble = createBubbler();
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import type { Article } from '@fairpos/shared';

  // ── State ──────────────────────────────────────────────────────────────────

  type Slot = {
    article_id: string; article_name: string; grid_row: number; grid_col: number; color: string;
    label: string | null; hidden: boolean;
  };

  let layoutId = $state('');
  let layoutName = $state('');
  let gridCols = $state(4);
  let gridRows = $state(4);
  let slots: Slot[] = $state([]);
  let articles: Article[] = $state([]);

  let loading = $state(true);
  let saving = $state(false);
  let dirty = $state(false);
  let error = $state('');

  // Color picker popover
  let pickerCell: { row: number; col: number } | null = $state(null);

  // Drag state — module-level so dragover handlers can read it without dataTransfer
  let dragging: { type: 'ablage' | 'slot'; articleId: string; articleName: string; fromRow?: number; fromCol?: number } | null = null;
  let dragOverCell: string | null = $state(null); // "row:col"


  onMount(async () => {
    try {
      const [layout, arts] = await Promise.all([
        api.admin.layouts.get(layoutId),
        api.admin.articles.list(),
      ]);
      layoutName = layout.name;
      gridCols = layout.grid_cols;
      gridRows = layout.grid_rows;
      slots = layout.slots.map((s) => ({
        article_id: s.article_id, article_name: s.article_name, grid_row: s.grid_row, grid_col: s.grid_col,
        color: s.color, label: s.label, hidden: s.hidden,
      }));
      articles = arts.filter((a) => a.is_active);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  });


  function buildGrid(rows: number, cols: number, s: Slot[]) {
    const cells: (Slot | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (const slot of s) {
      if (slot.grid_row < rows && slot.grid_col < cols) (cells[slot.grid_row] as (Slot | null)[])[slot.grid_col] = slot;
    }
    return cells;
  }

  function slotAt(row: number, col: number): Slot | null {
    return slots.find((s) => s.grid_row === row && s.grid_col === col) ?? null;
  }

  // ── Grid size changes ──────────────────────────────────────────────────────

  function changeSize(dim: 'cols' | 'rows', delta: number) {
    if (dim === 'cols') {
      const next = Math.max(1, Math.min(10, gridCols + delta));
      if (next < gridCols) slots = slots.filter((s) => s.grid_col < next);
      gridCols = next;
    } else {
      const next = Math.max(1, Math.min(10, gridRows + delta));
      if (next < gridRows) slots = slots.filter((s) => s.grid_row < next);
      gridRows = next;
    }
    dirty = true;
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316','#14b8a6','#6366f1','#84cc16','#64748b'];
  const DEFAULT_COLOR = '#3b82f6';

  function dragStartAblage(e: DragEvent, article: Article) {
    dragging = { type: 'ablage', articleId: article.id, articleName: article.name };
    e.dataTransfer!.effectAllowed = 'move';
  }

  function dragStartSlot(e: DragEvent, slot: Slot) {
    dragging = { type: 'slot', articleId: slot.article_id, articleName: slot.article_name, fromRow: slot.grid_row, fromCol: slot.grid_col };
    e.dataTransfer!.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, row: number, col: number) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOverCell = `${row}:${col}`;
  }

  function onDragLeave() { dragOverCell = null; }

  function onDrop(e: DragEvent, row: number, col: number) {
    e.preventDefault();
    dragOverCell = null;
    if (!dragging) return;

    const existing = slotAt(row, col);

    if (dragging.type === 'ablage') {
      // Place from ablage; if cell occupied, bump existing back to ablage (just remove).
      // A fresh placement always starts with defaults — only a move preserves attributes (see below).
      slots = slots.filter((s) => !(s.grid_row === row && s.grid_col === col));
      slots = [...slots, {
        article_id: dragging.articleId, article_name: dragging.articleName,
        grid_row: row, grid_col: col, color: DEFAULT_COLOR, label: null, hidden: false,
      }];
    } else {
      // Move from another cell — grab the full moved slot BEFORE removing it from
      // its old position, so color/label/hidden carry over to the new position
      // instead of resetting to defaults (found live: the previous code looked
      // the old slot up again via slotAt() only after it had already been
      // filtered out, so it always found nothing and silently fell back to
      // DEFAULT_COLOR).
      const { fromRow, fromCol } = dragging;
      const movedSlot = slotAt(fromRow!, fromCol!)!;
      // Remove from old position
      slots = slots.filter((s) => !(s.grid_row === fromRow && s.grid_col === fromCol));
      if (existing) {
        // Swap: put existing where the dragged came from
        slots = slots.filter((s) => !(s.grid_row === row && s.grid_col === col));
        slots = [...slots, { ...existing, grid_row: fromRow!, grid_col: fromCol! }];
      } else {
        slots = slots.filter((s) => !(s.grid_row === row && s.grid_col === col));
      }
      slots = [...slots, { ...movedSlot, grid_row: row, grid_col: col }];
    }

    dragging = null;
    dirty = true;
    pickerCell = null;
  }

  function onDropAblage(e: DragEvent) {
    e.preventDefault();
    dragOverCell = null;
    if (!dragging || dragging.type !== 'slot') return;
    slots = slots.filter((s) => !(s.grid_row === dragging!.fromRow && s.grid_col === dragging!.fromCol));
    dragging = null;
    dirty = true;
  }

  function onDragEnd() { dragging = null; dragOverCell = null; }

  // ── Color picker ──────────────────────────────────────────────────────────

  function openPicker(e: MouseEvent, row: number, col: number) {
    e.stopPropagation();
    pickerCell = pickerCell && pickerCell.row === row && pickerCell.col === col ? null : { row, col };
  }

  function setColor(row: number, col: number, color: string) {
    slots = slots.map((s) => s.grid_row === row && s.grid_col === col ? { ...s, color } : s);
    pickerCell = null;
    dirty = true;
  }

  /** Updates the custom button text for one slot — empty clears it back to the article-name fallback. */
  function setLabel(row: number, col: number, label: string) {
    slots = slots.map((s) => s.grid_row === row && s.grid_col === col ? { ...s, label: label || null } : s);
    dirty = true;
  }

  /** Toggles whether a slot is temporarily pulled off the Bonkasse/Bedienung grid, without losing its position/color/label. */
  function toggleHidden(row: number, col: number) {
    slots = slots.map((s) => s.grid_row === row && s.grid_col === col ? { ...s, hidden: !s.hidden } : s);
    dirty = true;
  }

  function closePicker() { pickerCell = null; }

  // ── Rename ────────────────────────────────────────────────────────────────

  function onNameBlur() { dirty = true; }

  // ── Delete layout ─────────────────────────────────────────────────────────

  async function deleteLayout() {
    if (!confirm(`Layout "${layoutName}" wirklich löschen?`)) return;
    try {
      await api.admin.layouts.delete(layoutId);
      location.assign('/admin/settings/layouts');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler beim Löschen');
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function save() {
    saving = true;
    try {
      await api.admin.layouts.update(layoutId, { name: layoutName, grid_cols: gridCols, grid_rows: gridRows });
      await api.admin.layouts.saveSlots(layoutId, slots.map(({ article_id, grid_row, grid_col, color, label, hidden }) => ({ article_id, grid_row, grid_col, color, label, hidden })));
      dirty = false;
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally { saving = false; }
  }
  run(() => {
    layoutId = ($page.params['id'] ?? '') as string;
  });
  // ── Derived ────────────────────────────────────────────────────────────────

  let placedIds = $derived(new Set(slots.map((s) => s.article_id)));
  let ablage = $derived(articles.filter((a) => !placedIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'de')));
  let grid = $derived(buildGrid(gridRows, gridCols, slots));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="editor-shell" onclick={closePicker}>
  {#if loading}
    <p class="muted loading">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <!-- Header -->
    <div class="editor-header">
      <a href="/admin/settings/layouts" class="back-link">← Kassenlayouts</a>
      <input class="name-input" bind:value={layoutName} onblur={onNameBlur} />
      <div class="size-controls">
        <span class="size-label">Spalten</span>
        <button class="size-btn" onclick={() => changeSize('cols', -1)} disabled={gridCols <= 1}>−</button>
        <span class="size-val">{gridCols}</span>
        <button class="size-btn" onclick={() => changeSize('cols', 1)} disabled={gridCols >= 10}>+</button>
        <span class="size-label">Zeilen</span>
        <button class="size-btn" onclick={() => changeSize('rows', -1)} disabled={gridRows <= 1}>−</button>
        <span class="size-val">{gridRows}</span>
        <button class="size-btn" onclick={() => changeSize('rows', 1)} disabled={gridRows >= 10}>+</button>
      </div>
      <div class="header-actions">
        <button class="btn-ghost danger" onclick={deleteLayout} disabled={saving}>Löschen</button>
        <button class="btn-primary save-btn" onclick={save} disabled={saving || !dirty}>
          {saving ? 'Speichern…' : dirty ? 'Speichern' : 'Gespeichert'}
        </button>
      </div>
    </div>

    <div class="editor-body">
      <!-- Ablage (drawer of unplaced articles) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ablage"
           ondragover={preventDefault(bubble('dragover'))}
           ondrop={onDropAblage}>
        <div class="ablage-title">Ablage <span class="ablage-count">({ablage.length})</span></div>
        {#if ablage.length === 0}
          <p class="ablage-empty">Alle Artikel platziert</p>
        {:else}
          <div class="ablage-list">
            {#each ablage as article (article.id)}
              <div class="ablage-item"
                   draggable="true"
                   ondragstart={(e) => dragStartAblage(e, article)}
                   ondragend={onDragEnd}>
                {article.name}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Grid -->
      <div class="grid-wrap">
        <div class="grid" style="--cols:{gridCols}; --rows:{gridRows}">
          {#each { length: gridRows } as _, row}
            {#each { length: gridCols } as _, col}
              {@const slot = grid[row]?.[col] ?? null}
              {@const cellKey = `${row}:${col}`}
              {@const isOver = dragOverCell === cellKey}
              {@const isPicker = pickerCell?.row === row && pickerCell?.col === col}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="cell"
                   class:occupied={slot !== null}
                   class:drag-over={isOver}
                   ondragover={(e) => onDragOver(e, row, col)}
                   ondragleave={onDragLeave}
                   ondrop={(e) => onDrop(e, row, col)}>
                {#if slot}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="tile"
                       class:hidden-slot={slot.hidden}
                       style="background:{slot.color}"
                       draggable="true"
                       ondragstart={(e) => dragStartSlot(e, slot)}
                       ondragend={onDragEnd}
                       onclick={(e) => openPicker(e, row, col)}>
                    <span class="tile-name">{slot.label || slot.article_name}</span>
                  </div>
                  {#if isPicker}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="picker" onclick={stopPropagation(bubble('click'))}>
                      <div class="picker-colors">
                        {#each COLORS as c}
                          <button class="swatch" style="background:{c}" class:active={slot.color === c}
                                  onclick={() => setColor(row, col, c)} aria-label={c}></button>
                        {/each}
                      </div>
                      <label class="picker-field">
                        Tastenbeschriftung
                        <textarea rows="3" placeholder={slot.article_name}
                                  value={slot.label ?? ''}
                                  oninput={(e) => setLabel(row, col, e.currentTarget.value)}></textarea>
                      </label>
                      <label class="picker-check">
                        <input type="checkbox" checked={slot.hidden} onchange={() => toggleHidden(row, col)} />
                        Vorübergehend verstecken
                      </label>
                    </div>
                  {/if}
                {:else}
                  <div class="cell-empty"></div>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .editor-shell { display: flex; flex-direction: column; height: calc(100dvh - 4rem); gap: 0; }
  .loading { padding: 2rem; }

  /* Header */
  .editor-header {
    display: flex; align-items: center; gap: 1rem; padding: 0 0 1.25rem;
    border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  }
  .back-link { font-size: 0.8rem; color: var(--color-text-muted); text-decoration: none; white-space: nowrap; }
  .back-link:hover { color: var(--color-text); }
  .name-input {
    flex: 1; background: transparent; border: none; border-bottom: 2px solid transparent;
    color: var(--color-text); font-size: 1.1rem; font-weight: 600; outline: none;
    padding: 0.15rem 0.25rem; min-width: 0;
    transition: border-color 0.15s;
  }
  .name-input:focus { border-bottom-color: var(--color-primary); }
  .header-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
  .size-controls { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
  .size-label { font-size: 0.75rem; color: var(--color-text-muted); }
  .size-val { font-size: 0.9rem; font-variant-numeric: tabular-nums; min-width: 1.2rem; text-align: center; }
  .size-btn {
    width: 1.6rem; height: 1.6rem; background: var(--color-surface-2);
    border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    color: var(--color-text); font-size: 1rem; line-height: 1;
    display: flex; align-items: center; justify-content: center;
  }
  .size-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .save-btn { flex-shrink: 0; }

  /* Body */
  .editor-body { display: flex; gap: 1.5rem; flex: 1; overflow: hidden; padding-top: 1.25rem; }

  /* Ablage */
  .ablage {
    width: 180px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem;
    border: 2px dashed var(--color-border); border-radius: var(--radius); padding: 0.75rem;
    overflow-y: auto;
  }
  .ablage-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
  .ablage-count { font-weight: 400; }
  .ablage-empty { font-size: 0.8rem; color: var(--color-text-muted); text-align: center; padding: 1rem 0; }
  .ablage-list { display: flex; flex-direction: column; gap: 4px; }
  .ablage-item {
    padding: 0.45rem 0.6rem; background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); font-size: 0.8rem; cursor: grab;
    user-select: none; transition: border-color 0.1s;
  }
  .ablage-item:hover { border-color: var(--color-text-muted); }
  .ablage-item:active { cursor: grabbing; }

  /* Grid */
  .grid-wrap { flex: 1; overflow: auto; }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(80px, 120px));
    grid-template-rows: repeat(var(--rows), minmax(60px, 80px));
    gap: 6px;
    width: fit-content;
  }

  .cell {
    position: relative; border: 2px dashed var(--color-border); border-radius: var(--radius-sm);
    transition: border-color 0.1s, background 0.1s;
  }
  .cell.drag-over { border-color: var(--color-primary); background: rgba(79,124,255,0.08); }
  .cell.occupied { border-color: transparent; }

  .tile {
    width: 100%; height: 100%; border-radius: calc(var(--radius-sm) - 1px);
    display: flex; align-items: center; justify-content: center; padding: 0.4rem;
    cursor: grab; user-select: none; position: relative;
  }
  .tile:active { cursor: grabbing; }
  .tile.hidden-slot { filter: grayscale(0.85) brightness(0.7); }
  .tile-name {
    font-size: 0.75rem; font-weight: 600; color: #fff; text-align: center;
    line-height: 1.2; overflow: hidden; display: -webkit-box;
    -webkit-line-clamp: 3; -webkit-box-orient: vertical; line-clamp: 3;
    text-shadow: 0 1px 2px rgba(0,0,0,0.35);
  }

  /* Color picker popover */
  .picker {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3); min-width: 200px;
  }
  .picker-colors { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .swatch {
    width: 20px; height: 20px; border-radius: 4px; border: 2px solid transparent;
    cursor: pointer; transition: transform 0.1s;
  }
  .swatch:hover { transform: scale(1.2); }
  .swatch.active { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.4); }
  .picker-field {
    display: flex; flex-direction: column; gap: 0.3rem;
    font-size: 0.75rem; color: var(--color-text-muted);
  }
  .picker-field textarea {
    resize: none; font-size: 0.8rem; padding: 0.4rem 0.5rem;
    font-family: inherit;
  }
  .picker-check {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.75rem; color: var(--color-text-muted); cursor: pointer;
  }

  .cell-empty { width: 100%; height: 100%; }
</style>
