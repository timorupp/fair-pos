<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Event } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let events: Event[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let modalOpen = $state(false);
  let editing: Event | null = $state(null);
  let formName = $state('');
  let formStart = $state('');
  let formEnd = $state('');
  let formError = $state('');
  let saving = $state(false);
  let deleting = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    try { events = await api.admin.events.list(); }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  function toLocalInput(iso: string) {
    return new Date(iso).toISOString().slice(0, 16);
  }

  function openCreate() {
    editing = null; formName = ''; formStart = ''; formEnd = ''; formError = '';
    modalOpen = true;
  }

  function openEdit(ev: Event) {
    editing = ev; formName = ev.name;
    formStart = toLocalInput(ev.start_time); formEnd = toLocalInput(ev.end_time);
    formError = '';
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const data = { name: formName, start_time: new Date(formStart).toISOString(), end_time: new Date(formEnd).toISOString() };
      if (editing) { await api.admin.events.update(editing.id, data); }
      else { await api.admin.events.create(data); }
      modalOpen = false; await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Veranstaltung "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.events.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
</script>

<div class="page">
  <div class="page-header">
    <h1>Veranstaltungen</h1>
    <button class="btn-primary" onclick={openCreate}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if events.length === 0}
    <p class="muted">Noch keine Veranstaltungen angelegt.</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Start</th><th>Ende</th><th></th></tr>
      </thead>
      <tbody>
        {#each events as ev}
          <tr>
            <td>{ev.name}</td>
            <td>{fmtDate(ev.start_time)}</td>
            <td>{fmtDate(ev.end_time)}</td>
            <td class="actions"><button class="btn-ghost" onclick={() => openEdit(ev)}>Bearbeiten</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Veranstaltung bearbeiten' : 'Neue Veranstaltung'}>
  <form onsubmit={preventDefault(save)}>
    <div class="field">
      <label for="ev-name">Name</label>
      <input id="ev-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="ev-start">Start</label>
      <input id="ev-start" type="datetime-local" bind:value={formStart} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="ev-end">Ende</label>
      <input id="ev-end" type="datetime-local" bind:value={formEnd} required disabled={saving || deleting} />
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
  .spacer { flex: 1; }
</style>
