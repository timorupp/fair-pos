<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { CancellationReason, BookingType } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let reasons: CancellationReason[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let modalOpen = $state(false);
  let editing: CancellationReason | null = $state(null);
  let formName = $state('');
  let formBookingType = $state('cancellation');
  let formActive = $state(true);
  let formError = $state('');
  let saving = $state(false);
  let deleting = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    try { reasons = await api.admin.cancellationReasons.list(); }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  function openCreate() {
    editing = null; formName = ''; formBookingType = 'cancellation'; formActive = true; formError = '';
    modalOpen = true;
  }

  function openEdit(r: CancellationReason) {
    editing = r; formName = r.name; formBookingType = r.booking_type; formActive = r.is_active; formError = '';
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const data = { name: formName, booking_type: formBookingType as BookingType, is_active: formActive };
      if (editing) { await api.admin.cancellationReasons.update(editing.id, data); }
      else { await api.admin.cancellationReasons.create(data); }
      modalOpen = false; await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Stornogrund "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.cancellationReasons.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }

  const typeLabel = (t: string) => t === 'cancellation' ? 'Storno' : '100 % Rabatt';
</script>

<div class="page">
  <div class="page-header">
    <h1>Stornogründe</h1>
    <button class="btn-primary" onclick={openCreate}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if reasons.length === 0}
    <p class="muted">Noch keine Stornogründe angelegt.</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Buchungsart</th><th>Aktiv</th><th></th></tr>
      </thead>
      <tbody>
        {#each reasons as r}
          <tr class:inactive={!r.is_active}>
            <td>{r.name}</td>
            <td>{typeLabel(r.booking_type)}</td>
            <td>{r.is_active ? '✓' : ''}</td>
            <td class="actions"><button class="btn-ghost" onclick={() => openEdit(r)}>Bearbeiten</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Stornogrund bearbeiten' : 'Neuer Stornogrund'}>
  <form onsubmit={preventDefault(save)}>
    <div class="field">
      <label for="cr-name">Name</label>
      <input id="cr-name" bind:value={formName} required disabled={saving || deleting}
             placeholder="z. B. Nicht geliefert" />
    </div>
    <div class="field">
      <label for="cr-type">Buchungsart</label>
      <select id="cr-type" bind:value={formBookingType} disabled={saving || deleting}>
        <option value="cancellation">Storno — kein Beleg, keine TSE-Transaktion</option>
        <option value="free_of_charge">100 % Rabatt — 0 €-Beleg mit TSE-Buchung</option>
      </select>
    </div>
    <div class="field-check">
      <input type="checkbox" id="cr-active" bind:checked={formActive} disabled={saving || deleting} />
      <label for="cr-active">Aktiv</label>
    </div>
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
  .inactive td { opacity: 0.45; }
  .spacer { flex: 1; }
</style>
