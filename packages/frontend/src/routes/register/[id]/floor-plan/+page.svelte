<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { columnsFromTables, rowsFromTables } from '$lib/floor-plan';
  import { currentRegisterName } from '$lib/stores/page-title';

  type TableRow = {
    id: string; name: string;
    col_label: string; row_label: string;
    col_order: number; row_order: number;
    status: 'active' | 'inactive' | 'hidden';
    has_open_items: boolean;
  };

  let registerId = '';
  let tables: TableRow[] = [];
  let loading = true;
  let error = '';

  /** Whether this register is locked because of pending Z-Bons. */
  let locked = false;
  let pendingDays: string[] = [];

  $: registerId = ($page.params['id'] ?? '') as string;

  onMount(load);

  /**
   * Loads the floor plan AND the register context so the operator sees a clear
   * "locked" screen instead of an empty/non-functional table grid when there
   * are outstanding Z-Bons.
   */
  async function load() {
    loading = true; error = '';
    try {
      const [floor, ctx] = await Promise.all([
        api.registerSession.floorPlan(registerId),
        api.registerSession.register(registerId),
      ]);
      tables = floor.tables;
      locked = ctx.locked;
      pendingDays = ctx.pending_days;
      currentRegisterName.set(ctx.register.name);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  // Derived grid axes.
  $: columns = columnsFromTables(tables);
  $: rows = rowsFromTables(tables);
  $: tableMap = new Map(tables.map((t) => [`${t.col_label}:${t.row_label}`, t]));

  function tableAt(col: string, row: string): TableRow | undefined {
    return tableMap.get(`${col}:${row}`);
  }

  function selectTable(t: TableRow) {
    if (t.status === 'inactive') return;
    if (t.has_open_items) {
      // Step 2b: show the action chooser when the table already has open items.
      goto(`/register/${registerId}/tables/${t.id}`);
    } else {
      // Step 2: empty table → straight to the order screen.
      goto(`/register/${registerId}/tables/${t.id}/order`);
    }
  }
</script>

<div class="floor-plan-page">
  <header class="header">
    <h1>Saalplan</h1>
    <button class="btn-ghost" on:click={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
  </header>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if locked}
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
  {:else if !loading && tables.length === 0}
    <p class="muted">Kein Saalplan konfiguriert. Bitte den Administrator kontaktieren.</p>
  {:else if !loading}
    <div class="legend">
      <span class="legend-item"><span class="dot status-free"></span> Frei</span>
      <span class="legend-item"><span class="dot status-open"></span> Offene Rechnung</span>
      <span class="legend-item"><span class="dot status-inactive"></span> Inaktiv</span>
    </div>

    <div class="grid-wrapper">
      <div class="floor-grid" style="--cols:{columns.length}; --rows:{rows.length}">
        {#each rows as row}
          {#each columns as col}
            {@const t = tableAt(col, row)}
            {#if t}
              <button
                class="table-tile"
                class:status-open={t.has_open_items}
                class:status-inactive={t.status === 'inactive'}
                disabled={t.status === 'inactive'}
                on:click={() => selectTable(t)}
              >
                <span class="tile-name">{t.name}</span>
                {#if t.has_open_items}<span class="tile-badge">●</span>{/if}
              </button>
            {:else}
              <div class="tile-empty"></div>
            {/if}
          {/each}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .floor-plan-page { padding: 1rem; }
  .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .header h1 { font-size: 1.2rem; margin: 0; flex: 1; }
  .legend { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 1rem; }
  .legend-item { display: inline-flex; align-items: center; gap: 0.4rem; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .status-free { background: #22c55e; }
  .status-open { background: #f59e0b; }
  .status-inactive { background: var(--color-text-muted); opacity: 0.5; }

  .grid-wrapper { overflow-x: auto; }
  .floor-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(72px, 100px));
    grid-template-rows: repeat(var(--rows), 72px);
    gap: 6px;
    width: fit-content;
  }
  .table-tile {
    position: relative;
    border-radius: var(--radius);
    border: 2px solid #22c55e44;
    background: #22c55e22;
    color: var(--color-text);
    cursor: pointer; font-weight: 700; font-size: 1rem;
    transition: filter 0.1s, transform 0.05s;
  }
  .table-tile:hover { filter: brightness(1.1); }
  .table-tile:active { transform: scale(0.97); }
  .table-tile.status-open { background: #f59e0b22; border-color: #f59e0b66; }
  .table-tile.status-inactive { background: var(--color-surface); border-color: var(--color-border); color: var(--color-text-muted); opacity: 0.5; cursor: not-allowed; }
  .tile-name { font-size: 0.95rem; }
  .tile-badge {
    position: absolute; top: 4px; right: 8px; color: #f59e0b; font-size: 0.7rem;
  }
  .tile-empty { background: transparent; }
  .lock-screen {
    max-width: 540px; margin: 3rem auto; text-align: center;
    background: #f59e0b22; border: 1px solid #f59e0b88; border-radius: var(--radius);
    padding: 2rem;
  }
  .lock-icon { font-size: 3rem; margin-bottom: 0.5rem; }
  .lock-screen h2 { color: #c87a00; margin: 0.25rem 0 1rem; }
  .lock-screen .pending-list { list-style: none; padding: 0; font-family: monospace; margin: 1rem 0; }
</style>
