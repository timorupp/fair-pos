<script lang="ts">
  /**
   * "Stornos & kostenfreie Abgaben" report: all cancelled and free-of-charge
   * items in the selected event, with a per-user summary above the table for
   * abuse spotting.
   */
  import { api } from '$lib/api';
  import EventSelector from '$lib/components/EventSelector.svelte';

  type SummaryRow = { user_name: string; count: number; total: number };
  type ItemRow = {
    id: string; cancelled_at: string | null; created_at: string;
    user_name: string; table_name: string;
    article_name: string; options: string | null;
    price: number; deposit_price: number | null; line_gross: number;
    reason_name: string; booking_type: string;
  };

  let selectedEventId: string | null = $state(null);
  let items: ItemRow[] = $state([]);
  let summary: SummaryRow[] = $state([]);
  let loading = $state(false);
  let error = $state('');

  /** Filters */
  let userFilter: string | 'all' = $state('all');
  let typeFilter: '' | 'cancellation' | 'free_of_charge' = $state('');

  /** Reload report data when the event selection changes. */
  async function onEventChange() {
    if (!selectedEventId) { items = []; summary = []; return; }
    loading = true; error = '';
    try {
      const result = await api.admin.reports.cancellations(selectedEventId);
      items = result.items;
      summary = result.summary;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  /** Returns the items list with the active user/type filters applied. */
  let filteredItems = $derived(items.filter((it) => {
    if (userFilter !== 'all' && it.user_name !== userFilter) return false;
    if (typeFilter && it.booking_type !== typeFilter) return false;
    return true;
  }));

  /** Re-aggregates the summary when filters are active. */
  let filteredSummary = $derived((() => {
    if (userFilter === 'all' && !typeFilter) return summary;
    const by = new Map<string, { user_name: string; count: number; total: number }>();
    for (const it of filteredItems) {
      const key = it.user_name;
      const entry = by.get(key) ?? { user_name: it.user_name, count: 0, total: 0 };
      entry.count += 1;
      entry.total += it.line_gross;
      by.set(key, entry);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  })());

  let userOptions = $derived(['all', ...new Set(items.map((it) => it.user_name))]);

  /**
   * Formats a number as a German euro amount with two decimals.
   *
   * @param n - Amount to format.
   * @returns The amount as a `1.234,56` string.
   */
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Formats an ISO timestamp as a short German date+time string.
   *
   * @param iso - ISO-8601 timestamp.
   * @returns The localized date+time or the raw input on parse failure.
   */
  function timeLabel(iso: string | null): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  }

  /**
   * Maps the booking type to a German label.
   *
   * @param t - The `booking_type` value from the API.
   * @returns Human-readable German label.
   */
  const bookingLabel = (t: string) =>
    t === 'cancellation' ? 'Storno' : t === 'free_of_charge' ? '100 % Rabatt' : t;
</script>

<div class="page">
  <div class="page-header"><h1>Stornos &amp; kostenfreie Abgaben</h1></div>

  <EventSelector bind:selectedId={selectedEventId} on:change={onEventChange} />

  {#if selectedEventId}
    <div class="filters">
      <label>
        Bedienung
        <select bind:value={userFilter}>
          {#each userOptions as u}
            <option value={u}>{u === 'all' ? 'Alle' : u}</option>
          {/each}
        </select>
      </label>
      <label>
        Buchungsart
        <select bind:value={typeFilter}>
          <option value="">Alle</option>
          <option value="cancellation">Storno</option>
          <option value="free_of_charge">100 % Rabatt</option>
        </select>
      </label>
    </div>
  {/if}

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if !selectedEventId}
    <p class="muted">Bitte eine Veranstaltung wählen.</p>
  {:else if items.length === 0}
    <p class="muted">Keine Stornos oder kostenfreie Abgaben in diesem Zeitraum.</p>
  {:else}
    <section class="summary card">
      <h2>Zusammenfassung je Bedienung</h2>
      {#if filteredSummary.length === 0}
        <p class="muted">Keine Daten passend zum Filter.</p>
      {:else}
        <table class="summary-table">
          <thead><tr><th>Bedienung</th><th class="num">Artikel</th><th class="num">Summe</th></tr></thead>
          <tbody>
            {#each filteredSummary as s}
              <tr><td>{s.user_name}</td><td class="num">{s.count}</td><td class="num">{fmt(s.total)} €</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <table>
      <thead>
        <tr>
          <th>Datum / Uhrzeit</th>
          <th>Bedienung</th>
          <th>Tisch</th>
          <th>Artikel</th>
          <th class="num">Menge</th>
          <th class="num">Preis</th>
          <th>Stornogrund</th>
          <th>Buchungsart</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredItems as it}
          <tr>
            <td>{timeLabel(it.cancelled_at)}</td>
            <td>{it.user_name}</td>
            <td>{it.table_name}</td>
            <td>
              {it.article_name}{#if it.options}<span class="opts"> · {it.options}</span>{/if}
            </td>
            <td class="num">1×</td>
            <td class="num">{fmt(it.line_gross)} €</td>
            <td>{it.reason_name}</td>
            <td>{bookingLabel(it.booking_type)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .filters { display: flex; gap: 1rem; margin-bottom: 1rem; }
  .filters label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .filters select { padding: 0.4rem 0.6rem; min-width: 180px; }
  .card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1rem 1.25rem; margin-bottom: 1.5rem;
  }
  .card h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }
  .summary-table { width: auto; }
  .opts { font-size: 0.85rem; color: var(--color-text-muted); }
</style>
