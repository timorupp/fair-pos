<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type TseStatus, type TseMountCandidate } from '$lib/api';
  import { copyToClipboard } from '$lib/clipboard';

  let settings: Record<string, string> = $state({});
  let editableLoading = $state(true);
  let saving = $state(false);
  let saveError = $state('');
  let saveSuccess = $state(false);

  // ── TSE connection test ────────────────────────────────────────────────────
  let tseTesting = $state(false);
  let tseResult: TseStatus | null = $state(null);
  let tseTestError = $state('');

  // ── Manual self-test + time sync (Task #58/#64) ─────────────────────────────
  let maintaining = $state(false);
  let maintainError = $state('');
  let maintainSuccess = $state(false);

  // ── TSE mount-point candidates (dropdown + Auto-erkennen) ──────────────────
  let tseCandidates: TseMountCandidate[] = $state([]);
  let candidatesLoading = $state(false);
  let candidatesError = $state('');
  let detecting = $state(false);
  let detectMessage = $state('');

  onMount(async () => {
    await Promise.all([loadSettings(), loadCandidates()]);
  });

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
        tse_mount_point: settings['tse_mount_point'] ?? '',
        tse_client_id: settings['tse_client_id'] ?? '',
        tse_time_admin_pin: settings['tse_time_admin_pin'] ?? '',
      });
      saveSuccess = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  /**
   * Calls into the TSE hardware to confirm the configured connection actually works.
   * Also clears a stale result from `runMaintain()` — the two actions share one TSE
   * connection, so a leftover error from the other button reads as still-current otherwise.
   */
  async function testTse() {
    tseTesting = true; tseTestError = ''; tseResult = null;
    maintainError = ''; maintainSuccess = false;
    try {
      tseResult = await api.admin.tse.status();
    } catch (e) {
      tseTestError = e instanceof Error ? e.message : 'Fehler';
    } finally { tseTesting = false; }
  }

  /**
   * Runs self-test + time sync on the TSE — needed once after a fresh setup, since nothing calls this automatically yet.
   * Also clears a stale result from `testTse()`, for the same reason as above.
   */
  async function runMaintain() {
    maintaining = true; maintainError = ''; maintainSuccess = false;
    tseTestError = ''; tseResult = null;
    try {
      await api.admin.tse.maintain();
      maintainSuccess = true;
    } catch (e) {
      maintainError = e instanceof Error ? e.message : 'Fehler';
    } finally { maintaining = false; }
  }

  /** Lists currently-mounted removable filesystems for the dropdown — a cheap local `lsblk` call, not a TSE hardware access, so safe to run automatically. */
  async function loadCandidates() {
    candidatesLoading = true; candidatesError = '';
    try {
      const result = await api.admin.tse.candidates();
      tseCandidates = result.candidates;
    } catch (e) {
      candidatesError = e instanceof Error ? e.message : 'Fehler';
    } finally { candidatesLoading = false; }
  }

  /**
   * "Auto-erkennen" — probes every removable mount point via the TSE
   * hardware itself (worm_init validates whether it's really a TSE) and
   * fills the Mount-Pfad field with the first one found. Doesn't save by
   * itself — the admin still confirms via the usual "Speichern" button,
   * consistent with every other field on this page.
   */
  async function detectTse() {
    detecting = true; detectMessage = '';
    try {
      const result = await api.admin.tse.detect();
      if (result.mountPoint) {
        settings['tse_mount_point'] = result.mountPoint;
        saveSuccess = false;
        detectMessage = `TSE gefunden: ${result.mountPoint}. Bitte unten speichern.`;
      } else if (result.candidatesTried === 0) {
        detectMessage = 'Kein Wechseldatenträger gefunden — ist die TSE eingesteckt?';
      } else {
        detectMessage = `Keine TSE gefunden (${result.candidatesTried} Wechseldatenträger geprüft).`;
      }
    } catch (e) {
      detectMessage = e instanceof Error ? e.message : 'Fehler';
    } finally {
      detecting = false;
      await loadCandidates();
    }
  }

  /** Formats a seconds-until countdown as whole days for readability. */
  function formatDaysFromSeconds(seconds: number): string {
    return `${Math.floor(seconds / 86400)} Tage`;
  }

  function copyTseResult() {
    if (!tseResult) return;
    copyToClipboard(JSON.stringify(tseResult, null, 2));
  }
</script>

