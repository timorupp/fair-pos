<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { refreshPendingClosings } from '$lib/stores/pendingClosings';

  type RegisterDetail = {
    id: string; name: string; type: string;
    printer_name: string | null;
    /** Either the assigned printer or — if none — the system-default printer. */
    effective_printer_name: string | null;
    /** Gross totals still open since the last Z-Bon, per payment method (Task #143). */
    open_cash: number; open_card: number;
  };

  type ClosingRow = {
    id: string; z_number: number;
    created_at: string; business_date: string;
    is_zero_closing: boolean;
    total_gross: number; total_cash: number;
    total_bonstorno: number; total_free: number; total_order_cancellations: number;
    created_by_name: string;
  };

  let register: RegisterDetail | null = $state(null);
  let closings: ClosingRow[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let closing = $state(false);
  let closingError = $state('');
  /** One entry per Z-Bon produced by the last "jetzt abschließen" click — usually one, but more than one when the register had unassigned invoices from more than one calendar day (Task #106: one Z-Bon per day, not a single lump closing wrongly dated as today). */
  let lastClosings: { z_number: number; is_zero_closing: boolean }[] = $state([]);

  /** Past calendar days that still need a Z-Bon (oldest first). */
  let pendingDays: string[] = $state([]);
  let catchingUp = $state(false);
  let catchUpError = $state('');

  let id = $derived(($page.params['id'] ?? '') as string);

  /**
   * The server's current calendar day (`YYYY-MM-DD`, server timezone) — used
   * for {@link closedToday} instead of the browser's own clock/timezone
   * (never authoritative for anything operationally relevant; a dev-TSE
   * server may run with its system clock deliberately set back, and an
   * admin's browser could disagree in any case — see D-025's identical
   * rationale on the Excel-export page). `null` until loaded.
   */
  let serverTodayIso: string | null = $state(null);

  /**
   * Most recent closing whose `business_date` (already computed server-side
   * in the server's own timezone) equals {@link serverTodayIso}, used by the
   * UI to warn the operator about a duplicate Z-Bon issuance. `null` when no
   * closing exists for today, or while `serverTodayIso` hasn't loaded yet.
   */
  let closedToday = $derived(
    serverTodayIso === null ? null : closings.find((c) => c.business_date === serverTodayIso) ?? null,
  );

  onMount(load);

  /** Loads register details, past closings, the pending-day list, AND the server's current date, all in parallel. */
  async function load() {
    loading = true;
    try {
      const [reg, cls, pend, sys] = await Promise.all([
        api.admin.registers.get(id),
        api.admin.closings.listForRegister(id),
        api.admin.closings.pending(),
        api.admin.system.status(),
      ]);
      register = reg;
      closings = cls.closings;
      pendingDays = pend.registers.find((r) => r.register_id === id)?.pending_days ?? [];
      serverTodayIso = new Intl.DateTimeFormat('en-CA', { timeZone: sys.timezone }).format(new Date(sys.server_time));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  /**
   * Catches up every outstanding past day for this register in oldest-first order.
   * Each day produces a separate Z-Bon. Stops on the first error so the operator
   * can intervene.
   */
  async function catchUp() {
    if (pendingDays.length === 0) return;
    if (!confirm(`Für die ${pendingDays.length} ausstehenden Tage jeweils einen Z-Bon erstellen?`)) return;
    catchingUp = true; catchUpError = '';
    try {
      await api.admin.closings.closePending(id);
      await load();
      await refreshPendingClosings();
    } catch (e) {
      catchUpError = e instanceof Error ? e.message : 'Fehler';
      await load();
      await refreshPendingClosings();
    } finally { catchingUp = false; }
  }

  /**
   * Closes the day for this register and reloads the page state.
   * Shows the operator the new Z-number and whether a print job was queued.
   */
  async function closeDay() {
    if (!confirm('Tagesabschluss jetzt durchführen?')) return;
    closing = true; closingError = ''; lastClosings = [];
    try {
      const result = await api.admin.closings.closeRegister(id);
      lastClosings = result.closings;
      await load();
      await refreshPendingClosings();
    } catch (e) {
      closingError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      closing = false;
    }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2 });
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  /** Formats a `YYYY-MM-DD` business-date as `DD.MM.YYYY` without timezone games. */
  function fmtBusinessDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }
  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';

  /** Tracks which closing row is being reprinted so we can disable its button. */
  let reprintingClosingId: string | null = $state(null);
  let reprintClosingError = $state('');

  /**
   * Re-queues an ESC/POS print job for the given Z-Bon.
   *
   * @param closingId - The closing row id.
   */
  async function reprintClosing(closingId: string): Promise<void> {
    reprintingClosingId = closingId; reprintClosingError = '';
    try {
      await api.admin.closings.reprint(closingId);
    } catch (e) {
      reprintClosingError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      reprintingClosingId = null;
    }
  }
</script>

<div class="page">
  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if register}
    <div class="page-header">
      <div>
        <a href="/admin/registers" class="back-link">← Kassen</a>
        <h1>{register.name}</h1>
        <p class="muted">{typeLabel(register.type)}{register.printer_name ? ` · ${register.printer_name}` : ''}</p>
      </div>
    </div>

    <h2 class="section-title">Offen seit letztem Tagesabschluss</h2>
    <div class="balance-card">
      <div class="balance-row">
        <span>Bar</span>
        <span class="num">{fmt(register.open_cash)} €</span>
      </div>
      <div class="balance-row">
        <span>Karte</span>
        <span class="num">{fmt(register.open_card)} €</span>
      </div>
    </div>

    {#if pendingDays.length > 0}
      <section class="catchup-card">
        <h3>🔒 Kasse gesperrt — {pendingDays.length} Tag{pendingDays.length === 1 ? '' : 'e'} ausstehend</h3>
        <p>
          Bevor an dieser Kasse weiter kassiert werden kann, müssen die Tagesabschlüsse
          für folgende Kalendertage nachgeholt werden:
        </p>
        <ul class="pending-list">
          {#each pendingDays as day}
            <li>{day}</li>
          {/each}
        </ul>
        <button class="btn-primary" onclick={catchUp} disabled={catchingUp}>
          {catchingUp ? 'Hole nach…' : `Alle ${pendingDays.length} Z-Bons jetzt erstellen`}
        </button>
        {#if catchUpError}<p class="error-text">{catchUpError}</p>{/if}
      </section>
    {/if}

    <h2 class="section-title">Tagesabschluss</h2>
    <div class="closing-actions">
      <button class="btn-primary" onclick={closeDay} disabled={closing || pendingDays.length > 0}>
        {closing ? 'Wird abgeschlossen…' : 'Tagesabschluss jetzt durchführen'}
      </button>
      {#if pendingDays.length > 0}
        <p class="warn small">Erst die ausstehenden Tage oben nachholen, dann kann der heutige Tag manuell abgeschlossen werden.</p>
      {/if}
      {#if closedToday}
        <p class="warn small">Heute wurde für diese Kasse bereits ein Abschluss erstellt (Z-Nr. {closedToday.z_number}). Ein erneuter Abschluss vergibt eine neue Z-Nummer.</p>
      {/if}
      <p class="muted small">Der Z-Bon wird nicht automatisch gedruckt, sondern als PDF archiviert — bei Bedarf über „PDF" ansehen oder über „Drucken" manuell ausdrucken.</p>
    </div>
    {#if closingError}<p class="error-text">{closingError}</p>{/if}
    {#if lastClosings.length === 1}
      <p class="success-text small">
        ✓ Z-Bon Nr. {lastClosings[0]!.z_number} erstellt{lastClosings[0]!.is_zero_closing ? ' (Nullabschluss)' : ''}.
      </p>
    {:else if lastClosings.length > 1}
      <p class="success-text small">
        ✓ {lastClosings.length} Z-Bons erstellt (Nr. {lastClosings.map((c) => c.z_number).join(', ')}) —
        die Kasse hatte unzugeordnete Rechnungen von mehr als einem Kalendertag, jeder Tag hat jetzt seinen eigenen Z-Bon.
      </p>
    {/if}

    {#if closings.length > 0}
      <table class="closings-table">
        <thead>
          <tr>
            <th class="num">Z-Nr.</th>
            <th>Geschäftstag</th>
            <th>Erstellt</th>
            <th>Benutzer</th>
            <th class="num">Brutto</th>
            <th class="num">Bar</th>
            <th class="num">Storno-Rechn.</th>
            <th class="num">Kostenfrei</th>
            <th class="num">Best.-Storno</th>
            <th class="center">Nullabschluss</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each closings as c}
            <tr class:zero={c.is_zero_closing}>
              <td class="num">{c.z_number}</td>
              <td>{fmtBusinessDate(c.business_date)}</td>
              <td>{fmtDate(c.created_at)}</td>
              <td>{c.created_by_name}</td>
              <td class="num">{fmt(c.total_gross)} €</td>
              <td class="num">{fmt(c.total_cash)} €</td>
              <td class="num">{fmt(c.total_bonstorno)} €</td>
              <td class="num">{fmt(c.total_free)} €</td>
              <td class="num">{fmt(c.total_order_cancellations)} €</td>
              <td class="center">{c.is_zero_closing ? 'X' : ''}</td>
              <td class="actions">
                <a class="btn-ghost" href={api.admin.closings.pdfUrl(c.id)} target="_blank" rel="noopener">PDF</a>
                <a class="btn-ghost" href={api.admin.closings.dsfinvkUrl(c.id)} rel="noopener" title="DSFinV-K-Export (ZIP)">DSFinV-K</a>
                <button class="btn-ghost" onclick={() => reprintClosing(c.id)} disabled={reprintingClosingId === c.id}>
                  {reprintingClosingId === c.id ? '…' : 'Drucken'}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if reprintClosingError}<p class="error-text small">{reprintClosingError}</p>{/if}
    {/if}
  {/if}
</div>

<style>
  .back-link { font-size: 0.8rem; color: var(--color-text-muted); text-decoration: none; }
  .back-link:hover { color: var(--color-text); }
  .balance-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.25rem 1.5rem;
    display: flex; flex-direction: column; gap: 0.6rem; max-width: 400px;
  }
  .balance-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
  .section-title { font-size: 0.9rem; font-weight: 600; color: var(--color-text-muted); margin-top: 1.5rem; }
  .center { text-align: center; }
  .closing-actions { display: flex; flex-direction: column; gap: 0.4rem; }
  .small { font-size: 0.85rem; }
  .success-text { color: #4caf7d; font-size: 0.85rem; }
  .closings-table tr.zero { color: var(--color-text-muted); }
  .warn { color: #c87a00; }
  .catchup-card {
    background: #f59e0b22; border: 1px solid #f59e0b88; border-radius: var(--radius);
    padding: 1rem 1.25rem; margin: 1rem 0; max-width: 600px;
  }
  .catchup-card h3 { margin: 0 0 0.5rem 0; font-size: 1rem; color: #c87a00; }
  .catchup-card p { margin: 0.25rem 0 0.5rem 0; font-size: 0.9rem; }
  .pending-list { margin: 0 0 0.75rem 1.25rem; font-family: monospace; font-size: 0.9rem; }
</style>
