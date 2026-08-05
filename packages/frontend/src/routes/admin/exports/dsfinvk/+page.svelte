<script lang="ts">
  /**
   * DSFinV-K export page. Lets the admin pick a register, then download the
   * DSFinV-K ZIP (CSV files + index.xml) for any of its past Kassenabschlüsse
   * (Z-Bons). See docs/Rechtliche-Anforderungen.md Abschnitt 6 for the
   * specification and docs/TSE-Integration.md for the TSE-signature side.
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Register } from '@fairpos/shared';

  type ClosingRow = {
    id: string; z_number: number; created_at: string; business_date: string;
    is_zero_closing: boolean; total_gross: number; total_cash: number; total_cancellations: number;
    created_by: string;
  };

  let registers: Register[] = [];
  let registerId = '';
  let closings: ClosingRow[] = [];

  let loading = true;
  let loadingClosings = false;
  let error = '';

  onMount(async () => {
    try {
      registers = await api.admin.registers.list();
      registerId = registers[0]?.id ?? '';
      if (registerId) await loadClosings();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  });

  async function loadClosings(): Promise<void> {
    if (!registerId) { closings = []; return; }
    loadingClosings = true; error = '';
    try {
      const result = await api.admin.closings.listForRegister(registerId);
      closings = result.closings;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loadingClosings = false;
    }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2 });
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE');
  const fmtBusinessDate = (d: string) => new Date(d).toLocaleDateString('de-DE');
</script>

<div class="page">
  <div class="page-header"><h1>DSFinV-K-Export</h1></div>
  <p class="hint">
    Export pro Kassenabschluss (Z-Bon) als ZIP-Archiv (CSV-Dateien + <code>index.xml</code>),
    zur Bereitstellung bei einer Betriebsprüfung. Details und Quellenangaben:
    <code>docs/Rechtliche-Anforderungen.md</code> Abschnitt 6.
  </p>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else}
    <div class="field">
      <label for="register">Kasse</label>
      <select id="register" bind:value={registerId} on:change={loadClosings}>
        {#each registers as r}
          <option value={r.id}>{r.name}</option>
        {/each}
      </select>
    </div>

    {#if error}<p class="error-text">{error}</p>{/if}

    {#if loadingClosings}
      <p class="muted">Lade Kassenabschlüsse…</p>
    {:else if closings.length === 0}
      <p class="muted">Für diese Kasse liegen noch keine Kassenabschlüsse (Z-Bons) vor.</p>
    {:else}
      <table class="closings-table">
        <thead>
          <tr>
            <th class="num">Z-Nr.</th>
            <th>Geschäftstag</th>
            <th>Erstellt</th>
            <th class="num">Brutto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each closings as c}
            <tr class:zero={c.is_zero_closing}>
              <td class="num">{c.z_number}</td>
              <td>{fmtBusinessDate(c.business_date)}</td>
              <td>{fmtDate(c.created_at)}</td>
              <td class="num">{fmt(c.total_gross)} €</td>
              <td class="actions">
                <a class="btn-ghost" href={api.admin.closings.dsfinvkUrl(c.id)} rel="noopener">ZIP herunterladen</a>
                {#if c.is_zero_closing}<span class="muted small">Null</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<style>
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 1.25rem 0; max-width: 640px; }
  .hint code { font-size: 0.85em; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1.25rem; max-width: 320px; }
  .field label { font-size: 0.85rem; color: var(--color-text-muted); }

  .closings-table { width: 100%; max-width: 800px; }
  .closings-table th, .closings-table td { padding: 0.5rem 0.75rem; }
  .closings-table .num { text-align: right; }
  .closings-table tr.zero { opacity: 0.6; }
  .closings-table .actions { display: flex; align-items: center; gap: 0.5rem; }
  .small { font-size: 0.8rem; }
</style>
