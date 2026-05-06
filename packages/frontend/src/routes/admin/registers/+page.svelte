<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Register, Printer, RegisterType } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type RegisterRow = Register & { printer_name: string | null };

  let registers: RegisterRow[] = [];
  let printers: Printer[] = [];
  let loading = true;
  let error = '';

  let modalOpen = false;
  let editing: RegisterRow | null = null;
  let formName = '';
  let formType = 'receipt_register';
  let formPrinterId = '';
  let formError = '';
  let saving = false;
  let deleting = false;

  onMount(load);

  async function load() {
    loading = true;
    try {
      [registers, printers] = await Promise.all([
        api.admin.registers.list(),
        api.admin.printers.list(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  function openCreate() {
    editing = null; formName = ''; formType = 'receipt_register'; formPrinterId = ''; formError = '';
    modalOpen = true;
  }

  function openEdit(r: RegisterRow) {
    editing = r; formName = r.name; formType = r.type;
    formPrinterId = r.printer_id ?? ''; formError = '';
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const data = { name: formName, type: formType as RegisterType, printer_id: formPrinterId || null };
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
    <button class="btn-primary" on:click={openCreate}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Typ</th><th>Drucker</th><th></th></tr>
      </thead>
      <tbody>
        {#each registers as r}
          <tr>
            <td>{r.name}</td>
            <td>{typeLabel(r.type)}</td>
            <td>{r.printer_name ?? '—'}</td>
            <td class="actions">
              <a href="/admin/registers/{r.id}" class="btn-ghost">Detail</a>
              <button class="btn-ghost" on:click={() => openEdit(r)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Kasse bearbeiten' : 'Neue Kasse'}>
  <form on:submit|preventDefault={save}>
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
    <div class="field">
      <label for="reg-printer">Drucker (optional)</label>
      <select id="reg-printer" bind:value={formPrinterId} disabled={saving || deleting}>
        <option value="">— kein Drucker —</option>
        {#each printers as p}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
    {#if formError}<p class="error-text">{formError}</p>{/if}
    <div class="modal-actions">
      {#if editing}
        <button type="button" class="btn-ghost danger" on:click={remove} disabled={saving || deleting}>
          {deleting ? 'Löschen…' : 'Löschen'}
        </button>
      {/if}
      <div class="spacer"></div>
      <button type="button" class="btn-ghost" on:click={() => (modalOpen = false)} disabled={saving || deleting}>Abbrechen</button>
      <button type="submit" class="btn-primary" disabled={saving || deleting}>{saving ? 'Speichern…' : 'Speichern'}</button>
    </div>
  </form>
</Modal>

<style>

  .spacer { flex: 1; }
</style>
