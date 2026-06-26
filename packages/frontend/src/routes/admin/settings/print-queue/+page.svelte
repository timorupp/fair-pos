<script lang="ts">
  /**
   * Print-queue overview — shows every non-terminal job across all printers
   * with cancel and retry actions. Refreshes automatically every few seconds
   * so the operator sees the queue drain in real time.
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';

  type JobRow = {
    id: string; printer_id: string; printer_name: string;
    type: string; status: string; attempts: number;
    reference_id: string | null;
    created_at: string; last_attempt_at: string | null;
    error_message: string | null;
  };

  let jobs: JobRow[] = [];
  let loading = true;
  let error = '';
  let statusFilter: '' | 'all' | 'pending' | 'printing' | 'failed' | 'done' = '';
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    load();
    refreshTimer = setInterval(load, 5_000);
  });

  onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });

  /** Reloads the job list using the current status filter. */
  async function load() {
    try {
      jobs = await api.admin.printJobs.list(statusFilter || undefined);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  /**
   * Cancels (removes) the supplied job. Asks for confirmation first because
   * the action is destructive — a queued bestellbon that is cancelled here
   * cannot easily be re-issued without re-doing the order.
   *
   * @param j - The row to remove.
   */
  async function cancelJob(j: JobRow) {
    if (!confirm(`Druckauftrag (${typeLabel(j.type)} – ${j.printer_name}) wirklich löschen?`)) return;
    try { await api.admin.printJobs.cancel(j.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  /**
   * Re-queues a failed job for another attempt. The worker picks it up on the
   * next sweep.
   *
   * @param j - The failed job to retry.
   */
  async function retryJob(j: JobRow) {
    try { await api.admin.printJobs.retry(j.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  /**
   * Maps a `print_job.type` enum value to its German UI label.
   *
   * @param t - The job type.
   * @returns Human-readable label.
   */
  function typeLabel(t: string): string {
    if (t === 'order_slip') return 'Bestellbon';
    if (t === 'receipt') return 'Kassenbon';
    if (t === 'daily_closing') return 'Z-Bon';
    if (t === 'test_print') return 'Testdruck';
    return t;
  }

  /**
   * Maps a `print_job.status` to its German UI label.
   *
   * @param s - The status value.
   * @returns Human-readable label.
   */
  function statusLabel(s: string): string {
    if (s === 'pending') return 'Wartet';
    if (s === 'printing') return 'Druckt…';
    if (s === 'failed') return 'Fehlgeschlagen';
    if (s === 'done') return 'Erledigt';
    return s;
  }

  /**
   * Formats an ISO timestamp as a short German date+time.
   *
   * @param iso - ISO-8601 string.
   * @returns Localised display string or the raw input on parse failure.
   */
  function timeLabel(iso: string | null): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }); }
    catch { return iso; }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Druckwarteschlange</h1>
    <button class="btn-ghost" on:click={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
  </div>

  <div class="filter-row">
    <label>
      Status
      <select bind:value={statusFilter} on:change={load}>
        <option value="">Aktive Aufträge (Standard)</option>
        <option value="all">Alle (inkl. erledigt)</option>
        <option value="pending">Wartet</option>
        <option value="printing">Druckt</option>
        <option value="failed">Fehlgeschlagen</option>
        <option value="done">Erledigt</option>
      </select>
    </label>
    <p class="hint">
      Automatische Aktualisierung alle 5&nbsp;Sekunden.
      {#if statusFilter === 'all' || statusFilter === 'done'}<br/>Anzeige auf die 500 neuesten Aufträge begrenzt.{/if}
    </p>
  </div>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if !loading && jobs.length === 0}
    <p class="muted">Keine Druckaufträge in der Warteschlange.</p>
  {:else if !loading}
    <table>
      <thead>
        <tr>
          <th>Drucker</th>
          <th>Typ</th>
          <th>Status</th>
          <th class="num">Versuche</th>
          <th>Erstellt</th>
          <th>Letzter Versuch</th>
          <th>Fehler</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each jobs as j}
          <tr class:row-failed={j.status === 'failed'}>
            <td>{j.printer_name}</td>
            <td>{typeLabel(j.type)}</td>
            <td class="status-{j.status}">{statusLabel(j.status)}</td>
            <td class="num">{j.attempts}</td>
            <td>{timeLabel(j.created_at)}</td>
            <td>{timeLabel(j.last_attempt_at)}</td>
            <td class="err-cell">{j.error_message ?? '—'}</td>
            <td class="actions">
              {#if (j.type === 'receipt' || j.type === 'daily_closing') && j.reference_id}
                <a class="btn-ghost" href={api.admin.printJobs.pdfUrl(j.id)} target="_blank" rel="noopener">PDF</a>
              {/if}
              {#if j.status === 'failed'}
                <button class="btn-ghost" on:click={() => retryJob(j)}>Wiederholen</button>
              {/if}
              {#if j.status !== 'done'}
                <button class="btn-ghost danger" on:click={() => cancelJob(j)} disabled={j.status === 'printing'}>
                  Abbrechen
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .filter-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; }
  .filter-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .filter-row select { padding: 0.4rem 0.6rem; min-width: 220px; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
  table { width: 100%; font-size: 0.9rem; }
  .status-pending  { color: #c87a00; font-weight: 600; }
  .status-printing { color: var(--color-primary); font-weight: 600; }
  .status-failed   { color: var(--color-danger); font-weight: 600; }
  .status-done     { color: #4caf7d; font-weight: 600; }
  .err-cell { color: var(--color-danger); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }
  tr.row-failed { background: rgba(255, 79, 79, 0.04); }
  .actions { display: flex; gap: 0.4rem; }
</style>
