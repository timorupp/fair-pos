<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type ActiveEvent } from '$lib/api';

  const REFRESH_INTERVAL_MS = 30_000;

  /** Drift in whole seconds between this browser's clock and the server's, or `null` before the first check / on error. */
  let driftSeconds: number | null = $state(null);

  /** Active PIN-login IP lockouts (Task #90) — lives only here now, not on the System settings page. */
  let ipLockoutCount = $state(0);
  let resettingLockouts = $state(false);
  let resetLockoutsError = $state('');

  /** The currently open TSE outage row, if any (`tse_outage.ended_at IS NULL`) — a real failed signing attempt, not just a health-check blip. */
  let tseOutageOpen: { started_at: string; reason: string } | null = $state(null);

  /**
   * Last known TSE health-check result (Task #64's background job writes
   * this on every state *transition*, see `tse/healthJob.ts`) — deliberately
   * NOT `GET /api/admin/tse/status`, which hits real hardware and is too
   * expensive to call on every dashboard load. `null` covers both "TSE not
   * configured" and "no check has run yet", shown as a neutral state rather
   * than an alarming one since we can't cheaply tell those apart here.
   */
  let tseHealth: { severity: 'info' | 'warning' | 'error'; message: string; createdAt: string } | null = $state(null);

  let pendingClosing: {
    total_pending_registers: number; total_pending_days: number;
    registers: { register_id: string; register_name: string; pending_days: string[] }[];
  } | null = $state(null);

  let erroringPrintJobs = $state(0);
  let queuedPrintJobs = $state(0);

  let activeSessions = $state(0);

  let todayRevenue = $state(0);
  let openPositionsTotal = $state(0);

  /** The currently active event (Task #95), or `null` if none is active. */
  let activeEvent: ActiveEvent | null = $state(null);
  /** Whether the current (browser-local) time falls outside the active event's start/end window. */
  let eventTimeWarning = $state(false);

  /** Shutdown (Task #99) — moved here from Einstellungen → System so it's reachable from the dashboard's top-right corner. */
  let shuttingDown = $state(false);
  let shutdownError = $state('');

  let loading = $state(true);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Loads (or silently re-loads) every tile's data in parallel. */
  async function loadAll() {
    await Promise.allSettled([
      loadStatus(), loadPendingClosings(), loadTse(), loadPrintJobs(), loadSessions(), loadRevenue(), loadActiveEvent(),
    ]);
  }

  onMount(async () => {
    await loadAll();
    loading = false;
    // Silent background refresh — no loading flicker, just updated numbers.
    refreshTimer = setInterval(loadAll, REFRESH_INTERVAL_MS);
  });

  onDestroy(() => { if (refreshTimer) clearInterval(refreshTimer); });

  /**
   * Compares the browser's own clock against the server's (Task #60) — the
   * TSE syncs its time against the *server's* system clock, so a drift here
   * is worth flagging early. 30s threshold: small clock skew is normal and
   * harmless, this is meant to catch a genuinely wrong system clock. Also
   * carries the IP-lockout count (Task #90) — both come from the same cheap
   * status endpoint.
   */
  async function loadStatus() {
    try {
      const status = await api.admin.system.status();
      const serverTime = new Date(status.server_time).getTime();
      driftSeconds = Math.round((Date.now() - serverTime) / 1000);
      ipLockoutCount = status.ip_lockout_count;
    } catch {
      // Silent — soft, informational checks; the System-Seite itself surfaces load errors.
    }
  }

  async function loadPendingClosings() {
    try { pendingClosing = await api.admin.closings.pending(); } catch { pendingClosing = null; }
  }

  async function loadTse() {
    try {
      const outages = await api.admin.reports.tseOutages();
      tseOutageOpen = outages[0]?.ended_at === null ? outages[0]! : null;
    } catch { tseOutageOpen = null; }
    try {
      const logs = await api.admin.logs.list({ category: 'tse_health' });
      tseHealth = logs[0] ?? null;
    } catch { tseHealth = null; }
  }

  async function loadPrintJobs() {
    try {
      const jobs = await api.admin.printJobs.list();
      // `failed` is the worker's terminal give-up state after MAX_ATTEMPTS
      // (print-worker.ts) — by the time a job reaches it, it's typically old
      // and no longer operationally relevant. The actual "something is wrong
      // right now" signal is a job still retrying (`pending`) that already
      // carries an error_message from its last attempt (found live,
      // 2026-08-29: an old genuinely-failed job made this tile say "keine
      // Fehler" while a currently-struggling job sat unflagged).
      erroringPrintJobs = jobs.filter((j) => j.status === 'pending' && j.error_message !== null).length;
      queuedPrintJobs = jobs.filter((j) => j.status !== 'failed').length;
    } catch {
      // Silent — soft check, see loadStatus.
    }
  }

  async function loadSessions() {
    try { activeSessions = (await api.admin.sessions.list()).length; } catch { activeSessions = 0; }
  }

  async function loadRevenue() {
    try { todayRevenue = (await api.admin.reports.todayRevenue()).total; } catch { todayRevenue = 0; }
    try {
      const { tables } = await api.admin.reports.openPositions();
      openPositionsTotal = tables.reduce((s, t) => s + t.total_gross, 0);
    } catch { openPositionsTotal = 0; }
  }

  async function loadActiveEvent() {
    try {
      activeEvent = (await api.admin.system.getActiveEvent()).event;
      const now = Date.now();
      eventTimeWarning = activeEvent !== null
        && (now < new Date(activeEvent.startTime).getTime() || now > new Date(activeEvent.endTime).getTime());
    } catch {
      activeEvent = null;
      eventTimeWarning = false;
    }
  }

  /** Cleanly shuts the server down (Task #61/#99) — same confirm-then-call flow as the former Einstellungen → System location. */
  async function requestShutdown() {
    if (!confirm('Server jetzt wirklich herunterfahren? Das beendet den laufenden Kassenbetrieb sofort und der Server muss vor Ort wieder eingeschaltet werden.')) return;
    shutdownError = ''; shuttingDown = true;
    try {
      await api.admin.system.shutdown();
      // No further UI update expected — the server is going down.
    } catch (e) {
      shutdownError = e instanceof Error ? e.message : 'Fehler';
      shuttingDown = false;
    }
  }

  const fmtEuro = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  /** Clears every IP's PIN-login lockout (Task #90) — for a device that locked itself out by mistake. */
  async function resetIpLockouts() {
    resettingLockouts = true; resetLockoutsError = '';
    try {
      await api.admin.system.resetIpLockouts();
      await loadStatus();
    } catch (e) {
      resetLockoutsError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      resettingLockouts = false;
    }
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleString('de-DE');
</script>

<div class="page">
  <div class="page-header">
    <h1>Dashboard</h1>
    <div class="header-actions">
      <button class="btn-ghost danger" onclick={requestShutdown} disabled={shuttingDown}>
        {shuttingDown ? 'Fährt herunter…' : 'Server herunterfahren'}
      </button>
    </div>
  </div>
  {#if shutdownError}<p class="error-text">{shutdownError}</p>{/if}

  {#if !loading}
    {@const showWarnings = (driftSeconds !== null && Math.abs(driftSeconds) > 30) || tseOutageOpen !== null}
    {#if showWarnings}
      <div class="warnings">
        {#if driftSeconds !== null && Math.abs(driftSeconds) > 30}
          <a class="warning-banner" href="/admin/settings/system">
            <strong>⚠ Uhrzeit-Abweichung erkannt</strong>
            Serverzeit liegt {Math.abs(driftSeconds)} Sekunden {driftSeconds > 0 ? 'hinter' : 'vor'} der Browserzeit
            dieses Geräts — relevant für die TSE-Zeitsynchronisation. In den Systemeinstellungen prüfen/korrigieren.
          </a>
        {/if}

        {#if tseOutageOpen}
          <a class="warning-banner" href="/admin/reports/tse-outages">
            <strong>⚠ TSE-Ausfall aktiv</strong>
            Seit {formatTime(tseOutageOpen.started_at)} — {tseOutageOpen.reason}. Signieren funktioniert weiterhin
            (KassenSichV-konform ohne TSE), aber die Ursache sollte geprüft werden.
          </a>
        {/if}
      </div>
    {/if}

    <h2 class="section-heading">Veranstaltung</h2>
    <div class="tiles">
      <a class="tile" class:warn={activeEvent === null || eventTimeWarning} href="/admin/events">
        <h2>Aktive Veranstaltung</h2>
        {#if activeEvent}
          <p class="tile-value">{activeEvent.name}</p>
          {#if eventTimeWarning}
            <p class="tile-detail warn-text">
              ⚠ Aktuelle Systemzeit liegt außerhalb des Veranstaltungszeitraums
              ({formatTime(activeEvent.startTime)} – {formatTime(activeEvent.endTime)}).
            </p>
          {:else}
            <p class="tile-detail">Betrifft Artikel, Kassen, Layouts, Saalplan, Rechnungen, Bestellungen.</p>
          {/if}
        {:else}
          <p class="tile-value muted">⚠ Keine aktiv</p>
          <p class="tile-detail">Veranstaltung anlegen und aktivieren, bevor Artikel/Kassen eingerichtet werden können.</p>
        {/if}
      </a>

      <a class="tile" class:warn={(pendingClosing?.total_pending_registers ?? 0) > 0} href="/admin/registers">
        <h2>Ausstehende Tagesabschlüsse</h2>
        {#if pendingClosing && pendingClosing.total_pending_registers > 0}
          <p class="tile-value">{pendingClosing.total_pending_days} Tag{pendingClosing.total_pending_days === 1 ? '' : 'e'}</p>
          <p class="tile-detail">
            {pendingClosing.total_pending_registers} Kasse{pendingClosing.total_pending_registers === 1 ? '' : 'n'} gesperrt:
            {pendingClosing.registers.map((r) => r.register_name).join(', ')}
          </p>
        {:else}
          <p class="tile-value">✓ Keine</p>
          <p class="tile-detail">Alle Kassen sind aktuell.</p>
        {/if}
      </a>

      <a class="tile" href="/admin/reports/cash-balance">
        <h2>Tagesumsatz</h2>
        <p class="tile-value">{fmtEuro(todayRevenue)}</p>
        <p class="tile-detail">Alle heute gebuchten Einnahmen</p>
      </a>

      <a class="tile" href="/admin/reports/open-positions">
        <h2>Offene Rechnungen</h2>
        <p class="tile-value">{fmtEuro(openPositionsTotal)}</p>
        <p class="tile-detail">Summe aller offenen Positionen an den Tischen</p>
      </a>
    </div>

    <h2 class="section-heading">System</h2>
    <div class="tiles">
      <a class="tile" class:warn={tseHealth?.severity === 'warning'} href="/admin/settings/logs">
        <h2>TSE-Zustand</h2>
        {#if tseHealth}
          <p class="tile-value">{tseHealth.severity === 'warning' ? '⚠ Auffällig' : '✓ Gesund'}</p>
          <p class="tile-detail">{tseHealth.message}</p>
        {:else}
          <p class="tile-value muted">Kein Status verfügbar</p>
          <p class="tile-detail">Noch keine Prüfung protokolliert.</p>
        {/if}
      </a>

      <a class="tile" class:warn={erroringPrintJobs > 0} href="/admin/settings/print-queue">
        <h2>Druckwarteschlange</h2>
        <p class="tile-value">{erroringPrintJobs > 0 ? `⚠ ${erroringPrintJobs} mit Fehler` : '✓ Keine Fehler'}</p>
        <p class="tile-detail">{queuedPrintJobs} wartend/in Bearbeitung</p>
      </a>

      <a class="tile" href="/admin/settings/sessions">
        <h2>Aktive Sitzungen</h2>
        <p class="tile-value">{activeSessions}</p>
        <p class="tile-detail">Derzeit angemeldete Geräte</p>
      </a>

      <div class="tile" class:warn={ipLockoutCount > 0}>
        <h2>PIN-Login: IP-Sperren</h2>
        <p class="tile-value">{ipLockoutCount > 0 ? `⚠ ${ipLockoutCount} gesperrt` : '✓ Keine'}</p>
        <p class="tile-detail">3 Fehlversuche → 15 Minuten Sperre je Gerät</p>
        {#if ipLockoutCount > 0}
          <button class="btn-ghost tile-action" onclick={resetIpLockouts} disabled={resettingLockouts}>
            {resettingLockouts ? 'Setze zurück…' : 'Zurücksetzen'}
          </button>
        {/if}
        {#if resetLockoutsError}<p class="error-text">{resetLockoutsError}</p>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .page-header { margin-bottom: 1.25rem; }
  h1 { font-size: 1.25rem; margin: 0; }
  .header-actions { display: flex; gap: 0.5rem; align-items: center; }

  .section-heading {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); margin: 0 0 0.6rem 0;
  }
  .section-heading:not(:first-of-type) { margin-top: 1.75rem; }

  .warnings { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }

  .warning-banner {
    display: block;
    background: #f59e0b22;
    border: 1px solid #f59e0b88;
    color: var(--color-text);
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius);
    font-size: 0.9rem;
    text-decoration: none;
    transition: background 0.1s;
  }
  a.warning-banner:hover { background: #f59e0b33; }
  .warning-banner strong { display: block; color: #c87a00; margin-bottom: 0.15rem; }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .tile {
    display: block;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1.1rem 1.25rem;
    text-decoration: none;
    color: var(--color-text);
    transition: border-color 0.15s;
  }
  .tile:hover { border-color: var(--color-primary); }
  .tile.warn { border-color: #f59e0b88; background: #f59e0b11; }

  .tile h2 {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); margin: 0 0 0.5rem 0;
  }
  .tile-value { font-size: 1.15rem; font-weight: 600; margin: 0 0 0.25rem 0; }
  .tile-value.muted { color: var(--color-text-muted); font-weight: 500; }
  .tile-detail { font-size: 0.8rem; color: var(--color-text-muted); margin: 0; }
  .tile-detail.warn-text { color: #c87a00; }
  .tile-action { margin-top: 0.6rem; }
</style>
