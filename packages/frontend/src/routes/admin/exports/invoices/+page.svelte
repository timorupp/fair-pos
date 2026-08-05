<script lang="ts">
  /**
   * Rechnungs-PDFs (ZIP) export page. Offers two download buttons:
   *   - Tag: scoped to a calendar day (date picker, defaults to "today")
   *   - Veranstaltung: scoped to the selected event's full range
   *
   * Same scoping/UI pattern as the Excel-export page. Both endpoints stream
   * a .zip file (one PDF per invoice, every receipt type — sales, Storno,
   * Training); the browser handles the download via a synthetic anchor click
   * so the user stays on this page.
   */
  import EventSelector from '$lib/components/EventSelector.svelte';

  let selectedEventId: string | null = null;
  let dayDate: string = todayIso();

  /**
   * Returns today's date as a `YYYY-MM-DD` string in the user's local timezone.
   *
   * @returns The ISO date portion of "right now".
   */
  function todayIso(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

  /** Triggers the event-export download for the currently selected event. */
  function downloadEvent() {
    const qs = selectedEventId ? `?event_id=${encodeURIComponent(selectedEventId)}` : '';
    download(`/api/admin/exports/invoices/event${qs}`);
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
      <button class="btn-primary" on:click={downloadDay} disabled={!dayDate}>
        ZIP herunterladen
      </button>
    </div>
  </section>

  <section class="card">
    <h2>Veranstaltungsexport</h2>
    <p class="hint">Ein PDF je Rechnung einer Veranstaltung — vom Start bis zum Ende, inkl. Storno- und Trainingsbelegen.</p>
    <EventSelector bind:selectedId={selectedEventId} />
    <div class="row">
      <button class="btn-primary" on:click={downloadEvent} disabled={!selectedEventId}>
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
