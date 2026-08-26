<script lang="ts">
  /**
   * System-log viewer (Task #64) — shows `system_log` entries (currently
   * written only by the TSE health job, see docs/TSE-Integration.md, but the
   * table is generic so future checks can log here too). Refreshes
   * automatically so an admin watching after a reported problem sees new
   * entries without manually reloading.
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';

  type LogRow = {
    id: string; createdAt: string;
    severity: 'info' | 'warning' | 'error';
    category: string; message: string;
  };

  let logs: LogRow[] = $state([]);
  let categories: string[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let severityFilter: '' | 'info' | 'warning' | 'error' = $state('');
  let categoryFilter = $state('');
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    load();
    loadCategories();
    refreshTimer = setInterval(load, 10_000);
  });

  onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });

  /** Reloads the log list using the current filters. */
  async function load() {
    try {
      logs = await api.admin.logs.list({
        severity: severityFilter || undefined,
        category: categoryFilter || undefined,
      });
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  /** Loads the distinct-category list for the filter dropdown. */
  async function loadCategories() {
    try { categories = await api.admin.logs.categories(); }
    catch { /* filter dropdown just stays empty — not worth surfacing separately */ }
  }

  /**
   * Maps a log category tag to its German UI label.
   *
   * @param c - The category value (e.g. `tse_health`).
   * @returns Human-readable label, or the raw tag if unknown.
   */
  function categoryLabel(c: string): string {
    if (c === 'tse_health') return 'TSE-Gesundheitscheck';
    return c;
  }

  /**
   * Maps a severity value to its German UI label.
   *
   * @param s - The severity value.
   * @returns Human-readable label.
   */
  function severityLabel(s: LogRow['severity']): string {
    if (s === 'info') return 'Info';
    if (s === 'warning') return 'Warnung';
    return 'Fehler';
  }

  /**
   * Formats an ISO timestamp as a short German date+time.
   *
   * @param iso - ISO-8601 string.
   * @returns Localised display string or the raw input on parse failure.
   */
  function timeLabel(iso: string): string {
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }); }
    catch { return iso; }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Systemprotokoll</h1>
    <button class="btn-ghost" onclick={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
  </div>

  <div class="filter-row">
    <label>
      Schweregrad
      <select bind:value={severityFilter} onchange={load}>
        <option value="">Alle</option>
        <option value="info">Info</option>
        <option value="warning">Warnung</option>
        <option value="error">Fehler</option>
      </select>
    </label>
    <label>
      Kategorie
      <select bind:value={categoryFilter} onchange={load}>
        <option value="">Alle</option>
        {#each categories as c}
          <option value={c}>{categoryLabel(c)}</option>
        {/each}
      </select>
    </label>
    <p class="hint">Automatische Aktualisierung alle 10&nbsp;Sekunden. Anzeige auf die 500 neuesten Einträge begrenzt.</p>
  </div>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if !loading && logs.length === 0}
    <p class="muted">Keine Protokolleinträge.</p>
  {:else if !loading}
    <table>
      <thead>
        <tr>
          <th>Zeitpunkt</th>
          <th>Schweregrad</th>
          <th>Kategorie</th>
          <th>Meldung</th>
        </tr>
      </thead>
      <tbody>
        {#each logs as l}
          <tr class="row-{l.severity}">
            <td>{timeLabel(l.createdAt)}</td>
            <td class="severity-{l.severity}">{severityLabel(l.severity)}</td>
            <td>{categoryLabel(l.category)}</td>
            <td>{l.message}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .filter-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .filter-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .filter-row select { padding: 0.4rem 0.6rem; min-width: 180px; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
  table { width: 100%; font-size: 0.9rem; }
  .severity-info    { color: #4caf7d; font-weight: 600; }
  .severity-warning { color: #c87a00; font-weight: 600; }
  .severity-error   { color: var(--color-danger); font-weight: 600; }
  tr.row-warning { background: rgba(200, 122, 0, 0.05); }
  tr.row-error   { background: rgba(255, 79, 79, 0.05); }
</style>
