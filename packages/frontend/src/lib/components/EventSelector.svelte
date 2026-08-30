<script lang="ts">
  /**
   * Dropdown that lets the operator pick the event a report should scope to.
   *
   * Loads the event list and the server-suggested default on mount, then keeps
   * the parent's `selectedId` in sync via a two-way binding.
   *
   * Props:
   *   - `selectedId` (bind): The currently selected event id, or `null` when none.
   *
   * Events:
   *   - dispatches `change` with the new id whenever the selection changes.
   */
  import { onMount, createEventDispatcher } from 'svelte';
  import { api } from '$lib/api';

  
  interface Props {
    /** Currently selected event id; two-way bound by the parent. */
    selectedId?: string | null;
  }

  let { selectedId = $bindable(null) }: Props = $props();

  type EventOption = { id: string; name: string; start_time: string; end_time: string };

  let events: EventOption[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  const dispatch = createEventDispatcher<{ change: string | null }>();

  onMount(async () => {
    try {
      const result = await api.admin.reports.events();
      events = result.events;
      // Only auto-pick a default if the parent hasn't preselected one already.
      if (selectedId === null && result.default_event_id) {
        selectedId = result.default_event_id;
        dispatch('change', selectedId);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler beim Laden der Veranstaltungen';
    } finally {
      loading = false;
    }
  });

  /**
   * Forwards the native change event up to the parent via a typed dispatch.
   * Kept inline because the logic is one-liner-thin.
   */
  function onChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value || null;
    selectedId = value;
    dispatch('change', value);
  }

  /**
   * Formats an ISO timestamp as a short German date for the dropdown label.
   *
   * @param iso - ISO-8601 timestamp string.
   * @returns Day-month-year in `DD.MM.YYYY` form, or the input string on parse error.
   */
  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return iso; }
  }
</script>

<div class="event-selector">
  <label for="evt-sel">Veranstaltung</label>
  {#if loading}
    <span class="muted">Lade…</span>
  {:else if error}
    <span class="error-text">{error}</span>
  {:else if events.length === 0}
    <span class="muted">Keine Veranstaltungen konfiguriert</span>
  {:else}
    <select id="evt-sel" value={selectedId ?? ''} onchange={onChange}>
      {#each events as e}
        <option value={e.id}>{e.name} ({formatDate(e.start_time)} – {formatDate(e.end_time)})</option>
      {/each}
    </select>
  {/if}
</div>

<style>
  .event-selector { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  .event-selector label { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; }
  .event-selector select { padding: 0.4rem 0.6rem; min-width: 280px; }
</style>
