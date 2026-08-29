<script lang="ts">
  /**
   * "Aktive Sessions" (Task #90) — every currently logged-in session
   * (Kassenauswahl or Systemverwaltung, admin or not), with the option to
   * forcibly end one. Replaces the old QR-token model, which had no
   * comparable concept of an ongoing session to list or revoke.
   */
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';

  type SessionRow = {
    id: string; user_name: string; is_admin: boolean; admin_verified: boolean;
    created_at: string; last_activity_at: string; user_agent: string | null;
  };

  let sessions: SessionRow[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let terminatingId: string | null = $state(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    load();
    refreshTimer = setInterval(load, 30_000);
  });

  onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });

  async function load() {
    try {
      sessions = await api.admin.sessions.list();
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  async function terminate(s: SessionRow) {
    if (!confirm(`Sitzung von „${s.user_name}" wirklich beenden? Das Gerät wird beim nächsten Zugriff abgemeldet.`)) return;
    terminatingId = s.id;
    try {
      await api.admin.sessions.terminate(s.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally {
      terminatingId = null;
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
</script>

<div class="page">
  <div class="page-header">
    <h1>Aktive Sessions</h1>
    <button class="btn-ghost" onclick={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
  </div>

  <p class="hint">Automatische Aktualisierung alle 30&nbsp;Sekunden. Läuft nach 4 Stunden Inaktivität automatisch ab.</p>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if !loading && sessions.length === 0}
    <p class="muted">Keine aktiven Sessions.</p>
  {:else if !loading}
    <table>
      <thead>
        <tr>
          <th>Benutzer</th>
          <th>Rolle</th>
          <th>Angemeldet seit</th>
          <th>Letzte Aktivität</th>
          <th>Gerät</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each sessions as s}
          <tr>
            <td>{s.user_name}</td>
            <td>
              {s.is_admin ? 'Administrator' : 'Bediener'}
              {#if s.is_admin}
                <span class="verified-badge" class:on={s.admin_verified}>
                  {s.admin_verified ? 'Systemverwaltung freigeschaltet' : 'nur Kasse'}
                </span>
              {/if}
            </td>
            <td>{timeLabel(s.created_at)}</td>
            <td>{timeLabel(s.last_activity_at)}</td>
            <td class="agent">{s.user_agent ?? '—'}</td>
            <td class="actions">
              <button class="btn-ghost danger" onclick={() => terminate(s)} disabled={terminatingId === s.id}>
                {terminatingId === s.id ? 'Beende…' : 'Beenden'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 1rem 0; }
  table { width: 100%; font-size: 0.9rem; }
  .agent { font-size: 0.8rem; color: var(--color-text-muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .verified-badge {
    display: inline-block; margin-left: 0.4rem; font-size: 0.7rem; font-weight: 600;
    padding: 0.1rem 0.4rem; border-radius: 999px;
    color: var(--color-text-muted); background: var(--color-surface-2); border: 1px solid var(--color-border);
  }
  .verified-badge.on { color: #4caf7d; background: rgba(76, 175, 125, 0.1); border-color: rgba(76, 175, 125, 0.3); }
</style>
