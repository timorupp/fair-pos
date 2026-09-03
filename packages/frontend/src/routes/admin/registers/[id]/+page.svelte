<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import type { CashTransaction } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type RegisterDetail = {
    id: string; name: string; type: string;
    printer_name: string | null;
    /** Either the assigned printer or — if none — the system-default printer. */
    effective_printer_name: string | null;
    total_deposits: number; total_withdrawals: number;
  };

  type ClosingRow = {
    id: string; z_number: number;
    created_at: string; business_date: string;
    is_zero_closing: boolean;
    total_gross: number; total_cash: number; total_cancellations: number;
    created_by_name: string;
  };

  let register: RegisterDetail | null = $state(null);
  let transactions: CashTransaction[] = $state([]);
  let closings: ClosingRow[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let txModal = $state(false);
  let txType: 'deposit' | 'withdrawal' = $state('deposit');
  let txAmount = $state('');
  let txNote = $state('');
  let txError = $state('');
  let txSaving = $state(false);

  let closing = $state(false);
  let closingError = $state('');
  /** One entry per Z-Bon produced by the last "jetzt abschließen" click — usually one, but more than one when the register had unassigned invoices from more than one calendar day (Task #106: one Z-Bon per day, not a single lump closing wrongly dated as today). */
  let lastClosings: { z_number: number; is_zero_closing: boolean; print_job_id: string | null }[] = $state([]);

  /** Past calendar days that still need a Z-Bon (oldest first). */
  let pendingDays: string[] = $state([]);
  let catchingUp = $state(false);
  let catchUpError = $state('');

  let id = $derived(($page.params['id'] ?? '') as string);

  /**
   * Most recent closing whose `created_at` falls on the current local calendar day,
   * used by the UI to warn the operator about a duplicate Z-Bon issuance.
   * `null` when no closing exists for today.
   */
  let closedToday = $derived((() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = today.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return closings.find((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t < end;
    }) ?? null;
  })());

  onMount(load);

  /** Loads register details, cash transactions, past closings AND the pending-day list in parallel. */
  async function load() {
    loading = true;
    try {
      const [reg, txs, cls, pend] = await Promise.all([
        api.admin.registers.get(id),
        api.admin.registers.listTransactions(id),
        api.admin.closings.listForRegister(id),
        api.admin.closings.pending(),
      ]);
      register = reg;
      transactions = txs;
      closings = cls.closings;
      pendingDays = pend.registers.find((r) => r.register_id === id)?.pending_days ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  /**
   * Catches up every outstanding past day for this register in oldest-first order.
   * Each day produces a separate Z-Bon. Stops on the first error so the operator
   * can intervene.
   */
  async function catchUp() {
    if (pendingDays.length === 0) return;
    if (!confirm(`Für die ${pendingDays.length} ausstehenden Tage jeweils einen Z-Bon erstellen?`)) return;
    catchingUp = true; catchUpError = '';
    try {
      await api.admin.closings.closePending(id);
      await load();
    } catch (e) {
      catchUpError = e instanceof Error ? e.message : 'Fehler';
      await load();
    } finally { catchingUp = false; }
  }

  /**
   * Closes the day for this register and reloads the page state.
   * Shows the operator the new Z-number and whether a print job was queued.
   */
  async function closeDay() {
    if (!confirm('Tagesabschluss jetzt durchführen?')) return;
    closing = true; closingError = ''; lastClosings = [];
    try {
      const result = await api.admin.closings.closeRegister(id);
      lastClosings = result.closings;
      await load();
    } catch (e) {
      closingError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      closing = false;
    }
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
  /** Formats a `YYYY-MM-DD` business-date as `DD.MM.YYYY` without timezone games. */
  function fmtBusinessDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }
  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';
  const txLabel = (t: string) => t === 'deposit' ? 'Einlage' : 'Entnahme';

  /** Tracks which closing row is being reprinted so we can disable its button. */
  let reprintingClosingId: string | null = $state(null);
  let reprintClosingError = $state('');

  /**
   * Re-queues an ESC/POS print job for the given Z-Bon.
   *
   * @param closingId - The closing row id.
   */
  async function reprintClosing(closingId: string): Promise<void> {
    reprintingClosingId = closingId; reprintClosingError = '';
    try {
      await api.admin.closings.reprint(closingId);
    } catch (e) {
      reprintClosingError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      reprintingClosingId = null;
    }
  }
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
      <button class="btn-primary" onclick={openDeposit}>+ Einlage / Wechselgeld</button>
      <button class="btn-ghost" onclick={openWithdrawal}>Entnahme</button>
    </div>

    {#if pendingDays.length > 0}
      <section class="catchup-card">
        <h3>🔒 Kasse gesperrt — {pendingDays.length} Tag{pendingDays.length === 1 ? '' : 'e'} ausstehend</h3>
        <p>
          Bevor an dieser Kasse weiter kassiert werden kann, müssen die Tagesabschlüsse
          für folgende Kalendertage nachgeholt werden:
        </p>
        <ul class="pending-list">
          {#each pendingDays as day}
            <li>{day}</li>
          {/each}
        </ul>
        <button class="btn-primary" onclick={catchUp} disabled={catchingUp}>
          {catchingUp ? 'Hole nach…' : `Alle ${pendingDays.length} Z-Bons jetzt erstellen`}
        </button>
        {#if catchUpError}<p class="error-text">{catchUpError}</p>{/if}
      </section>
    {/if}

    <h2 class="section-title">Tagesabschluss</h2>
    <div class="closing-actions">
      <button class="btn-primary" onclick={closeDay} disabled={closing || pendingDays.length > 0}>
        {closing ? 'Wird abgeschlossen…' : 'Tagesabschluss jetzt durchführen'}
      </button>
      {#if pendingDays.length > 0}
        <p class="warn small">Erst die ausstehenden Tage oben nachholen, dann kann der heutige Tag manuell abgeschlossen werden.</p>
      {/if}
      {#if closedToday}
        <p class="warn small">Heute wurde für diese Kasse bereits ein Abschluss erstellt (Z-Nr. {closedToday.z_number}). Ein erneuter Abschluss vergibt eine neue Z-Nummer.</p>
      {/if}
      {#if !register?.effective_printer_name}
        <p class="muted small">Weder dieser Kasse noch dem System ist ein Drucker zugeordnet — der Z-Bon wird nicht gedruckt, sondern nur gespeichert.</p>
      {:else if !register?.printer_name}
        <p class="muted small">Diese Kasse hat keinen eigenen Drucker — der Z-Bon wird auf dem Standarddrucker „{register.effective_printer_name}" gedruckt.</p>
      {/if}
    </div>
    {#if closingError}<p class="error-text">{closingError}</p>{/if}
    {#if lastClosings.length === 1}
      <p class="success-text small">
        ✓ Z-Bon Nr. {lastClosings[0]!.z_number} erstellt{lastClosings[0]!.is_zero_closing ? ' (Nullabschluss)' : ''}{lastClosings[0]!.print_job_id ? ' und in Druckwarteschlange gestellt' : ''}.
      </p>
    {:else if lastClosings.length > 1}
      <p class="success-text small">
        ✓ {lastClosings.length} Z-Bons erstellt (Nr. {lastClosings.map((c) => c.z_number).join(', ')}) —
        die Kasse hatte unzugeordnete Rechnungen von mehr als einem Kalendertag, jeder Tag hat jetzt seinen eigenen Z-Bon.
      </p>
    {/if}

    {#if closings.length > 0}
      <table class="closings-table">
        <thead>
          <tr>
            <th class="num">Z-Nr.</th>
            <th>Geschäftstag</th>
            <th>Erstellt</th>
            <th>Benutzer</th>
            <th class="num">Brutto</th>
            <th class="num">Bar</th>
            <th class="num">Stornos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each closings as c}
            <tr class:zero={c.is_zero_closing}>
              <td class="num">{c.z_number}</td>
              <td>{fmtBusinessDate(c.business_date)}</td>
              <td>{fmtDate(c.created_at)}</td>
              <td>{c.created_by_name}</td>
              <td class="num">{fmt(c.total_gross)} €</td>
              <td class="num">{fmt(c.total_cash)} €</td>
              <td class="num">{fmt(c.total_cancellations)} €</td>
              <td class="actions">
                <a class="btn-ghost" href={api.admin.closings.pdfUrl(c.id)} target="_blank" rel="noopener">PDF</a>
                <a class="btn-ghost" href={api.admin.closings.dsfinvkUrl(c.id)} rel="noopener" title="DSFinV-K-Export (ZIP)">DSFinV-K</a>
                <button class="btn-ghost" onclick={() => reprintClosing(c.id)} disabled={reprintingClosingId === c.id}>
                  {reprintingClosingId === c.id ? '…' : 'Drucken'}
                </button>
                {#if c.is_zero_closing}<span class="muted small">Null</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if reprintClosingError}<p class="error-text small">{reprintClosingError}</p>{/if}
    {/if}

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
  <form onsubmit={preventDefault(addTransaction)}>
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
      <button type="button" class="btn-ghost" onclick={() => (txModal = false)} disabled={txSaving}>Abbrechen</button>
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
  .section-title { font-size: 0.9rem; font-weight: 600; color: var(--color-text-muted); margin-top: 1.5rem; }
  .spacer { flex: 1; }
  .closing-actions { display: flex; flex-direction: column; gap: 0.4rem; }
  .small { font-size: 0.85rem; }
  .success-text { color: #4caf7d; font-size: 0.85rem; }
  .closings-table tr.zero { color: var(--color-text-muted); }
  .warn { color: #c87a00; }
  .catchup-card {
    background: #f59e0b22; border: 1px solid #f59e0b88; border-radius: var(--radius);
    padding: 1rem 1.25rem; margin: 1rem 0; max-width: 600px;
  }
  .catchup-card h3 { margin: 0 0 0.5rem 0; font-size: 1rem; color: #c87a00; }
  .catchup-card p { margin: 0.25rem 0 0.5rem 0; font-size: 0.9rem; }
  .pending-list { margin: 0 0 0.75rem 1.25rem; font-family: monospace; font-size: 0.9rem; }
</style>
