<script lang="ts">
  /**
   * Manually-triggered system health checks (Task #87) — deliberately not
   * auto-run on page load, matching "manuell auslösbar" from the task and
   * the existing "TSE testen" button pattern. New checks need no UI
   * changes here — the backend's registry (`system/healthChecks.ts`)
   * is the single place a new check gets added.
   */
  import { api } from '$lib/api';

  type CheckResult = { id: string; name: string; status: 'ok' | 'warning' | 'error'; message: string };

  let checks: CheckResult[] | null = $state(null);
  let running = $state(false);
  let error = $state('');

  async function run() {
    running = true; error = '';
    try {
      checks = (await api.admin.healthChecks.run()).checks;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      running = false;
    }
  }

  const statusLabel = (s: CheckResult['status']) => s === 'ok' ? '✓ OK' : s === 'warning' ? '⚠ Warnung' : '✗ Fehler';
</script>

<div class="page">
  <div class="page-header">
    <h1>Health-Check</h1>
    <button class="btn-primary" onclick={run} disabled={running}>
      {running ? 'Prüfe…' : 'Jetzt prüfen'}
    </button>
  </div>

  <p class="hint">Läuft ausschließlich auf Klick, kein automatischer Hintergrund-Job.</p>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if checks === null}
    <p class="muted">Noch nicht geprüft.</p>
  {:else}
    <div class="checks">
      {#each checks as c}
        <div class="check-row" class:warn={c.status === 'warning'} class:err={c.status === 'error'}>
          <div class="check-name">{c.name}</div>
          <div class="check-status">{statusLabel(c.status)}</div>
          <div class="check-message">{c.message}</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
  .page-header h1 { font-size: 1.25rem; margin: 0; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 1.25rem 0; }

  .checks { display: flex; flex-direction: column; gap: 0.75rem; max-width: 640px; }
  .check-row {
    display: grid; grid-template-columns: minmax(160px, auto) auto; gap: 0.2rem 1rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 0.9rem 1.1rem;
  }
  .check-row.warn { border-color: #f59e0b88; background: #f59e0b11; }
  .check-row.err { border-color: var(--color-danger); background: rgba(255, 79, 79, 0.08); }
  .check-name { font-weight: 600; font-size: 0.9rem; }
  .check-status { font-size: 0.9rem; font-weight: 600; text-align: right; }
  .check-message { grid-column: 1 / -1; font-size: 0.8rem; color: var(--color-text-muted); }
</style>
