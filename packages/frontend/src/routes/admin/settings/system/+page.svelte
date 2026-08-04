<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type TseStatus } from '$lib/api';

  // ── Read-only system status ────────────────────────────────────────────────
  let systemSerial = '';
  let timezone = '';
  let serverTime: Date | null = null;
  let statusLoading = true;
  let statusError = '';
  let tick = 0; // re-renders the clock every second by changing a reactive dependency

  // ── Editable settings (server_address, backup_directory, TSE connection) ──
  let settings: Record<string, string> = {};
  let editableLoading = true;
  let saving = false;
  let saveError = '';
  let saveSuccess = false;

  // ── TSE connection test ────────────────────────────────────────────────────
  let tseTesting = false;
  let tseResult: TseStatus | null = null;
  let tseTestError = '';

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
        tse_mount_point: settings['tse_mount_point'] ?? '',
        tse_client_id: settings['tse_client_id'] ?? '',
        tse_time_admin_pin: settings['tse_time_admin_pin'] ?? '',
      });
      saveSuccess = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  /** Calls into the TSE hardware to confirm the configured connection actually works. */
  async function testTse() {
    tseTesting = true; tseTestError = ''; tseResult = null;
    try {
      tseResult = await api.admin.tse.status();
    } catch (e) {
      tseTestError = e instanceof Error ? e.message : 'Fehler';
    } finally { tseTesting = false; }
  }

  /** Formats a seconds-until countdown as whole days for readability. */
  function formatDaysFromSeconds(seconds: number): string {
    return `${Math.floor(seconds / 86400)} Tage`;
  }

  function copyTseResult() {
    if (!tseResult) return;
    navigator.clipboard?.writeText(JSON.stringify(tseResult, null, 2)).catch(() => { /* ignore — clipboard API may be unavailable */ });
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

  <!-- TSE connection (editable) ─────────────────────────────────────────────── -->
  <section class="card">
    <h2>TSE-Verbindung</h2>
    <p class="hint">
      Zugangsdaten für die Swissbit USB-TSE. Der Admin-PIN/PUK der TSE wird hier
      bewusst nicht abgefragt — er wird nur bei der einmaligen Erstinbetriebnahme
      benötigt und nicht dauerhaft gespeichert (siehe docs/TSE-Integration.md, Abschnitt 7).
    </p>
    {#if editableLoading}
      <p class="muted">Lade…</p>
    {:else}
      <div class="field">
        <label for="tse-mount-point">Mount-Pfad (USB-Stick)</label>
        <input
          id="tse-mount-point"
          value={settings['tse_mount_point'] ?? ''}
          on:input={(e) => { settings['tse_mount_point'] = e.currentTarget.value; saveSuccess = false; }}
          placeholder="z. B. /mnt/tse-usb"
          disabled={saving}
        />
      </div>
      <div class="field">
        <label for="tse-client-id">Client-ID</label>
        <input
          id="tse-client-id"
          value={settings['tse_client_id'] ?? ''}
          on:input={(e) => { settings['tse_client_id'] = e.currentTarget.value; saveSuccess = false; }}
          placeholder="z. B. FairPOS-1"
          disabled={saving}
        />
      </div>
      <div class="field">
        <label for="tse-time-admin-pin">TimeAdmin-PIN</label>
        <input
          id="tse-time-admin-pin"
          type="password"
          autocomplete="off"
          value={settings['tse_time_admin_pin'] ?? ''}
          on:input={(e) => { settings['tse_time_admin_pin'] = e.currentTarget.value; saveSuccess = false; }}
          disabled={saving}
        />
      </div>
    {/if}
  </section>

  <!-- TSE connection test ───────────────────────────────────────────────────── -->
  <section class="card">
    <h2>TSE-Status</h2>
    <p class="hint">Prüft die Verbindung zur konfigurierten TSE und zeigt deren aktuelle Statusdaten an.</p>
    <button class="btn-ghost" on:click={testTse} disabled={tseTesting}>
      {tseTesting ? 'Teste…' : 'TSE testen'}
    </button>

    {#if tseTestError}<p class="error-text">{tseTestError}</p>{/if}

    {#if tseResult}
      {#if !tseResult.configured}
        <p class="muted">TSE ist nicht konfiguriert — Mount-Pfad und Client-ID oben eintragen und speichern.</p>
      {:else if tseResult.error}
        <p class="error-text">TSE-Fehler: {tseResult.error}</p>
      {:else if tseResult.info}
        <dl class="kv">
          <dt>Self-Test bestanden</dt><dd>{tseResult.info.hasPassedSelfTest ? 'Ja' : 'Nein'}</dd>
          <dt>Uhrzeit synchronisiert</dt><dd>{tseResult.info.hasValidTime ? 'Ja' : 'Nein'}</dd>
          <dt>Seriennummer</dt><dd><code>{tseResult.info.tseSerialNumber}</code></dd>
          <dt>Zertifizierungs-ID</dt><dd><code>{tseResult.info.tseCertificationId}</code></dd>
          <dt>Formfaktor</dt><dd>{tseResult.info.formFactor}</dd>
          <dt>Laufende Transaktionen</dt><dd>{tseResult.info.startedTransactions} / {tseResult.info.maxStartedTransactions}</dd>
          <dt>Verbleibende Signaturen</dt><dd>{tseResult.info.remainingSignatures.toLocaleString('de-DE')} / {tseResult.info.maxSignatures.toLocaleString('de-DE')}</dd>
          <dt>Zertifikat gültig bis</dt><dd>{new Date(tseResult.info.certificateExpirationDate * 1000).toLocaleDateString('de-DE')}</dd>
          <dt>Nächster Self-Test</dt><dd>in {formatDaysFromSeconds(tseResult.info.timeUntilNextSelfTest)}</dd>
          <dt>Nächste Zeitsynchronisation</dt><dd>in {formatDaysFromSeconds(tseResult.info.timeUntilNextTimeSynchronization)}</dd>
        </dl>

        <details>
          <summary>Rohdaten (JSON)</summary>
          <div class="raw-row">
            <pre class="raw-json">{JSON.stringify(tseResult.info, null, 2)}</pre>
            <button class="btn-ghost" on:click={copyTseResult} title="In Zwischenablage kopieren">Kopieren</button>
          </div>
        </details>
      {/if}
    {/if}
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

  .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.9rem; }
  .field:last-child { margin-bottom: 0; }
  .field label { font-size: 0.85rem; color: var(--color-text-muted); }
  .field input { width: 100%; max-width: 360px; }
  .success-text { color: #4caf7d; font-size: 0.875rem; }
  .form-footer { max-width: 640px; padding-top: 0.5rem; }

  .raw-row { display: flex; align-items: flex-start; gap: 0.5rem; margin-top: 0.5rem; }
  .raw-json {
    flex: 1; margin: 0; padding: 0.75rem; font-size: 0.8rem; overflow-x: auto;
    background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  }
  details summary { cursor: pointer; font-size: 0.85rem; color: var(--color-text-muted); margin-top: 0.75rem; }
</style>
