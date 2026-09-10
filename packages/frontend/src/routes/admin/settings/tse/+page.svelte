<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type TseStatus, type TseMountCandidate } from '$lib/api';
  import { copyToClipboard } from '$lib/clipboard';
  import Modal from '$lib/components/Modal.svelte';

  /** Admin-PUK: exactly 6 digits (Task #131 — see docs/TSE-CLI-Referenz.md). */
  function isValidPuk(value: string): boolean {
    return /^[0-9]{6}$/.test(value);
  }
  /** Admin-/TimeAdmin-PIN: exactly 5 digits. */
  function isValidPin(value: string): boolean {
    return /^[0-9]{5}$/.test(value);
  }

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

  // ── TSE-Tools (Task #131) — automatische Zeit-Synchronisation ──────────────
  let autoMaintainSaving = $state(false);
  let autoMaintainError = $state('');

  /** Immediately persists the checkbox — a live operational toggle, not part of the "TSE-Verbindung" Speichern-Formular. */
  async function toggleAutoMaintain(enabled: boolean): Promise<void> {
    autoMaintainSaving = true; autoMaintainError = '';
    try {
      await api.admin.settings.save({ tse_auto_maintain_enabled: String(enabled) });
      settings['tse_auto_maintain_enabled'] = String(enabled);
    } catch (e) {
      autoMaintainError = e instanceof Error ? e.message : 'Fehler';
    } finally { autoMaintainSaving = false; }
  }

  // ── TSE-Tools — TSE testen (Task #131: jetzt als Dialog) ────────────────────
  let testOpen = $state(false);

  async function openTest(): Promise<void> {
    testOpen = true;
    await testTse();
  }

  // ── TSE-Tools — Zeit synchronisieren ─────────────────────────────────────────
  let maintainOpen = $state(false);

  function openMaintain(): void {
    maintainError = ''; maintainSuccess = false;
    maintainOpen = true;
  }

  // ── TSE-Tools — TSE initialisieren (Task #131) ──────────────────────────────
  let setupOpen = $state(false);
  let setupCredentialSeed = $state('SwissbitSwissbit');
  let setupAdminPuk = $state('');
  let setupAdminPukConfirm = $state('');
  let setupAdminPin = $state('');
  let setupAdminPinConfirm = $state('');
  let setupTimeAdminPin = $state('');
  let setupTimeAdminPinConfirm = $state('');
  let setupBusy = $state(false);
  let setupError = $state('');
  let setupSuccess = $state(false);

  /**
   * Same rules the backend enforces (Task #131) — checked here too so a
   * typo (like the 5-digit PUK that triggered this whole feature) is caught
   * before the request even goes out, not just after a round trip.
   */
  let setupValid = $derived(
    setupCredentialSeed.trim().length > 0 &&
    isValidPuk(setupAdminPuk) && setupAdminPuk === setupAdminPukConfirm &&
    isValidPin(setupAdminPin) && setupAdminPin === setupAdminPinConfirm &&
    isValidPin(setupTimeAdminPin) && setupTimeAdminPin === setupTimeAdminPinConfirm,
  );

  function openSetup(): void {
    setupCredentialSeed = 'SwissbitSwissbit';
    setupAdminPuk = ''; setupAdminPukConfirm = '';
    setupAdminPin = ''; setupAdminPinConfirm = '';
    setupTimeAdminPin = ''; setupTimeAdminPinConfirm = '';
    setupError = ''; setupSuccess = false;
    setupOpen = true;
  }

  async function submitSetup(): Promise<void> {
    if (!setupValid) return;
    setupBusy = true; setupError = ''; setupSuccess = false;
    try {
      await api.admin.tse.setup({
        credentialSeed: setupCredentialSeed,
        adminPuk: setupAdminPuk, adminPin: setupAdminPin, timeAdminPin: setupTimeAdminPin,
      });
      setupSuccess = true;
    } catch (e) {
      setupError = e instanceof Error ? e.message : 'Fehler';
    } finally { setupBusy = false; }
  }

  // ── TSE-Tools — Admin-/TimeAdmin-PIN entsperren (Task #109/#131) ────────────
  let unblockOpen = $state(false);
  let unblockUser: 'admin' | 'timeAdmin' = $state('admin');
  let unblockPuk = $state('');
  let unblockPukConfirm = $state('');
  let unblockNewPin = $state('');
  let unblockNewPinConfirm = $state('');
  let unblockBusy = $state(false);
  let unblockError = $state('');
  let unblockSuccess = $state(false);
  let unblockRemainingRetries: number | null = $state(null);

  let unblockValid = $derived(
    isValidPuk(unblockPuk) && unblockPuk === unblockPukConfirm &&
    isValidPin(unblockNewPin) && unblockNewPin === unblockNewPinConfirm,
  );

  function openUnblock(user: 'admin' | 'timeAdmin'): void {
    unblockUser = user;
    unblockPuk = ''; unblockPukConfirm = '';
    unblockNewPin = ''; unblockNewPinConfirm = '';
    unblockError = ''; unblockSuccess = false; unblockRemainingRetries = null;
    unblockOpen = true;
  }

  async function submitUnblock(): Promise<void> {
    if (!unblockValid) return;
    unblockBusy = true; unblockError = ''; unblockSuccess = false; unblockRemainingRetries = null;
    try {
      await api.admin.tse.unblock({ user: unblockUser, puk: unblockPuk, newPin: unblockNewPin });
      unblockSuccess = true;
    } catch (e) {
      unblockError = e instanceof Error ? e.message : 'Fehler';
      const retries = (e as { remainingRetries?: unknown })?.remainingRetries;
      if (typeof retries === 'number') unblockRemainingRetries = retries;
    } finally { unblockBusy = false; }
  }

  // ── TSE-Tools — TSE auf Werkseinstellung zurücksetzen (Task #131) ───────────
  const FACTORY_RESET_CONFIRM_PHRASE = 'ZURÜCKSETZEN';
  let factoryResetOpen = $state(false);
  let factoryResetConfirmText = $state('');
  let factoryResetBusy = $state(false);
  let factoryResetError = $state('');
  let factoryResetSuccess = $state(false);

  function openFactoryReset(): void {
    factoryResetConfirmText = ''; factoryResetError = ''; factoryResetSuccess = false;
    factoryResetOpen = true;
  }

  async function submitFactoryReset(): Promise<void> {
    if (factoryResetConfirmText !== FACTORY_RESET_CONFIRM_PHRASE) return;
    factoryResetBusy = true; factoryResetError = ''; factoryResetSuccess = false;
    try {
      await api.admin.tse.factoryReset();
      factoryResetSuccess = true;
    } catch (e) {
      factoryResetError = e instanceof Error ? e.message : 'Fehler';
    } finally { factoryResetBusy = false; }
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

  <!-- TSE-Tools (Task #131) ─────────────────────────────────────────────────── -->
  <section class="card">
    <h2>TSE-Tools</h2>
    <p class="hint">
      Verwaltungsfunktionen für die oben konfigurierte TSE — jedes Werkzeug
      öffnet sich in einem eigenen Dialog. Ersetzt die bisher rein manuelle
      Kommandozeilen-Bedienung, die keine Eingabeprüfung kennt (siehe Task
      #131 in <code>BACKLOG.md</code>).
    </p>
    <div class="tool-grid">
      <button class="btn-ghost" onclick={openTest}>TSE testen</button>
      <button class="btn-ghost" onclick={openMaintain}>Zeit synchronisieren</button>
      <button class="btn-ghost" onclick={openSetup}>TSE initialisieren</button>
      <button class="btn-ghost" onclick={() => openUnblock('admin')}>Admin-PIN entsperren</button>
      <button class="btn-ghost" onclick={() => openUnblock('timeAdmin')}>TimeAdmin-PIN entsperren</button>
      <button class="btn-ghost tool-danger" onclick={openFactoryReset}>Werkseinstellung (Entwickler-TSE)</button>
      <a class="btn-ghost" href={api.admin.tse.exportDownloadUrl()}>TSE-Rohdaten exportieren</a>
      <a class="btn-ghost" href={api.admin.tse.dumpProcessDataDownloadUrl()}>Process-Data-Dump</a>
    </div>
  </section>
</div>

<!-- TSE testen ──────────────────────────────────────────────────────────────── -->
<Modal bind:open={testOpen} title="TSE testen">
  {#if tseTesting}
    <p class="muted">Teste…</p>
  {:else if tseTestError}
    <p class="error-text">{tseTestError}</p>
  {:else if tseResult}
    {#if !tseResult.configured}
      <p class="muted">TSE ist nicht konfiguriert — Mount-Pfad und Client-ID oben eintragen und speichern.</p>
    {:else if tseResult.error}
      <p class="error-text">TSE-Fehler: {tseResult.error}</p>
    {:else if tseResult.info}
      <dl class="kv">
        <dt>Benötigt Setup</dt><dd>{tseResult.info.needsSetup ? 'Ja' : 'Nein'}</dd>
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
  <div class="dialog-footer">
    <button class="btn-ghost" onclick={testTse} disabled={tseTesting}>{tseTesting ? 'Teste…' : 'Erneut testen'}</button>
  </div>
</Modal>

<!-- Zeit synchronisieren + automatische Zeit-Synchronisation (Task #109/#131) -->
<Modal bind:open={maintainOpen} title="Zeit synchronisieren">
  <p class="hint">
    Führt Self-Test + Zeitsynchronisation einmalig aus — nötig nach einer
    frischen TSE-Einrichtung, bevor der Hintergrund-Health-Check die erste
    reguläre Prüfung durchführt.
  </p>
  <button class="btn-ghost" onclick={runMaintain} disabled={maintaining}>
    {maintaining ? 'Synchronisiere…' : 'Jetzt ausführen'}
  </button>
  {#if maintainError}<p class="error-text">{maintainError}</p>{/if}
  {#if maintainSuccess}<p class="success-text">Self-Test + Zeitsync erfolgreich.</p>{/if}

  <hr class="dialog-divider" />

  <label class="checkbox-row">
    <input
      type="checkbox"
      checked={settings['tse_auto_maintain_enabled'] !== 'false'}
      disabled={autoMaintainSaving}
      onchange={(e) => toggleAutoMaintain(e.currentTarget.checked)}
    />
    Automatische Zeit-Synchronisation aktiv
  </label>
  <p class="hint">
    Deaktiviert sich automatisch, wenn die TSE eine falsche oder gesperrte
    TimeAdmin-PIN meldet, und muss dann hier wieder manuell aktiviert werden
    (nachdem die PIN geprüft/entsperrt wurde) — verhindert, dass der
    Hintergrund-Health-Check dieselbe falsche PIN minütlich wiederholt und
    sie so dauerhaft sperrt.
  </p>
  {#if autoMaintainError}<p class="error-text">{autoMaintainError}</p>{/if}
</Modal>

<!-- TSE initialisieren (Task #131) ───────────────────────────────────────────── -->
<Modal bind:open={setupOpen} title="TSE initialisieren">
  <p class="hint">
    Einmalige Erstinbetriebnahme einer fabrikneuen TSE. Verwendet den oben
    gespeicherten Mount-Pfad und die Client-ID. Diese Werte werden nie
    dauerhaft gespeichert — nur für diesen einen Aufruf verwendet.
  </p>
  <p class="warning-text">
    ⚠️ Ein falscher CredentialSeed kann die TSE nach drei Fehlversuchen
    <strong>unwiderruflich sperren</strong>. Im Zweifel beim TSE-Händler
    verifizieren, nicht raten (siehe Task #129).
  </p>

  <div class="field">
    <label for="setup-seed">CredentialSeed</label>
    <input id="setup-seed" bind:value={setupCredentialSeed} disabled={setupBusy} />
  </div>
  <div class="field">
    <label for="setup-puk">Admin-PUK (6-stellig, nur Ziffern)</label>
    <input id="setup-puk" type="password" autocomplete="off" inputmode="numeric" maxlength="6" bind:value={setupAdminPuk} disabled={setupBusy} />
  </div>
  <div class="field">
    <label for="setup-puk-confirm">Admin-PUK bestätigen</label>
    <input id="setup-puk-confirm" type="password" autocomplete="off" inputmode="numeric" maxlength="6" bind:value={setupAdminPukConfirm} disabled={setupBusy} />
  </div>
  <div class="field">
    <label for="setup-pin">Admin-PIN (5-stellig, nur Ziffern)</label>
    <input id="setup-pin" type="password" autocomplete="off" inputmode="numeric" maxlength="5" bind:value={setupAdminPin} disabled={setupBusy} />
  </div>
  <div class="field">
    <label for="setup-pin-confirm">Admin-PIN bestätigen</label>
    <input id="setup-pin-confirm" type="password" autocomplete="off" inputmode="numeric" maxlength="5" bind:value={setupAdminPinConfirm} disabled={setupBusy} />
  </div>
  <div class="field">
    <label for="setup-time-pin">TimeAdmin-PIN (5-stellig, nur Ziffern)</label>
    <input id="setup-time-pin" type="password" autocomplete="off" inputmode="numeric" maxlength="5" bind:value={setupTimeAdminPin} disabled={setupBusy} />
  </div>
  <div class="field">
    <label for="setup-time-pin-confirm">TimeAdmin-PIN bestätigen</label>
    <input id="setup-time-pin-confirm" type="password" autocomplete="off" inputmode="numeric" maxlength="5" bind:value={setupTimeAdminPinConfirm} disabled={setupBusy} />
  </div>

  {#if setupError}<p class="error-text">{setupError}</p>{/if}
  {#if setupSuccess}<p class="success-text">TSE erfolgreich initialisiert.</p>{/if}

  <div class="dialog-footer">
    <button class="btn-primary" onclick={submitSetup} disabled={!setupValid || setupBusy}>
      {setupBusy ? 'Initialisiere…' : 'TSE initialisieren'}
    </button>
  </div>
</Modal>

<!-- Admin-/TimeAdmin-PIN entsperren (Task #109/#131) ──────────────────────────── -->
<Modal bind:open={unblockOpen} title={unblockUser === 'admin' ? 'Admin-PIN entsperren' : 'TimeAdmin-PIN entsperren'}>
  <p class="hint">
    Setzt eine gesperrte {unblockUser === 'admin' ? 'Admin' : 'TimeAdmin'}-PIN
    zurück. Braucht die aktuelle PUK — auf Firmware &lt; 2.0.0 immer die
    Admin-PUK (auch für TimeAdmin), auf Firmware ≥ 2.0.0 ist die
    TimeAdmin-PUK ohnehin identisch zur Admin-PUK.
  </p>

  <div class="field">
    <label for="unblock-puk">Aktuelle PUK (6-stellig, nur Ziffern)</label>
    <input id="unblock-puk" type="password" autocomplete="off" inputmode="numeric" maxlength="6" bind:value={unblockPuk} disabled={unblockBusy} />
  </div>
  <div class="field">
    <label for="unblock-puk-confirm">PUK bestätigen</label>
    <input id="unblock-puk-confirm" type="password" autocomplete="off" inputmode="numeric" maxlength="6" bind:value={unblockPukConfirm} disabled={unblockBusy} />
  </div>
  <div class="field">
    <label for="unblock-new-pin">Neue PIN (5-stellig, nur Ziffern)</label>
    <input id="unblock-new-pin" type="password" autocomplete="off" inputmode="numeric" maxlength="5" bind:value={unblockNewPin} disabled={unblockBusy} />
  </div>
  <div class="field">
    <label for="unblock-new-pin-confirm">Neue PIN bestätigen</label>
    <input id="unblock-new-pin-confirm" type="password" autocomplete="off" inputmode="numeric" maxlength="5" bind:value={unblockNewPinConfirm} disabled={unblockBusy} />
  </div>

  {#if unblockError}
    <p class="error-text">
      {unblockError}
      {#if unblockRemainingRetries !== null}
        — noch {unblockRemainingRetries} Versuch{unblockRemainingRetries === 1 ? '' : 'e'}, bevor die PUK selbst gesperrt wird.
      {/if}
    </p>
  {/if}
  {#if unblockSuccess}<p class="success-text">PIN erfolgreich entsperrt.</p>{/if}

  <div class="dialog-footer">
    <button class="btn-primary" onclick={submitUnblock} disabled={!unblockValid || unblockBusy}>
      {unblockBusy ? 'Entsperre…' : 'Entsperren'}
    </button>
  </div>
</Modal>

<!-- TSE auf Werkseinstellung zurücksetzen (Task #131) ─────────────────────────── -->
<Modal bind:open={factoryResetOpen} title="TSE auf Werkseinstellung zurücksetzen">
  <p class="warning-text">
    ⚠️ Setzt PUK/alle PINs zurück, entfernt die Client-Registrierung und
    leert den TSE-Speicher — <strong>unwiderruflich</strong>. Funktioniert
    nur auf einer Entwickler-TSE; auf echter Produktiv-Hardware schlägt der
    Aufruf durch die TSE selbst folgenlos fehl.
  </p>
  <div class="field">
    <label for="factory-reset-confirm">Zum Bestätigen "{FACTORY_RESET_CONFIRM_PHRASE}" eingeben</label>
    <input id="factory-reset-confirm" bind:value={factoryResetConfirmText} disabled={factoryResetBusy} />
  </div>

  {#if factoryResetError}<p class="error-text">{factoryResetError}</p>{/if}
  {#if factoryResetSuccess}<p class="success-text">TSE auf Werkseinstellung zurückgesetzt.</p>{/if}

  <div class="dialog-footer">
    <button class="btn-primary tool-danger" onclick={submitFactoryReset} disabled={factoryResetConfirmText !== FACTORY_RESET_CONFIRM_PHRASE || factoryResetBusy}>
      {factoryResetBusy ? 'Setze zurück…' : 'Zurücksetzen'}
    </button>
  </div>
</Modal>

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

  /* TSE-Tools (Task #131) */
  .tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem; }
  .tool-grid a.btn-ghost { text-align: center; text-decoration: none; }
  .tool-danger { color: #d9534f; border-color: #d9534f; }
  .dialog-footer { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
  .dialog-divider { border: none; border-top: 1px solid var(--color-border); margin: 1rem 0; }
  .checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer; }
  .warning-text {
    font-size: 0.85rem; color: #d9534f; background: rgba(217, 83, 79, 0.08);
    border: 1px solid rgba(217, 83, 79, 0.3); border-radius: var(--radius-sm); padding: 0.6rem 0.75rem;
  }
</style>
