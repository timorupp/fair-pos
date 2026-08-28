<script lang="ts">
  /**
   * TSE-Ausfall-Log (Task #72) — lists `tse_outage` rows (written
   * automatically by every signing attempt, see tse/outage.ts) so an admin
   * can see past and currently-open outages with their reason, without
   * needing direct DB access. Not event-scoped: an outage isn't tied to a
   * specific Veranstaltung.
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';

  type OutageRow = { id: string; started_at: string; ended_at: string | null; reason: string };

  let outages: OutageRow[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    load();
    refreshTimer = setInterval(load, 30_000);
  });

  onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });

  /** Reloads the outage list. */
  async function load() {
    try {
      outages = await api.admin.reports.tseOutages();
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
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

  /**
   * Formats the duration between two ISO timestamps as a short German string.
   *
   * @param startIso - Start timestamp.
   * @param endIso - End timestamp, or `null` for an outage still in progress (uses "now").
   * @returns e.g. "3 Min" or "2 Std 14 Min".
   */
  function durationLabel(startIso: string, endIso: string | null): string {
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const totalMinutes = Math.max(0, Math.round((end - start) / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours} Std ${minutes} Min` : `${minutes} Min`;
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>TSE-Ausfall-Log</h1>
    <button class="btn-ghost" onclick={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
  </div>

  <p class="hint">Automatische Aktualisierung alle 30&nbsp;Sekunden. Anzeige auf die 500 neuesten Einträge begrenzt.</p>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if !loading && outages.length === 0}
    <p class="muted">Keine TSE-Ausfälle protokolliert.</p>
  {:else if !loading}
    <table>
      <thead>
        <tr>
          <th>Beginn</th>
          <th>Ende</th>
          <th>Dauer</th>
          <th>Grund</th>
        </tr>
      </thead>
      <tbody>
        {#each outages as o}
          <tr class:row-open={!o.ended_at}>
            <td>{timeLabel(o.started_at)}</td>
            <td>{#if o.ended_at}{timeLabel(o.ended_at)}{:else}<span class="badge-open">läuft noch</span>{/if}</td>
            <td>{durationLabel(o.started_at, o.ended_at)}</td>
            <td>{o.reason}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 1rem 0; }
  table { width: 100%; font-size: 0.9rem; }
  tr.row-open { background: rgba(255, 79, 79, 0.05); }
  .badge-open { color: var(--color-danger); font-weight: 600; }
</style>
