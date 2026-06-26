<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';

  // ── Read-only system status ────────────────────────────────────────────────
  let systemSerial = '';
  let timezone = '';
  let serverTime: Date | null = null;
  let statusLoading = true;
  let statusError = '';
  let tick = 0; // re-renders the clock every second by changing a reactive dependency

  // ── Editable settings (server_address, backup_directory) ──────────────────
  let settings: Record<string, string> = {};
  let editableLoading = true;
  let saving = false;
  let saveError = '';
  let saveSuccess = false;

  let clockTimer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    await Promise.all([loadStatus(), loadSettings()]);
    clockTimer = setInterval(() => { tick++; }, 1000);
  });

  onDestroy(() => { if (clockTimer) clearInterval(clockTimer); });

  async function loadStatus() {
    statusLoading = true; statusError = '';
    try {
      const status = await api.admin.system.status();
      systemSerial = status.system_serial;
      timezone = status.timezone;
      serverTime = new Date(status.server_time);
    } catch (e) {
      statusError = e instanceof Error ? e.message : 'Fehler';
    } finally { statusLoading = false; }
  }

  async function loadSettings() {
    editableLoading = true;
    try {
      settings = await api.admin.settings.get();
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally { editableLoading = false; }
  }

  async function save() {
    saveError = ''; saveSuccess = false; saving = true;
    try {
      await api.admin.settings.save({
        server_address: settings['server_address'] ?? '',
        backup_directory: settings['backup_directory'] ?? '',
      });
      saveSuccess = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  /** Returns the current wall-clock time, advanced from the server baseline by the elapsed `tick` seconds. */
  $: liveTime = serverTime ? new Date(serverTime.getTime() + tick * 1000) : null;
  // ESLint doesn't see `tick` as used in the expression above without referencing it; that's the point.

  function copySerial() {
    if (!systemSerial) return;
    navigator.clipboard?.writeText(systemSerial).catch(() => { /* ignore — clipboard API may be unavailable */ });
  }
</script>

<div class="page">
  <div class="page-header"><h1>System</h1></div>

  {#if statusError}<p class="error-text">{statusError}</p>{/if}

  <!-- Cash-register-system serial ──────────────────────────────────────────── -->
  <section class="card">
    <h2>Kassensystem-Seriennummer</h2>
    <p class="hint">Wird beim ersten Serverstart automatisch erzeugt. Wird auf jedem Kassenbon und für die ELSTER-Kassenmeldung benötigt.</p>
    {#if statusLoading}
      <p class="muted">Lade…</p>
    {:else}
      <div class="serial-row">
        <code class="serial">{systemSerial}</code>
        <button class="btn-ghost" on:click={copySerial} title="In Zwischenablage kopieren">Kopieren</button>
      </div>
    {/if}
  </section>

  <!-- Timezone & server time ─────────────────────────────────────────────────── -->
  <section class="card">
    <h2>Zeitzone &amp; Serverzeit</h2>
    <p class="hint">Wird vom Betriebssystem des Servers übernommen. Änderung erfolgt in der Docker-/Linux-Konfiguration, nicht in der Anwendung.</p>
    {#if statusLoading}
      <p class="muted">Lade…</p>
    {:else}
      <dl class="kv">
        <dt>Zeitzone</dt><dd><code>{timezone}</code></dd>
        <dt>Aktuelle Uhrzeit</dt><dd>{liveTime ? liveTime.toLocaleString('de-DE') : '—'}</dd>
      </dl>
    {/if}
  </section>

  <!-- Server address (editable) ──────────────────────────────────────────────── -->
  <section class="card">
    <h2>Server-Adresse (QR-Code)</h2>
    <p class="hint">Lokale Netzwerkadresse des Servers. Wird in den QR-Code des Kassenbons eingebettet — Kunden im selben WLAN scannen und sehen ihren Bon als PDF.</p>
    {#if editableLoading}
      <p class="muted">Lade…</p>
    {:else}
      <div class="field">
        <input
          value={settings['server_address'] ?? ''}
          on:input={(e) => { settings['server_address'] = e.currentTarget.value; saveSuccess = false; }}
          placeholder="z. B. 192.168.1.10 oder fairpos.local"
          disabled={saving}
        />
      </div>
    {/if}
  </section>

  <!-- Backup directory (editable) ───────────────────────────────────────────── -->
  <section class="card">
    <h2>Backup-Verzeichnis</h2>
    <p class="hint">Zielverzeichnis für automatische tägliche Datenbank-Backups. Das Backup muss vom Container aus erreichbar sein (z. B. eingehängte USB-Festplatte oder NAS-Pfad).</p>
    {#if editableLoading}
      <p class="muted">Lade…</p>
    {:else}
      <div class="field">
        <input
          value={settings['backup_directory'] ?? ''}
          on:input={(e) => { settings['backup_directory'] = e.currentTarget.value; saveSuccess = false; }}
          placeholder="z. B. /mnt/backup/fairpos"
          disabled={saving}
        />
      </div>
    {/if}
  </section>

  <!-- TSE status placeholder ────────────────────────────────────────────────── -->
  <section class="card">
    <h2>TSE-Status</h2>
    <p class="muted">Die Anbindung an die fiskaltrust-Middleware und die Swissbit USB-TSE ist noch nicht implementiert. Wird im Rahmen einer eigenen Aufgabe ergänzt.</p>
  </section>

  {#if saveError}<p class="error-text">{saveError}</p>{/if}
  {#if saveSuccess}<p class="success-text">Gespeichert.</p>{/if}

  <div class="form-footer">
    <button class="btn-primary" on:click={save} disabled={saving || editableLoading}>
      {saving ? 'Speichern…' : 'Speichern'}
    </button>
  </div>
</div>

<style>
  .card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.25rem;
    max-width: 640px;
  }
  .card h2 {
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); margin: 0 0 0.5rem 0;
  }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }

  .serial-row { display: flex; align-items: center; gap: 0.75rem; }
  .serial {
    font-size: 1rem; font-weight: 600; padding: 0.4rem 0.75rem;
    background: var(--color-bg); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); user-select: all;
  }

  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1.25rem; margin: 0; font-size: 0.9rem; }
  .kv dt { color: var(--color-text-muted); }
  .kv dd { margin: 0; }
  .kv code { font-size: 0.9rem; }

  .field input { width: 100%; max-width: 360px; }
  .success-text { color: #4caf7d; font-size: 0.875rem; }
  .form-footer { max-width: 640px; padding-top: 0.5rem; }
</style>
