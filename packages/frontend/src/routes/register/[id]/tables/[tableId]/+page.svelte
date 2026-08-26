<script lang="ts">
  import { run } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  let registerId = $state('');
  let tableId = $state('');

  // Show a quick summary on this screen so the operator knows whether anything is open.
  let openGroups: { name: string; options: string | null; quantity: number; line_total: number }[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  run(() => {
    registerId = ($page.params['id'] ?? '') as string;
  });
  run(() => {
    tableId = ($page.params['tableId'] ?? '') as string;
  });

  onMount(load);

  async function load() {
    loading = true; error = '';
    try {
      const result = await api.registerSession.openItems(registerId, tableId);
      openGroups = result.groups;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  let openTotal = $derived(openGroups.reduce((s, g) => s + g.line_total * 1, 0));
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<div class="page">
  <header class="header">
    <button class="btn-ghost" onclick={() => goto(`/register/${registerId}/floor-plan`)}>← Saalplan</button>
    <h1>Tisch</h1>
  </header>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if !loading}
    <section class="summary card">
      <h2>Offene Positionen</h2>
      {#if openGroups.length === 0}
        <p class="muted">Tisch hat keine offenen Positionen.</p>
      {:else}
        <ul class="open-list">
          {#each openGroups as g}
            <li>
              <span class="qty">{g.quantity}×</span>
              <span class="name">
                <span class="name-text">{g.name}</span>
                {#if g.options}<span class="opts">{g.options}</span>{/if}
              </span>
              <span class="line-total">{fmt(g.line_total)} €</span>
            </li>
          {/each}
        </ul>
        <div class="total-row"><span>Summe</span><span class="total">{fmt(openTotal)} €</span></div>
      {/if}
    </section>

    <div class="actions">
      <button class="action-btn primary" onclick={() => goto(`/register/${registerId}/tables/${tableId}/order`)}>
        Bestellen
      </button>
      <button class="action-btn" onclick={() => goto(`/register/${registerId}/tables/${tableId}/checkout`)}
              disabled={openGroups.length === 0}>
        Kassieren
      </button>
      <button class="action-btn ghost" onclick={() => goto(`/register/${registerId}/floor-plan`)}>
        Zurück zum Saalplan
      </button>
    </div>
  {/if}
</div>

<style>
  .page { padding: 1rem; max-width: 640px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .header h1 { font-size: 1.2rem; margin: 0; flex: 1; }
  .card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.5rem;
  }
  .card h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }
  .open-list { list-style: none; padding: 0; margin: 0; }
  .open-list li {
    display: grid; grid-template-columns: 3em 1fr auto;
    align-items: baseline; gap: 0.6rem; padding: 0.3rem 0;
    border-bottom: 1px solid var(--color-border);
  }
  .open-list li:last-child { border-bottom: none; }
  .qty { font-weight: 700; }
  /* Options always on their own line below the name, consistent with the
     order list and checkout table (see DANGER.md D-046). */
  .name { display: flex; flex-direction: column; }
  .opts { display: block; font-size: 0.8rem; color: var(--color-text-muted); }
  .line-total { font-weight: 600; text-align: right; }
  .total-row { display: flex; justify-content: space-between; margin-top: 0.6rem; font-weight: 700; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
  .total { font-size: 1.15rem; }

  .actions { display: flex; flex-direction: column; gap: 0.75rem; }
  .action-btn {
    padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--radius);
    background: var(--color-surface); color: var(--color-text); cursor: pointer;
    font-size: 1rem; font-weight: 600;
  }
  .action-btn:hover:not(:disabled) { background: var(--color-surface-hover); }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .action-btn.primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }
  .action-btn.primary:hover { filter: brightness(1.1); }
  .action-btn.ghost { background: transparent; }
</style>
