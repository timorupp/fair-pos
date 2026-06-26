<script lang="ts">
  /**
   * "Offene Positionen je Tisch" report: shows all currently-open order items
   * grouped by the table they belong to. Pure live data; no event filter applies.
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  type Block = {
    table_id: string | null; table_name: string; total_gross: number;
    positions: {
      name: string; options: string | null; qty: number;
      unit_price: number; unit_deposit: number | null;
      tax_rate: number; line_gross: number;
      oldest_order: string;
    }[];
  };

  let blocks: Block[] = [];
  let loading = true;
  let error = '';

  onMount(load);

  /** Reloads the report data from the backend. */
  async function load() {
    loading = true; error = '';
    try {
      const result = await api.admin.reports.openPositions();
      blocks = result.tables;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  $: grandTotal = blocks.reduce((s, b) => s + b.total_gross, 0);
  $: positionCount = blocks.reduce((s, b) => s + b.positions.reduce((q, p) => q + p.qty, 0), 0);

  /**
   * Formats a number as a German euro amount with two decimals.
   *
   * @param n - Amount to format.
   * @returns The amount as a `1.234,56` string.
   */
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Renders an ISO timestamp as a short German date+time for the table rows.
   *
   * @param iso - ISO-8601 timestamp.
   * @returns A `DD.MM.YYYY HH:MM` string or the raw input on parse failure.
   */
  function timeLabel(iso: string): string {
    try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso; }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Offene Positionen je Tisch</h1>
    <button class="btn-ghost" on:click={load} disabled={loading}>{loading ? 'Lade…' : 'Aktualisieren'}</button>
  </div>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if !loading && blocks.length === 0}
    <p class="muted">Keine offenen Positionen.</p>
  {:else if !loading}
    <div class="summary">
      <span class="summary-label">Insgesamt</span>
      <span class="summary-value">{positionCount} Artikel</span>
      <span class="summary-value">{fmt(grandTotal)} €</span>
    </div>

    {#each blocks as block}
      <section class="block">
        <header class="block-header">
          <h2>{block.table_name}</h2>
          <span class="block-total">{fmt(block.total_gross)} €</span>
        </header>
        <table>
          <thead>
            <tr>
              <th class="num">Menge</th>
              <th>Artikel</th>
              <th class="num">Einzeln</th>
              <th class="num">Summe</th>
              <th>Bestellt</th>
            </tr>
          </thead>
          <tbody>
            {#each block.positions as p}
              <tr>
                <td class="num">{p.qty}×</td>
                <td>
                  {p.name}{#if p.options}<span class="opts"> · {p.options}</span>{/if}
                </td>
                <td class="num">{fmt(p.unit_price + (p.unit_deposit ?? 0))} €</td>
                <td class="num">{fmt(p.line_gross)} €</td>
                <td class="muted small">{timeLabel(p.oldest_order)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/each}
  {/if}
</div>

<style>
  .summary {
    display: flex; align-items: baseline; gap: 1.5rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 0.75rem 1.25rem; margin-bottom: 1.5rem;
  }
  .summary-label { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; }
  .summary-value { font-size: 1.1rem; font-weight: 700; }

  .block {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); margin-bottom: 1rem; padding: 1rem 1.25rem;
  }
  .block-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem; }
  .block-header h2 { font-size: 1rem; font-weight: 700; margin: 0; }
  .block-total { font-size: 1rem; font-weight: 700; }

  .opts { font-size: 0.85rem; color: var(--color-text-muted); }
  .small { font-size: 0.8rem; }
</style>
