<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { ActiveEvent } from '$lib/api';
  import type { RegisterLayout } from '@fairpos/shared';

  type LayoutRow = RegisterLayout & { slot_count: number };

  let layouts: LayoutRow[] = $state([]);
  let activeEvent: ActiveEvent | null = $state(null);
  let loading = $state(true);
  let error = $state('');
  let duplicating: string | null = $state(null);

  onMount(load);

  async function load() {
    loading = true;
    try {
      const [layoutsResult, eventResult] = await Promise.all([
        api.admin.layouts.list(),
        api.admin.system.getActiveEvent(),
      ]);
      layouts = layoutsResult;
      activeEvent = eventResult.event;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  async function createLayout() {
    const name = prompt('Name des neuen Layouts:');
    if (!name) return;
    try {
      const created = await api.admin.layouts.create({ name });
      location.assign(`/admin/settings/layouts/${created.id}`);
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  async function duplicate(layout: LayoutRow) {
    duplicating = layout.id;
    try {
      const copy = await api.admin.layouts.duplicate(layout.id);
      await load();
      location.assign(`/admin/settings/layouts/${copy.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler');
      duplicating = null;
    }
  }

  async function saveDefaults() {
    try {
      const result = await api.admin.system.setActiveEventDefaultLayouts(
        activeEvent?.defaultReceiptRegisterLayoutId ?? null,
        activeEvent?.defaultServiceRegisterLayoutId ?? null,
      );
      activeEvent = result.event;
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Kassenlayouts</h1>
    <button class="btn-primary" onclick={createLayout}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <section class="defaults-section">
      <h2>Standardlayouts</h2>
      <div class="defaults-row">
        <div class="field">
          <label for="def-receipt">Standard für Bonkassen</label>
          <select id="def-receipt"
                  value={activeEvent?.defaultReceiptRegisterLayoutId ?? ''}
                  onchange={(e) => { if (activeEvent) activeEvent.defaultReceiptRegisterLayoutId = e.currentTarget.value || null; saveDefaults(); }}>
            <option value="">— kein Standard —</option>
            {#each layouts as l}
              <option value={l.id}>{l.name}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="def-service">Standard für Bedienungskassen</label>
          <select id="def-service"
                  value={activeEvent?.defaultServiceRegisterLayoutId ?? ''}
                  onchange={(e) => { if (activeEvent) activeEvent.defaultServiceRegisterLayoutId = e.currentTarget.value || null; saveDefaults(); }}>
            <option value="">— kein Standard —</option>
            {#each layouts as l}
              <option value={l.id}>{l.name}</option>
            {/each}
          </select>
        </div>
      </div>
    </section>

    {#if layouts.length === 0}
      <p class="muted">Noch keine Layouts. Klicke „+ Neu" um das erste anzulegen.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Name</th><th class="num">Raster</th><th class="num">Artikel</th><th></th></tr>
        </thead>
        <tbody>
          {#each layouts as l}
            <tr>
              <td>{l.name}</td>
              <td class="num">{l.grid_cols} × {l.grid_rows}</td>
              <td class="num">{l.slot_count}</td>
              <td class="actions">
                <button class="btn-ghost" onclick={() => duplicate(l)} disabled={duplicating === l.id}>
                  {duplicating === l.id ? '…' : 'Duplizieren'}
                </button>
                <a href="/admin/settings/layouts/{l.id}" class="btn-ghost">Bearbeiten</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<style>
  .defaults-section { padding: 1.25rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); }
  .defaults-section h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin-bottom: 1rem; }
  .defaults-row { display: flex; gap: 1.5rem; }
  .defaults-row .field { flex: 1; margin-bottom: 0; }
</style>