<div class="page">
  <div class="page-header"><h1>TSE</h1></div>

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
          oninput={(e) => { settings['tse_mount_point'] = e.currentTarget.value; saveSuccess = false; }}
          placeholder="z. B. /mnt/tse-usb"
          disabled={saving}
        />
        <div class="tse-detect-row">
          <select
            aria-label="Gefundene Wechseldatenträger"
            disabled={candidatesLoading || tseCandidates.length === 0}
            onchange={(e) => {
              if (e.currentTarget.value) { settings['tse_mount_point'] = e.currentTarget.value; saveSuccess = false; }
            }}
          >
            <option value="">
              {#if candidatesLoading}Lade Wechseldatenträger…
              {:else if tseCandidates.length === 0}Keine Wechseldatenträger gefunden
              {:else}Gefundenen Mount-Pfad wählen…{/if}
            </option>
            {#each tseCandidates as candidate}
              <option value={candidate.mountPoint}>{candidate.mountPoint} ({candidate.device})</option>
            {/each}
          </select>
          <button class="btn-ghost" type="button" onclick={detectTse} disabled={detecting}>
            {detecting ? 'Suche…' : 'Auto-erkennen'}
          </button>
        </div>
        {#if candidatesError}<p class="error-text">{candidatesError}</p>{/if}
        {#if detectMessage}<p class="hint detect-message">{detectMessage}</p>{/if}
      </div>
      <div class="field">
        <label for="tse-client-id">Client-ID</label>
        <input
          id="tse-client-id"
          value={settings['tse_client_id'] ?? ''}
          oninput={(e) => { settings['tse_client_id'] = e.currentTarget.value; saveSuccess = false; }}
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
          oninput={(e) => { settings['tse_time_admin_pin'] = e.currentTarget.value; saveSuccess = false; }}
          disabled={saving}
        />
      </div>
    {/if}

    {#if saveError}<p class="error-text">{saveError}</p>{/if}
    {#if saveSuccess}<p class="success-text">Gespeichert.</p>{/if}

    <div class="form-footer">
      <button class="btn-primary" onclick={save} disabled={saving || editableLoading}>
        {saving ? 'Speichern…' : 'Speichern'}
      </button>
    </div>
  </section>

  <!-- TSE connection test ───────────────────────────────────────────────────── -->
  <section class="card">
    <h2>TSE-Status</h2>
    <p class="hint">Prüft die Verbindung zur konfigurierten TSE und zeigt deren aktuelle Statusdaten an.</p>
    <button class="btn-ghost" onclick={testTse} disabled={tseTesting}>
      {tseTesting ? 'Teste…' : 'TSE testen'}
    </button>
    <button class="btn-ghost" onclick={runMaintain} disabled={maintaining}>
      {maintaining ? 'Synchronisiere…' : 'Zeit synchronisieren'}
    </button>

    {#if tseTestError}<p class="error-text">{tseTestError}</p>{/if}
    {#if maintainError}<p class="error-text">{maintainError}</p>{/if}
    {#if maintainSuccess}<p class="success-text">Self-Test + Zeitsync erfolgreich.</p>{/if}

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
          <dt>Signaturalgorithmus</dt><dd><code>{tseResult.info.signatureAlgorithm}</code></dd>
          <dt>Zeitformat</dt><dd><code>{tseResult.info.logTimeFormat}</code></dd>
          <dt>Public Key</dt><dd><code class="pubkey">{tseResult.info.publicKey}</code></dd>
        </dl>

        <details>
          <summary>Rohdaten (JSON)</summary>
          <div class="raw-row">
            <pre class="raw-json">{JSON.stringify(tseResult.info, null, 2)}</pre>
            <button class="btn-ghost" onclick={copyTseResult} title="In Zwischenablage kopieren">Kopieren</button>
          </div>
        </details>
      {/if}
    {/if}
  </section>
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

  .kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 1.25rem; margin: 0; font-size: 0.9rem; }
  .kv dt { color: var(--color-text-muted); }
  .kv dd { margin: 0; min-width: 0; }
  .kv code { font-size: 0.9rem; word-break: break-all; overflow-wrap: anywhere; }
  .kv .pubkey { word-break: break-all; overflow-wrap: anywhere; font-size: 0.75rem; }

  .tse-detect-row { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
  .tse-detect-row select { flex: 1; max-width: 360px; }
  .detect-message { margin: 0.4rem 0 0 0; }

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
