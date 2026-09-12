<script lang="ts">
  /**
   * Rechnungs-PDFs (ZIP) export page. Offers two download buttons:
   *   - Tag: scoped to a calendar day (date picker, defaults to "today")
   *   - Veranstaltung: scoped to the currently active event's full range (Task #95)
   *
   * Same scoping/UI pattern as the Excel-export page (including the D-025
   * server-timezone default fix, added here to match — this page's default
   * was previously computed from the browser's own clock/timezone only,
   * inconsistent with its sibling). Both endpoints stream a .zip file (one
   * PDF per invoice, every receipt type — sales, Storno, Training); the
   * browser handles the download via a synthetic anchor click so the user
   * stays on this page.
   */
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  let dayDate: string = $state(todayIso());

  onMount(async () => {
    try {
      const status = await api.admin.system.status();
      dayDate = serverDateIso(status.server_time, status.timezone);
    } catch {
      // Falls back to the browser's own "today" (set above) — only affects
      // the pre-filled default, the user can still pick any date manually.
    }
  });

  /**
   * Returns today's date as a `YYYY-MM-DD` string in the browser's local
   * timezone. Used only as a fallback until the server's own date has loaded.
   *
   * @returns The ISO date portion of "right now".
   */
  function todayIso(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * Formats an instant as a `YYYY-MM-DD` string in the given IANA timezone —
   * used to compute "today" the same way the day-export endpoint interprets
   * its `date` query (the server's local calendar day), regardless of the
   * browser's own timezone.
   *
   * @param isoInstant - The instant to format, as an ISO-8601 timestamp.
   * @param timezone - IANA timezone identifier, e.g. `Europe/Berlin`.
   * @returns The date portion in `YYYY-MM-DD` form.
   */
  function serverDateIso(isoInstant: string, timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(isoInstant));
  }

  /**
   * Triggers the browser-side download of an export. Uses a hidden anchor so the
   * current page state (event selection, date) is preserved.
   *
   * @param url - The export endpoint URL with query parameters.
   */
  function download(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Triggers the day-export download for the currently selected date. */
  function downloadDay() {
    if (!dayDate) return;
    download(`/api/admin/exports/invoices/day?date=${encodeURIComponent(dayDate)}`);
  }

  /** Triggers the event-export download for the currently active event. */
  function downloadEvent() {
    download('/api/admin/exports/invoices/event');
  }
</script>

<div class="page">
  <div class="page-header"><h1>Rechnungs-PDFs (ZIP)</h1></div>

  <section class="card">
    <h2>Tagesexport</h2>
    <p class="hint">Ein PDF je Rechnung eines einzelnen Tages (Dateiname = Belegnummer), inkl. Storno- und Trainingsbelegen.</p>
    <div class="row">
      <label class="field">
        <span class="field-label">Datum</span>
        <input type="date" bind:value={dayDate} />
      </label>
      <button class="btn-primary" onclick={downloadDay} disabled={!dayDate}>
        ZIP herunterladen
      </button>
    </div>
  </section>

  <section class="card">
    <h2>Veranstaltungsexport</h2>
    <p class="hint">Ein PDF je Rechnung der aktiven Veranstaltung — vom Start bis zum Ende, inkl. Storno- und Trainingsbelegen.</p>
    <div class="row">
      <button class="btn-primary" onclick={downloadEvent}>
        ZIP herunterladen
      </button>
    </div>
  </section>
</div>

<style>
  .card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.25rem 1.5rem; margin-bottom: 1.25rem;
    max-width: 640px;
  }
  .card h2 {
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); margin: 0 0 0.5rem 0;
  }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }
  .row { display: flex; gap: 1rem; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; }
  .field-label { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 600; }
  .row input[type="date"] { padding: 0.4rem 0.6rem; }
</style>
