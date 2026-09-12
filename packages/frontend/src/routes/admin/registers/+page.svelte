<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Register, Printer, RegisterType, RegisterLayout } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type RegisterRow = Register & { printer_name: string | null; layout_name: string | null; layout_id: string | null };

  let registers: RegisterRow[] = $state([]);
  let printers: Printer[] = $state([]);
  let layouts: RegisterLayout[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let modalOpen = $state(false);
  let editing: RegisterRow | null = $state(null);
  let formName = $state('');
  let formType = $state('receipt_register');
  let formPrinterId = $state('');
  let formLayoutId = $state('');
  let formActive = $state(true);
  let formTraining = $state(false);
  /** Whether the register being edited already has a booking — locks `formTraining` (Task #130). */
  let trainingLocked = $state(false);
  let formError = $state('');
  let saving = $state(false);
  let deleting = $state(false);

  /** Map from register id → list of pending Z-Bon days (oldest first). Empty array = no rückstand. */
  let pendingByRegister: Record<string, string[]> = $state({});

  onMount(load);

  /** Loads registers, printers, layouts AND the pending-Z-Bon list in parallel. */
  async function load() {
    loading = true;
    try {
      const [regs, prts, lays, pend] = await Promise.all([
        api.admin.registers.list(),
        api.admin.printers.list(),
        api.admin.layouts.list(),
        api.admin.closings.pending(),
      ]);
      registers = regs as RegisterRow[];
      printers = prts;
      layouts = lays;
      pendingByRegister = Object.fromEntries(pend.registers.map((r) => [r.register_id, r.pending_days]));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  function openCreate() {
    editing = null; formName = ''; formType = 'receipt_register'; formPrinterId = ''; formLayoutId = '';
    formActive = true; formTraining = false; trainingLocked = false; formError = '';
    modalOpen = true;
  }

  /**
   * Opens the edit modal for a register — fetches the full detail (Task #130:
   * `has_bookings`) first so the "Trainingskasse" checkbox can be correctly
   * disabled/locked, rather than trusting the list row alone.
   */
  async function openEdit(r: RegisterRow) {
    editing = r; formName = r.name; formType = r.type;
    formPrinterId = r.printer_id ?? ''; formLayoutId = r.layout_id ?? '';
    formActive = r.is_active; formTraining = r.is_training; trainingLocked = false; formError = '';
    modalOpen = true;
    try {
      const detail = await api.admin.registers.get(r.id);
      trainingLocked = detail.has_bookings;
    } catch {
      // Non-fatal — the checkbox just stays unlocked-looking; the PUT itself
      // still enforces the lock server-side regardless.
    }
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const data = {
        name: formName, type: formType as RegisterType,
        printer_id: formPrinterId || null,
        layout_id: formLayoutId || null,
        is_active: formActive,
        is_training: formTraining,
      };
      if (editing) { await api.admin.registers.update(editing.id, data); }
      else { await api.admin.registers.create(data); }
      modalOpen = false; await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Kasse "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.registers.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }

  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';
</script>

<div class="page">
  <div class="page-header">
    <h1>Kassen</h1>
    <div class="header-actions">
      <button class="btn-primary" onclick={openCreate}>+ Neu</button>
    </div>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Typ</th><th>Drucker</th><th>Layout</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        {#each registers as r}
          {@const pending = pendingByRegister[r.id] ?? []}
          <tr class:locked-row={pending.length > 0} class:inactive={!r.is_active}>
            <td>{r.name}</td>
            <td>{typeLabel(r.type)}</td>
            <td>{r.printer_name ?? '—'}</td>
            <td>{r.layout_name ?? '—'}</td>
            <td>
              {#if !r.is_active}
                <span class="archived-badge">Archiviert</span>
              {:else if pending.length > 0}
                <span class="lock-badge" title={pending.join(', ')}>
                  🔒 {pending.length} Tag{pending.length === 1 ? '' : 'e'} ausstehend
                </span>
              {:else}
                <span class="muted small">aktiv</span>
              {/if}
              {#if r.is_training}
                <span class="training-badge">Training</span>
              {/if}
            </td>
            <td class="actions">
              <a href="/admin/registers/{r.id}" class="btn-ghost">Detail</a>
              <button class="btn-ghost" onclick={() => openEdit(r)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Kasse bearbeiten' : 'Neue Kasse'}>
  <form onsubmit={preventDefault(save)}>
    <div class="field">
      <label for="reg-name">Name</label>
      <input id="reg-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="reg-type">Typ</label>
      <select id="reg-type" bind:value={formType} disabled={saving || deleting}>
        <option value="receipt_register">Bonkasse</option>
        <option value="service_register">Bedienungskasse</option>
      </select>
    </div>
    {#if formType === 'receipt_register'}
      <div class="field">
        <label for="reg-printer">Drucker</label>
        <select id="reg-printer" bind:value={formPrinterId} disabled={saving || deleting}>
          <option value="">— Standarddrucker verwenden —</option>
          {#each printers as p}
            <option value={p.id}>{p.name}{p.is_default ? ' (Standard)' : ''}</option>
          {/each}
        </select>
      </div>
    {/if}
    <div class="field">
      <label for="reg-layout">Kassenlayout (optional, überschreibt Standardlayout)</label>
      <select id="reg-layout" bind:value={formLayoutId} disabled={saving || deleting}>
        <option value="">— Standardlayout —</option>
        {#each layouts as l}
          <option value={l.id}>{l.name} ({l.grid_cols}×{l.grid_rows})</option>
        {/each}
      </select>
    </div>
    <div class="field-check">
      <input type="checkbox" id="reg-active" bind:checked={formActive} disabled={saving || deleting} />
      <label for="reg-active">Aktiv</label>
    </div>
    {#if editing && !formActive}
      <p class="hint">Archivierte Kassen verschwinden aus dem Kassen-Login, bleiben aber in Auswertungen und Exporten sichtbar.</p>
    {/if}
    <div class="field-check">
      <input
        type="checkbox" id="reg-training" bind:checked={formTraining}
        disabled={saving || deleting || trainingLocked}
        title={trainingLocked ? 'Diese Kasse hat bereits Buchungen — der Trainingsmodus kann nicht mehr umgeschaltet werden.' : ''}
      />
      <label for="reg-training">Trainingskasse</label>
    </div>
    {#if trainingLocked}
      <p class="hint">Diese Kasse hat bereits Buchungen — der Trainingsmodus ist gesperrt und kann nicht mehr umgeschaltet werden.</p>
    {:else}
      <p class="hint">Buchungen auf einer Trainingskasse werden weiterhin TSE-signiert und protokolliert (DSFinV-K BON_TYP=AVTraining), zählen aber nicht in Kassenabschluss/Umsatz. Sobald die Kasse eine erste Buchung hat, ist dieses Feld gesperrt.</p>
    {/if}
    {#if formError}<p class="error-text">{formError}</p>{/if}
    <div class="modal-actions">
      {#if editing}
        <button type="button" class="btn-ghost danger" onclick={remove} disabled={saving || deleting}>
          {deleting ? 'Löschen…' : 'Löschen'}
        </button>
      {/if}
      <div class="spacer"></div>
      <button type="button" class="btn-ghost" onclick={() => (modalOpen = false)} disabled={saving || deleting}>Abbrechen</button>
      <button type="submit" class="btn-primary" disabled={saving || deleting}>{saving ? 'Speichern…' : 'Speichern'}</button>
    </div>
  </form>
</Modal>

<style>
  .spacer { flex: 1; }
  .header-actions { display: flex; gap: 0.5rem; align-items: center; }
  .lock-badge { color: #c87a00; font-weight: 600; font-size: 0.85rem; }
  .small { font-size: 0.85rem; }
  tr.locked-row { background: #f59e0b11; }
  tr.inactive td { opacity: 0.45; }
  .archived-badge {
    font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px;
    color: var(--color-text-muted);
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
  }
  .training-badge {
    display: inline-block; margin-left: 0.4rem;
    font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px;
    color: #dc2626;
    background: #dc262622;
    border: 1px solid #dc262688;
  }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }
</style>
