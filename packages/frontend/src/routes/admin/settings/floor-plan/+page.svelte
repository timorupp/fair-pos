<script lang="ts">
  import { stopPropagation, createBubbler } from 'svelte/legacy';

  const bubble = createBubbler();
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { reorderArray } from '$lib/array';
  import { columnsFromTables, rowsFromTables } from '$lib/floor-plan';
  import type { DiningTable, TableStatus } from '@fairpos/shared';

  // ── State ──────────────────────────────────────────────────────────────────

  let tables: DiningTable[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Generate form
  let genColCount = $state(4);
  let genColType: 'alpha' | 'numeric' = $state('alpha');
  let genColOrder: 'asc' | 'desc' = $state('asc');
  let genRowCount = $state(5);
  let genRowType: 'alpha' | 'numeric' = $state('numeric');
  let genRowOrder: 'asc' | 'desc' = $state('asc');
  let genReplace = $state(true);
  let generating = $state(false);

  // Context menu
  let menuTable: DiningTable | null = $state(null);
  let menuX = $state(0);
  let menuY = $state(0);
  let renaming: string | null = $state(null); // table id being renamed
  let renameValue = $state('');

  // Drag state for column/row reordering
  let draggingCol: string | null = $state(null);
  let draggingRow: string | null = $state(null);
  let dragOverCol: string | null = $state(null);
  let dragOverRow: string | null = $state(null);

  onMount(load);

  async function load() {
    loading = true;
    try { tables = await api.admin.tables.list(); }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  /**
   * Prompts for a label and appends a fresh column at the right edge of the grid.
   * Refuses empty / whitespace-only labels and surfaces backend conflicts (duplicate label) as alerts.
   */
  async function addColumn() {
    const label = prompt('Beschriftung der neuen Spalte:')?.trim();
    if (!label) return;
    try { tables = await api.admin.tables.addColumn(label); }
    catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  /**
   * Prompts for a label and appends a fresh row at the bottom of the grid.
   * Refuses empty / whitespace-only labels and surfaces backend conflicts as alerts.
   */
  async function addRow() {
    const label = prompt('Beschriftung der neuen Zeile:')?.trim();
    if (!label) return;
    try { tables = await api.admin.tables.addRow(label); }
    catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  /**
   * Asks for confirmation and then deletes every table in the column identified by `label`.
   *
   * @param label - The column's `col_label` (e.g. "A", "B").
   */
  async function deleteColumn(label: string) {
    const affected = tables.filter((t) => t.col_label === label).length;
    if (!confirm(`Spalte "${label}" und ${affected} Tisch${affected === 1 ? '' : 'e'} wirklich löschen?`)) return;
    try { await api.admin.tables.deleteColumn(label); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  /**
   * Asks for confirmation and then deletes every table in the row identified by `label`.
   *
   * @param label - The row's `row_label`.
   */
  async function deleteRow(label: string) {
    const affected = tables.filter((t) => t.row_label === label).length;
    if (!confirm(`Zeile "${label}" und ${affected} Tisch${affected === 1 ? '' : 'e'} wirklich löschen?`)) return;
    try { await api.admin.tables.deleteRow(label); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  // ── Derived grid ───────────────────────────────────────────────────────────

  /** Unique columns sorted by col_order. */
  let columns = $derived(columnsFromTables(tables));

  /** Unique rows sorted by row_order. */
  let rows = $derived(rowsFromTables(tables));

  /** Lookup: col_label + row_label → table. */
  let tableMap = $derived(new Map(tables.map(t => [`${t.col_label}:${t.row_label}`, t])));

  function tableAt(col: string, row: string): DiningTable | undefined {
    return tableMap.get(`${col}:${row}`);
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  async function generate() {
    generating = true;
    try {
      tables = await api.admin.tables.generate({
        cols: { count: genColCount, label_type: genColType, order: genColOrder },
        rows: { count: genRowCount, label_type: genRowType, order: genRowOrder },
        replace: genReplace,
      });
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
    finally { generating = false; }
  }

  // ── Context menu ───────────────────────────────────────────────────────────

  function openMenu(e: MouseEvent, t: DiningTable) {
    e.preventDefault();
    e.stopPropagation();
    menuTable = t;
    menuX = e.clientX;
    menuY = e.clientY;
    renaming = null;
  }

  function closeMenu() { menuTable = null; renaming = null; }

  async function setStatus(status: TableStatus) {
    if (!menuTable) return;
    try {
      const updated = await api.admin.tables.update(menuTable.id, { status });
      tables = tables.map(t => t.id === updated.id ? updated : t);
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
    closeMenu();
  }

  function startRename() {
    if (!menuTable) return;
    renaming = menuTable.id;
    renameValue = menuTable.name;
  }

  async function commitRename() {
    if (!renaming || !renameValue.trim()) { renaming = null; return; }
    try {
      const updated = await api.admin.tables.update(renaming, { name: renameValue.trim() });
      tables = tables.map(t => t.id === updated.id ? updated : t);
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
    renaming = null;
    closeMenu();
  }

  async function deleteTable() {
    if (!menuTable) return;
    if (!confirm(`Tisch "${menuTable.name}" wirklich löschen?`)) return;
    const id = menuTable.id;
    closeMenu();
    try {
      await api.admin.tables.delete(id);
      tables = tables.filter(t => t.id !== id);
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  // ── Column drag & drop ─────────────────────────────────────────────────────

  function colDragStart(e: DragEvent, col: string) {
    draggingCol = col;
    e.dataTransfer!.effectAllowed = 'move';
  }

  function colDragOver(e: DragEvent, col: string) {
    if (!draggingCol || draggingCol === col) return;
    e.preventDefault();
    dragOverCol = col;
  }

  async function colDrop(col: string) {
    if (!draggingCol || draggingCol === col) { draggingCol = null; dragOverCol = null; return; }
    const reordered = reorderArray(columns, draggingCol, col);
    draggingCol = null; dragOverCol = null;
    await saveOrder(reordered, rows);
  }

  // ── Row drag & drop ────────────────────────────────────────────────────────

  function rowDragStart(e: DragEvent, row: string) {
    draggingRow = row;
    e.dataTransfer!.effectAllowed = 'move';
  }

  function rowDragOver(e: DragEvent, row: string) {
    if (!draggingRow || draggingRow === row) return;
    e.preventDefault();
    dragOverRow = row;
  }

  async function rowDrop(row: string) {
    if (!draggingRow || draggingRow === row) { draggingRow = null; dragOverRow = null; return; }
    const reordered = reorderArray(rows, draggingRow, row);
    draggingRow = null; dragOverRow = null;
    await saveOrder(columns, reordered);
  }

  async function saveOrder(cols: string[], rws: string[]) {
    try {
      await api.admin.tables.reorder({ columns: cols, rows: rws });
      tables = await api.admin.tables.list();
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  const statusLabel = (s: TableStatus) =>
    s === 'active' ? 'Aktiv' : s === 'inactive' ? 'Inaktiv' : 'Versteckt';
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="page" onclick={closeMenu}>

  <div class="page-header"><h1>Saalplan</h1></div>

  <!-- Generate form -->
  <section class="gen-section">
    <h2>Tische generieren</h2>
    <div class="gen-grid">
      <fieldset>
        <legend>Spalten</legend>
        <div class="gen-row">
          <label>Anzahl
            <input type="number" min="1" max="26" bind:value={genColCount} />
          </label>
          <label>Beschriftung
            <select bind:value={genColType}>
              <option value="alpha">Alphabetisch (A, B, C…)</option>
              <option value="numeric">Numerisch (1, 2, 3…)</option>
            </select>
          </label>
          <label>Reihenfolge
            <select bind:value={genColOrder}>
              <option value="asc">Aufsteigend</option>
              <option value="desc">Absteigend</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Zeilen</legend>
        <div class="gen-row">
          <label>Anzahl
            <input type="number" min="1" max="26" bind:value={genRowCount} />
          </label>
          <label>Beschriftung
            <select bind:value={genRowType}>
              <option value="alpha">Alphabetisch (A, B, C…)</option>
              <option value="numeric">Numerisch (1, 2, 3…)</option>
            </select>
          </label>
          <label>Reihenfolge
            <select bind:value={genRowOrder}>
              <option value="asc">Aufsteigend</option>
              <option value="desc">Absteigend</option>
            </select>
          </label>
        </div>
      </fieldset>
    </div>
    <div class="gen-actions">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={genReplace} />
        Bestehende Tische ersetzen
      </label>
      <button class="btn-primary" onclick={generate} disabled={generating}>
        {generating ? 'Generieren…' : 'Tische generieren'}
      </button>
    </div>
  </section>

  <!-- Grid editor -->
  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if tables.length === 0}
    <p class="muted">Noch keine Tische. Nutze das Formular oben um Tische zu generieren.</p>
  {:else}
    <section class="editor-section">
      <div class="editor-header">
        <h2>Anordnung bearbeiten</h2>
        <div class="editor-actions">
          <button class="btn-ghost" onclick={addColumn}>+ Spalte</button>
          <button class="btn-ghost" onclick={addRow}>+ Zeile</button>
        </div>
      </div>
      <p class="hint">Handles ziehen zum Umsortieren. Rechtsklick auf einen Tisch öffnet das Kontextmenü. „×" auf einem Handle löscht die ganze Spalte bzw. Zeile.</p>
      <div class="grid-wrapper">
        <div
          class="floor-grid"
          style="--cols:{columns.length}; --rows:{rows.length}"
        >
          <!-- Top-left empty corner -->
          <div class="corner"></div>

          <!-- Column handles -->
          {#each columns as col (col)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="col-handle"
              class:drag-over={dragOverCol === col}
              draggable="true"
              ondragstart={(e) => colDragStart(e, col)}
              ondragover={(e) => colDragOver(e, col)}
              ondragleave={() => { dragOverCol = null; }}
              ondrop={() => colDrop(col)}
              ondragend={() => { draggingCol = null; dragOverCol = null; }}
            >
              <button class="axis-delete" title="Spalte löschen"
                      onclick={stopPropagation(() => deleteColumn(col))}>×</button>
              <span class="handle-icon">⋮⋮</span>
              <span class="handle-label">{col}</span>
            </div>
          {/each}

          <!-- Row handles + table cells -->
          {#each rows as row (row)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="row-handle"
              class:drag-over={dragOverRow === row}
              draggable="true"
              ondragstart={(e) => rowDragStart(e, row)}
              ondragover={(e) => rowDragOver(e, row)}
              ondragleave={() => { dragOverRow = null; }}
              ondrop={() => rowDrop(row)}
              ondragend={() => { draggingRow = null; dragOverRow = null; }}
            >
              <button class="axis-delete" title="Zeile löschen"
                      onclick={stopPropagation(() => deleteRow(row))}>×</button>
              <span class="handle-icon">⋯</span>
              <span class="handle-label">{row}</span>
            </div>

            {#each columns as col (col)}
              {@const t = tableAt(col, row)}
              {#if t}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="table-cell status-{t.status}"
                  oncontextmenu={(e) => openMenu(e, t)}
                  onclick={(e) => { e.stopPropagation(); if (menuTable?.id !== t.id) closeMenu(); }}
                >
                  {#if renaming === t.id}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      class="rename-input"
                      bind:value={renameValue}
                      autofocus
                      onblur={commitRename}
                      onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { renaming = null; closeMenu(); } }}
                      onclick={stopPropagation(bubble('click'))}
                    />
                  {:else}
                    <span class="table-name">{t.name}</span>
                    <span class="table-status-dot"></span>
                  {/if}
                </div>
              {:else}
                <div class="table-cell empty"></div>
              {/if}
            {/each}
          {/each}
        </div>
      </div>
    </section>
  {/if}
</div>

<!-- Context menu -->
{#if menuTable}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu"
    style="left:{menuX}px; top:{menuY}px"
    onclick={stopPropagation(bubble('click'))}
  >
    <div class="menu-title">{menuTable.name}</div>
    <div class="menu-divider"></div>
    <button class="menu-item" class:active={menuTable.status === 'active'} onclick={() => setStatus('active')}>
      <span class="status-dot dot-active"></span> Aktiv
    </button>
    <button class="menu-item" class:active={menuTable.status === 'inactive'} onclick={() => setStatus('inactive')}>
      <span class="status-dot dot-inactive"></span> Inaktiv
    </button>
    <button class="menu-item" class:active={menuTable.status === 'hidden'} onclick={() => setStatus('hidden')}>
      <span class="status-dot dot-hidden"></span> Versteckt
    </button>
    <div class="menu-divider"></div>
    <button class="menu-item" onclick={startRename}>Umbenennen</button>
    <button class="menu-item danger" onclick={deleteTable}>Löschen</button>
  </div>
{/if}

<style>
  /* ── Generate section ─────────────────────────────────────────────────────── */
  .gen-section {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }
  .gen-section h2, .editor-section h2 {
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--color-text-muted); margin-bottom: 1rem;
  }
  .gen-grid { display: flex; gap: 1.5rem; flex-wrap: wrap; }
  fieldset {
    border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    padding: 0.75rem 1rem; flex: 1; min-width: 240px;
  }
  legend { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); padding: 0 0.25rem; }
  .gen-row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .gen-row label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; color: var(--color-text-muted); flex: 1; min-width: 100px; }
  .gen-row input[type="number"] { width: 100%; }
  .gen-actions { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 1rem; }

  /* ── Editor header (above grid) ──────────────────────────────────────────── */
  .editor-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
  .editor-actions { display: flex; gap: 0.5rem; }

  /* ── Grid ─────────────────────────────────────────────────────────────────── */
  .editor-section { margin-top: 0; }
  .grid-wrapper { overflow-x: auto; }
  .floor-grid {
    display: grid;
    grid-template-columns: 2.5rem repeat(var(--cols), minmax(60px, 80px));
    grid-template-rows: 2rem repeat(var(--rows), 60px);
    gap: 4px;
    width: fit-content;
  }
  .corner { visibility: hidden; }

  /* ── Column handles ───────────────────────────────────────────────────────── */
  .col-handle {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: grab; gap: 2px; border-radius: var(--radius-sm);
    transition: background 0.1s;
  }
  .col-handle:hover, .col-handle.drag-over { background: var(--color-surface-hover); }
  .col-handle .handle-icon { font-size: 0.6rem; color: var(--color-text-muted); letter-spacing: 1px; }
  .col-handle .handle-label { font-size: 0.7rem; font-weight: 600; color: var(--color-text-muted); }
  .col-handle, .row-handle { position: relative; }
  .axis-delete {
    position: absolute; top: 1px; right: 1px;
    width: 14px; height: 14px; padding: 0; line-height: 1;
    background: transparent; border: none; color: var(--color-text-muted);
    font-size: 0.85rem; cursor: pointer; opacity: 0; transition: opacity 0.1s, color 0.1s;
  }
  .col-handle:hover .axis-delete, .row-handle:hover .axis-delete { opacity: 1; }
  .axis-delete:hover { color: var(--color-danger); }

  /* ── Row handles ──────────────────────────────────────────────────────────── */
  .row-handle {
    display: flex; flex-direction: row; align-items: center; justify-content: center;
    cursor: grab; gap: 2px; border-radius: var(--radius-sm);
    transition: background 0.1s;
  }
  .row-handle:hover, .row-handle.drag-over { background: var(--color-surface-hover); }
  .row-handle .handle-icon { font-size: 0.6rem; color: var(--color-text-muted); writing-mode: vertical-lr; }
  .row-handle .handle-label { font-size: 0.7rem; font-weight: 600; color: var(--color-text-muted); }

  /* ── Table cells ──────────────────────────────────────────────────────────── */
  .table-cell {
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 4px;
    font-size: 0.85rem; font-weight: 600;
    cursor: context-menu;
    position: relative;
    border: 2px solid transparent;
    transition: opacity 0.15s, border-color 0.15s;
  }
  .table-cell.empty { background: transparent; cursor: default; }
  .table-cell.status-active   { background: #22c55e22; border-color: #22c55e44; color: var(--color-text); }
  .table-cell.status-inactive { background: #f59e0b22; border-color: #f59e0b44; color: var(--color-text); }
  .table-cell.status-hidden   { background: var(--color-surface); border-color: var(--color-border); color: var(--color-text-muted); opacity: 0.5; }
  .table-cell:hover:not(.empty) { filter: brightness(1.1); }

  .table-name { font-size: 0.9rem; font-weight: 700; }
  .table-status-dot {
    width: 6px; height: 6px; border-radius: 50%;
  }
  .status-active   .table-status-dot { background: #22c55e; }
  .status-inactive .table-status-dot { background: #f59e0b; }
  .status-hidden   .table-status-dot { background: var(--color-text-muted); }

  .rename-input {
    width: 90%; font-size: 0.85rem; font-weight: 700; text-align: center;
    background: var(--color-bg); border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm); padding: 0.15rem 0.25rem;
    color: var(--color-text);
  }

  /* ── Context menu ─────────────────────────────────────────────────────────── */
  .context-menu {
    position: fixed; z-index: 1000;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    min-width: 160px; padding: 0.25rem;
  }
  .menu-title { font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); padding: 0.4rem 0.6rem 0.25rem; }
  .menu-divider { height: 1px; background: var(--color-border); margin: 0.25rem 0; }
  .menu-item {
    display: flex; align-items: center; gap: 0.5rem;
    width: 100%; text-align: left; padding: 0.4rem 0.6rem;
    background: transparent; border: none; color: var(--color-text);
    font-size: 0.85rem; border-radius: var(--radius-sm); cursor: pointer;
  }
  .menu-item:hover { background: var(--color-surface-hover); }
  .menu-item.active { font-weight: 600; }
  .menu-item.danger { color: var(--color-danger); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot-active   { background: #22c55e; }
  .dot-inactive { background: #f59e0b; }
  .dot-hidden   { background: var(--color-text-muted); }
</style>
