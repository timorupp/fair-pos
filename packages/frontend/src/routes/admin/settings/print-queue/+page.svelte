<script lang="ts">
  /**
   * Print-queue overview — shows every non-terminal job across all printers
   * with cancel and retry actions. Refreshes automatically every few seconds
   * so the operator sees the queue drain in real time.
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import type { Printer } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type JobRow = {
    id: string; printer_id: string | null; printer_name: string;
    type: string; status: string; attempts: number;
    reference_id: string | null;
    created_at: string; last_attempt_at: string | null;
    error_message: string | null;
  };

  let jobs: JobRow[] = $state([]);
  let printers: Printer[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let statusFilter: '' | 'all' | 'pending' | 'printing' | 'failed' | 'done' | 'cancelled' = $state('');
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let cancellingAll = $state(false);

  onMount(() => {
    load();
    api.admin.printers.list().then((p) => { printers = p; }).catch(() => {});
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
   * Bulk-cancels every currently `pending` job, system-wide, regardless of
   * the active status filter (Task #107) — e.g. to clear out stale test
   * prints before switching a printer back on.
   */
  async function cancelAll() {
    if (!confirm('Alle wartenden Druckaufträge (Status "Wartet") abbrechen? Betrifft alle Drucker, unabhängig vom aktuellen Filter.')) return;
    cancellingAll = true;
    try {
      const result = await api.admin.printJobs.cancelAll();
      await load();
      alert(`${result.cancelled} Druckauftrag(e) abgebrochen.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally {
      cancellingAll = false;
    }
  }

  /**
   * Marks the supplied job as `cancelled` (Task #79 — no longer deletes the
   * row, see routes/admin/print-jobs.ts). Asks for confirmation first: a
   * queued Bestellbon that is cancelled here cannot easily be re-issued
   * without re-doing the order.
   *
   * @param j - The row to cancel.
   */
  async function cancelJob(j: JobRow) {
    if (!confirm(`Druckauftrag (${typeLabel(j.type)} – ${j.printer_name}) wirklich abbrechen?`)) return;
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

  /** The job currently targeted by the printer-selection modal, if open. */
  let reprintTarget: JobRow | null = $state(null);
  let reprintModalOpen = $state(false);
  let reprintPrinterId = $state('');
  let reprintBusy = $state(false);

  /**
   * Opens the printer-selection modal for a reprint (Task #105/#108).
   * Preselects the job's original printer if it still exists; otherwise
   * falls back to the system default printer. If there is no printer at
   * all, reprinting isn't possible and the button doesn't even reach here
   * (see `typeAllowsPdfOrReprint`/template below — but guarded here too).
   *
   * @param j - The job to reprint.
   */
  function openReprint(j: JobRow) {
    reprintTarget = j;
    const originalStillExists = j.printer_id !== null && printers.some((p) => p.id === j.printer_id);
    const defaultPrinter = printers.find((p) => p.is_default);
    reprintPrinterId = originalStillExists ? j.printer_id! : (defaultPrinter?.id ?? printers[0]?.id ?? '');
    reprintModalOpen = true;
  }

  /** Confirms the printer-selection modal and enqueues the reprint. */
  async function confirmReprint() {
    if (!reprintTarget || !reprintPrinterId) return;
    reprintBusy = true;
    try {
      await api.admin.printJobs.reprint(reprintTarget.id, reprintPrinterId);
      reprintModalOpen = false;
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally {
      reprintBusy = false;
    }
  }

  /**
   * Whether the PDF-preview and "Erneut drucken" actions should be offered
   * for this row. `pin_slip` is excluded (Nutzerentscheidung 2026-09-01,
   * Sicherheit) — it's the only document type carrying a live credential
   * (the PIN) that exists nowhere else in the system in plaintext. Hiding
   * the button here is only a UX nicety; the actual enforcement is
   * server-side (`routes/admin/print-jobs.ts` returns 403 for both actions
   * on a `pin_slip` job even if called directly).
   *
   * @param t - The job type.
   */
  function typeAllowsPdfOrReprint(t: string): boolean {
    return t !== 'pin_slip';
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
    if (t === 'pin_slip') return 'PIN-Beleg';
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
    if (s === 'cancelled') return 'Abgebrochen';
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
    <div class="header-actions">
      <button class="btn-ghost danger" onclick={cancelAll} disabled={cancellingAll}>
        {cancellingAll ? 'Bricht ab…' : 'Alle abbrechen'}
      </button>
      <button class="btn-ghost" onclick={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
    </div>
  </div>

  <div class="filter-row">
    <label>
      Status
      <select bind:value={statusFilter} onchange={load}>
        <option value="">Aktive Aufträge (Standard)</option>
        <option value="all">Alle (inkl. erledigt)</option>
        <option value="pending">Wartet</option>
        <option value="printing">Druckt</option>
        <option value="failed">Fehlgeschlagen</option>
        <option value="done">Erledigt</option>
        <option value="cancelled">Abgebrochen</option>
      </select>
    </label>
    <p class="hint">
      Automatische Aktualisierung alle 5&nbsp;Sekunden.
      {#if statusFilter === 'all' || statusFilter === 'done' || statusFilter === 'cancelled'}<br/>Anzeige auf die 500 neuesten Aufträge begrenzt.{/if}
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
              {#if typeAllowsPdfOrReprint(j.type)}
                <a class="btn-ghost" href={api.admin.printJobs.pdfUrl(j.id)} target="_blank" rel="noopener">PDF</a>
                <button class="btn-ghost" onclick={() => openReprint(j)} disabled={printers.length === 0}>Erneut drucken</button>
              {/if}
              {#if j.status === 'failed'}
                <button class="btn-ghost" onclick={() => retryJob(j)}>Wiederholen</button>
              {/if}
              {#if j.status !== 'done' && j.status !== 'cancelled'}
                <button class="btn-ghost danger" onclick={() => cancelJob(j)} disabled={j.status === 'printing'}>
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

<Modal bind:open={reprintModalOpen} title="Erneut drucken">
  {#if reprintTarget}
    <p class="hint">
      {typeLabel(reprintTarget.type)} — ursprünglich: {reprintTarget.printer_name}
    </p>
    <div class="field">
      <label for="reprint-printer">Drucker</label>
      <select id="reprint-printer" bind:value={reprintPrinterId} disabled={reprintBusy}>
        {#each printers as p}
          <option value={p.id}>{p.name}{p.is_default ? ' (Standard)' : ''}</option>
        {/each}
      </select>
    </div>
    <div class="modal-actions">
      <div class="spacer"></div>
      <button type="button" class="btn-ghost" onclick={() => (reprintModalOpen = false)} disabled={reprintBusy}>Abbrechen</button>
      <button type="button" class="btn-primary" onclick={confirmReprint} disabled={reprintBusy || !reprintPrinterId}>
        {reprintBusy ? 'Sende…' : 'Drucken'}
      </button>
    </div>
  {/if}
</Modal>

<style>
  .header-actions { display: flex; gap: 0.5rem; }
  .spacer { flex: 1; }
  .filter-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; }
  .filter-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .filter-row select { padding: 0.4rem 0.6rem; min-width: 220px; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
  table { width: 100%; font-size: 0.9rem; }
  .status-pending  { color: #c87a00; font-weight: 600; }
  .status-printing { color: var(--color-primary); font-weight: 600; }
  .status-failed   { color: var(--color-danger); font-weight: 600; }
  .status-done     { color: #4caf7d; font-weight: 600; }
  .status-cancelled { color: var(--color-text-muted); font-weight: 600; }
  .err-cell { color: var(--color-danger); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }
  tr.row-failed { background: rgba(255, 79, 79, 0.04); }
  .actions { display: flex; gap: 0.4rem; }
</style>
