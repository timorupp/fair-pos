<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Printer } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let printers: Printer[] = [];
  let loading = true;
  let error = '';

  let modalOpen = false;
  let editing: Printer | null = null;
  let formName = '';
  let formIp = '';
  let formPort = 9100;
  let formDefault = false;
  let formError = '';
  let saving = false;
  let deleting = false;

  onMount(load);

  async function load() {
    loading = true;
    try { printers = await api.admin.printers.list(); }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  function openCreate() {
    editing = null; formName = ''; formIp = ''; formPort = 9100; formDefault = false; formError = '';
    modalOpen = true;
  }

  function openEdit(p: Printer) {
    editing = p; formName = p.name; formIp = p.ip_address; formPort = p.port;
    formDefault = p.is_default; formError = '';
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const data = { name: formName, ip_address: formIp, port: formPort, is_default: formDefault };
      if (editing) { await api.admin.printers.update(editing.id, data); }
      else { await api.admin.printers.create(data); }
      modalOpen = false; await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Drucker "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.printers.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Drucker</h1>
    <button class="btn-primary" on:click={openCreate}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>IP-Adresse</th><th class="num">Port</th><th>Standard</th><th></th></tr>
      </thead>
      <tbody>
        {#each printers as p}
          <tr>
            <td>{p.name}</td>
            <td>{p.ip_address}</td>
            <td class="num">{p.port}</td>
            <td>{p.is_default ? '✓' : ''}</td>
            <td class="actions">
              <button class="btn-ghost" on:click={() => openEdit(p)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Drucker bearbeiten' : 'Neuer Drucker'}>
  <form on:submit|preventDefault={save}>
    <div class="field">
      <label for="pr-name">Name</label>
      <input id="pr-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="pr-ip">IP-Adresse</label>
      <input id="pr-ip" bind:value={formIp} placeholder="192.168.1.100" required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="pr-port">Port</label>
      <input id="pr-port" type="number" bind:value={formPort} min="1" max="65535" required disabled={saving || deleting} />
    </div>
    <div class="field-check">
      <input type="checkbox" id="pr-default" bind:checked={formDefault} disabled={saving || deleting} />
      <label for="pr-default">Standarddrucker</label>
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
