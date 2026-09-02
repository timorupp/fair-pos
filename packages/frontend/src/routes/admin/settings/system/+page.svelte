<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import { copyToClipboard } from '$lib/clipboard';
  import Modal from '$lib/components/Modal.svelte';
  import { adminUser } from '$lib/stores/user';

  // ── Read-only system status ────────────────────────────────────────────────
  let systemSerial = $state('');
  let timezone = $state('');
  let serverTime: Date | null = $state(null);
  let statusLoading = $state(true);
  let statusError = $state('');
  let tick = $state(0); // re-renders the clock every second by changing a reactive dependency

  // ── Editable settings (server_address) ──
  let settings: Record<string, string> = $state({});
  let editableLoading = $state(true);
  let saving = $state(false);
  let saveError = $state('');
  let saveSuccess = $state(false);

  // ── Manual system-time set (Task #60) — the TSE syncs its clock against
  // this server's system time, and the register can run fully offline, so
  // NTP isn't assumed reachable. Requires a sudoers rule on the server, see
  // docs/Installationsanleitung.md. ──
  let setTimeValue = $state('');
  let settingTime = $state(false);
  let setTimeError = $state('');
  let setTimeSuccess = $state(false);

  // ── Manual timezone set (Task #60 follow-up) — full time control via the
  // UI needs both the clock and the timezone. ──
  const availableTimezones = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone').sort((a, b) => a.localeCompare(b))
    : [];
  let setTimezoneValue = $state('');
  let settingTimezone = $state(false);
  let setTimezoneError = $state('');
  let setTimezoneSuccess = $state(false);

  // ── Server-Adresse test preview ── mirrors the normalization rule the
  // backend applies in receipt/qr.ts (buildReceiptQrUrl) — keep both in sync.
  let addressTestOpen = $state(false);
  let addressTestUrl = $derived.by(() => {
    const value = settings['server_address']?.trim();
    if (!value) return '';
    const base = /^https?:\/\//i.test(value) ? value.replace(/\/+$/, '') : `http://${value}`;
    return `${base}/`;
  });

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
      setTimezoneValue = status.timezone;
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
      });
      saveSuccess = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  /** Returns the current wall-clock time, advanced from the server baseline by the elapsed `tick` seconds. */
  let liveTime = $derived.by(() => serverTime ? new Date(serverTime.getTime() + tick * 1000) : null);

  /** Formats a Date as `YYYY-MM-DDTHH:MM:SS` in local time, matching what `<input type="datetime-local" step="1">` needs/produces. */
  function toDatetimeLocal(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  /**
   * Takes over the browser's current time and saves it immediately — a
   * separate "Speichern" click afterwards would let real time drift by
   * however long the admin takes to notice and click it, defeating the
   * point of "use right now" (found live, 2026-08-29).
   */
  async function useBrowserTime() {
    setTimeValue = toDatetimeLocal(new Date());
    await submitSetTime();
  }

  async function submitSetTime() {
    if (!setTimeValue) return;
    setTimeError = ''; setTimeSuccess = false; settingTime = true;
    try {
      await api.admin.system.setTime(setTimeValue);
      setTimeSuccess = true;
      await loadStatus();
    } catch (e) {
      setTimeError = e instanceof Error ? e.message : 'Fehler';
    } finally { settingTime = false; }
  }

  async function submitSetTimezone() {
    if (!setTimezoneValue) return;
    setTimezoneError = ''; setTimezoneSuccess = false; settingTimezone = true;
    try {
      await api.admin.system.setTimezone(setTimezoneValue);
      setTimezoneSuccess = true;
      await loadStatus();
    } catch (e) {
      setTimezoneError = e instanceof Error ? e.message : 'Fehler';
    } finally { settingTimezone = false; }
  }

  function copySerial() {
    if (!systemSerial) return;
    copyToClipboard(systemSerial);
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
        <button class="btn-ghost" onclick={copySerial} title="In Zwischenablage kopieren">Kopieren</button>
      </div>
    {/if}
  </section>

  <!-- Timezone & server time ─────────────────────────────────────────────────── -->
  <section class="card">
    <h2>Zeitzone &amp; Serverzeit</h2>
    <p class="hint">
      Beides ist wichtig für die TSE-Zeitsynchronisation (die TSE gleicht sich gegen
      <em>diese</em> Serverzeit/-zeitzone ab) — da die Kasse auch offline läuft, können
      beide hier manuell gesetzt werden, statt auf NTP zu warten (NTP muss dafür auf dem
      Server deaktiviert sein, siehe Installationsanleitung Abschnitt 13).
    </p>
    {#if statusLoading}
      <p class="muted">Lade…</p>
    {:else}
      <dl class="kv">
        <dt>Aktuelle Uhrzeit</dt><dd>{liveTime ? liveTime.toLocaleString('de-DE') : '—'}</dd>
      </dl>

      <div class="field set-time-field">
        <label for="set-time">Systemzeit setzen</label>
        <div class="set-time-row">
          <input
            id="set-time"
            type="datetime-local"
            step="1"
            bind:value={setTimeValue}
            disabled={settingTime}
          />
          <button class="btn-ghost" type="button" onclick={useBrowserTime} disabled={settingTime}>
            {settingTime ? 'Speichere…' : 'Aktuelle Browserzeit übernehmen'}
          </button>
          <button class="btn-primary" type="button" onclick={submitSetTime} disabled={settingTime || !setTimeValue}>
            {settingTime ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
        {#if setTimeError}<p class="error-text">{setTimeError}</p>{/if}
        {#if setTimeSuccess}<p class="success-text">Systemzeit gesetzt.</p>{/if}
      </div>

      <div class="field set-time-field">
        <label for="set-timezone">Zeitzone setzen</label>
        <div class="set-time-row">
          <select id="set-timezone" bind:value={setTimezoneValue} disabled={settingTimezone}>
            {#each availableTimezones as tz}
              <option value={tz}>{tz}</option>
            {/each}
          </select>
          <button class="btn-primary" type="button" onclick={submitSetTimezone} disabled={settingTimezone || !setTimezoneValue || setTimezoneValue === timezone}>
            {settingTimezone ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
        {#if setTimezoneError}<p class="error-text">{setTimezoneError}</p>{/if}
        {#if setTimezoneSuccess}<p class="success-text">Zeitzone gesetzt.</p>{/if}
      </div>
    {/if}
  </section>

  {#if $adminUser?.is_admin}
    <!-- Server address (editable) ──────────────────────────────────────────────── -->
    <section class="card">
      <h2>Server-Adresse (QR-Code)</h2>
      <p class="hint">
        Lokale Netzwerkadresse des Servers. Wird in den QR-Code des Kassenbons eingebettet —
        Kunden im selben WLAN scannen und sehen ihren Bon als PDF. Am besten mit Protokoll angeben
        (<code>http://</code> oder <code>https://</code>) — welches Protokoll der Server tatsächlich
        spricht, weißt du als Admin am besten. Ohne Angabe wird <code>http://</code> angenommen.
      </p>
      {#if editableLoading}
        <p class="muted">Lade…</p>
      {:else}
        <div class="field">
          <input
            value={settings['server_address'] ?? ''}
            oninput={(e) => { settings['server_address'] = e.currentTarget.value; saveSuccess = false; }}
            placeholder="z. B. http://192.168.1.10 oder https://fairpos.local"
            disabled={saving}
          />
        </div>
        <button class="btn-ghost" onclick={() => (addressTestOpen = true)} disabled={!addressTestUrl}>
          Testen
        </button>
      {/if}
    </section>

    <!-- Manual database backup ───────────────────────────────────────────────── -->
    <section class="card">
      <h2>Datenbank-Backup</h2>
      <p class="hint">
        Kein automatisches Backup — der Server läuft nicht 24/7, ein zeitbasierter
        Trigger würde regelmäßig verpasst. Stattdessen jederzeit auf Abruf: lädt ein
        vollständiges Datenbank-Backup als ZIP herunter (z. B. direkt nach dem
        Tagesabschluss, vor Updates, oder um es auf einen externen Datenträger
        mitzunehmen).
      </p>
      <a class="btn-primary" href={api.admin.backup.downloadUrl()}>Backup herunterladen</a>
    </section>
  {/if}

  {#if saveError}<p class="error-text">{saveError}</p>{/if}
  {#if saveSuccess}<p class="success-text">Gespeichert.</p>{/if}

  <div class="form-footer">
    <button class="btn-primary" onclick={save} disabled={saving || editableLoading}>
      {saving ? 'Speichern…' : 'Speichern'}
    </button>
  </div>
</div>

<Modal bind:open={addressTestOpen} title="Server-Adresse testen">
  <div class="token-box">
    <p class="muted">
      Mit dem Handy im selben WLAN scannen — landest du auf der FairPOS-Startseite, ist die Adresse korrekt.
    </p>
    {#if addressTestUrl}
      <img class="token-qr" src="/api/admin/qr.png?data={encodeURIComponent(addressTestUrl)}&size=320" alt="QR-Code zum Testen der Server-Adresse" />
    {/if}
    <code class="token-url">{addressTestUrl}</code>
    <div class="modal-actions">
      <button class="btn-ghost" onclick={() => (addressTestOpen = false)}>Schließen</button>
      <button class="btn-ghost" onclick={() => window.open(addressTestUrl, '_blank')}>In neuem Tab öffnen</button>
      <button class="btn-primary" onclick={() => copyToClipboard(addressTestUrl)}>Link kopieren</button>
    </div>
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

  .serial-row { display: flex; align-items: center; gap: 0.75rem; }
  .serial {
    font-size: 1rem; font-weight: 600; padding: 0.4rem 0.75rem;
    background: var(--color-bg); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); user-select: all;
  }

  .kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 1.25rem; margin: 0; font-size: 0.9rem; }
  .kv dt { color: var(--color-text-muted); }
  .kv dd { margin: 0; min-width: 0; }

  .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.9rem; }
  .field:last-child { margin-bottom: 0; }
  .field input { width: 100%; max-width: 360px; }

  .set-time-field { margin-top: 1rem; }
  .set-time-field label { font-size: 0.85rem; color: var(--color-text-muted); }
  .set-time-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .set-time-row input, .set-time-row select { width: auto; max-width: 260px; flex: 0 0 auto; }
  .success-text { color: #4caf7d; font-size: 0.875rem; }
  .form-footer { max-width: 640px; padding-top: 0.5rem; }

  .token-box { display: flex; flex-direction: column; gap: 1rem; align-items: stretch; }
  .token-qr {
    align-self: center; width: 220px; height: 220px;
    background: white; padding: 0.5rem; border-radius: var(--radius-sm);
  }
  .token-url {
    display: block; padding: 0.75rem;
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); font-size: 0.8rem;
    word-break: break-all; color: var(--color-text);
  }
</style>
