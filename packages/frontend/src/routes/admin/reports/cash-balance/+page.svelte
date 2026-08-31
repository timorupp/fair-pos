<script lang="ts">
  /**
   * "Soll-Kassenstand" report: one calculated cash balance per register of
   * the active event. Detail of individual deposits / withdrawals is in the
   * register management page (admin/registers/[id]).
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  type Row = {
    id: string; name: string; type: string;
    deposits: number; withdrawals: number; cash_takings: number; balance: number;
  };

  let registers: Row[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const result = await api.admin.reports.cashBalance();
      registers = result.registers;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  });

  let totalBalance = $derived(registers.reduce((s, r) => s + r.balance, 0));

  /**
   * Formats a number as a German euro amount with two decimals.
   *
   * @param n - Amount to format.
   * @returns The amount as a `1.234,56` string.
   */
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Maps the register type to a German label.
   *
   * @param t - The `type` value from the API.
   * @returns Human-readable German label.
   */
  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';
</script>

<div class="page">
  <div class="page-header"><h1>Soll-Kassenstand</h1></div>

  {#if error}<p class="error-text">{error}</p>{/if}

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if registers.length === 0}
    <p class="muted">Keine Kassen konfiguriert.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Kasse</th>
          <th>Typ</th>
          <th class="num">Einlagen</th>
          <th class="num">Bareinnahmen</th>
          <th class="num">Entnahmen</th>
          <th class="num">Soll-Bestand</th>
        </tr>
      </thead>
      <tbody>
        {#each registers as r}
          <tr>
            <td>{r.name}</td>
            <td>{typeLabel(r.type)}</td>
            <td class="num">{fmt(r.deposits)} €</td>
            <td class="num">{fmt(r.cash_takings)} €</td>
            <td class="num">{fmt(r.withdrawals)} €</td>
            <td class="num balance" class:negative={r.balance < 0}>{fmt(r.balance)} €</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="num muted">Gesamt</td>
          <td class="num balance">{fmt(totalBalance)} €</td>
        </tr>
      </tfoot>
    </table>
    <p class="hint">
      Soll-Bestand = Einlagen + Bareinnahmen − Entnahmen. Details zu einzelnen
      Transaktionen in der Kassenverwaltung.
    </p>
  {/if}
</div>

<style>
  .balance { font-weight: 700; font-size: 1rem; }
  .balance.negative { color: var(--color-danger); }
  tfoot td { border-top: 2px solid var(--color-border); padding-top: 0.75rem; }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin-top: 1rem; }
</style>
