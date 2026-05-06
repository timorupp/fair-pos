<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import type { CashTransaction } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type RegisterDetail = {
    id: string; name: string; type: string;
    printer_name: string | null;
    total_deposits: number; total_withdrawals: number;
  };

  let register: RegisterDetail | null = null;
  let transactions: CashTransaction[] = [];
  let loading = true;
  let error = '';

  let txModal = false;
  let txType: 'deposit' | 'withdrawal' = 'deposit';
  let txAmount = '';
  let txNote = '';
  let txError = '';
  let txSaving = false;

  $: id = ($page.params['id'] ?? '') as string;

  onMount(load);

  async function load() {
    loading = true;
    try {
      [register, transactions] = await Promise.all([
        api.admin.registers.get(id),
        api.admin.registers.listTransactions(id),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  function openDeposit() { txType = 'deposit'; txAmount = ''; txNote = ''; txError = ''; txModal = true; }
  function openWithdrawal() { txType = 'withdrawal'; txAmount = ''; txNote = ''; txError = ''; txModal = true; }

  async function addTransaction() {
    txError = ''; txSaving = true;
    const amount = parseFloat(txAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { txError = 'Ungültiger Betrag'; txSaving = false; return; }
    try {
      const txData: { type: 'deposit' | 'withdrawal'; amount: number; note?: string } = { type: txType, amount };
      if (txNote) txData.note = txNote;
      await api.admin.registers.addTransaction(id, txData);
      txModal = false; await load();
    } catch (e) {
      txError = e instanceof Error ? e.message : 'Fehler';
    } finally { txSaving = false; }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2 });
  const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';
  const txLabel = (t: string) => t === 'deposit' ? 'Einlage' : 'Entnahme';
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

    <div class="balance-card">
      <div class="balance-row">
        <span>Einlagen gesamt</span>
        <span class="num amount-positive">+ {fmt(register.total_deposits)} €</span>
      </div>
      <div class="balance-row">
        <span>Entnahmen gesamt</span>
        <span class="num amount-negative">− {fmt(register.total_withdrawals)} €</span>
      </div>
      <div class="balance-row total">
        <span>Saldo</span>
        <span class="num">{fmt(register.total_deposits - register.total_withdrawals)} €</span>
      </div>
    </div>

    <div class="tx-actions">
      <button class="btn-primary" on:click={openDeposit}>+ Einlage / Wechselgeld</button>
      <button class="btn-ghost" on:click={openWithdrawal}>Entnahme</button>
    </div>

    <h2 class="section-title">Transaktionshistorie</h2>
    {#if transactions.length === 0}
      <p class="muted">Noch keine Transaktionen.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Datum</th><th>Typ</th><th>Benutzer</th><th>Notiz</th><th class="num">Betrag</th></tr>
        </thead>
        <tbody>
          {#each transactions as tx}
            <tr>
              <td>{fmtDate(tx.created_at)}</td>
              <td>{txLabel(tx.type)}</td>
              <td>{tx.user_name ?? '—'}</td>
              <td>{tx.note ?? '—'}</td>
              <td class="num" class:amount-positive={tx.type === 'deposit'} class:amount-negative={tx.type === 'withdrawal'}>
                {tx.type === 'deposit' ? '+' : '−'} {fmt(tx.amount)} €
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

<Modal bind:open={txModal} title={txType === 'deposit' ? 'Einlage / Wechselgeld' : 'Entnahme'}>
  <form on:submit|preventDefault={addTransaction}>
    <div class="field">
      <label for="tx-amount">Betrag (€)</label>
      <input id="tx-amount" inputmode="decimal" bind:value={txAmount} placeholder="0,00" required disabled={txSaving} />
    </div>
    <div class="field">
      <label for="tx-note">Notiz (optional)</label>
      <input id="tx-note" bind:value={txNote} disabled={txSaving} placeholder="z. B. Wechselgeld Abend" />
    </div>
    {#if txError}<p class="error-text">{txError}</p>{/if}
    <div class="modal-actions">
      <div class="spacer"></div>
      <button type="button" class="btn-ghost" on:click={() => (txModal = false)} disabled={txSaving}>Abbrechen</button>
      <button type="submit" class="btn-primary" disabled={txSaving}>{txSaving ? 'Speichern…' : 'Buchen'}</button>
    </div>
  </form>
</Modal>

<style>
  .back-link { font-size: 0.8rem; color: var(--color-text-muted); text-decoration: none; }
  .back-link:hover { color: var(--color-text); }
  .balance-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.25rem 1.5rem;
    display: flex; flex-direction: column; gap: 0.6rem; max-width: 400px;
  }
  .balance-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
  .balance-row.total { border-top: 1px solid var(--color-border); padding-top: 0.6rem; font-weight: 600; }
  .amount-positive { color: #4caf7d; }
  .amount-negative { color: var(--color-danger); }
  .tx-actions { display: flex; gap: 0.5rem; }
  .section-title { font-size: 0.9rem; font-weight: 600; color: var(--color-text-muted); }
  .spacer { flex: 1; }
</style>
