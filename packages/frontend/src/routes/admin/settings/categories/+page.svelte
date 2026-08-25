<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { ArticleCategory } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let categories: ArticleCategory[] = [];
  let loading = true;
  let error = '';

  let modalOpen = false;
  let editing: ArticleCategory | null = null;
  let formName = '';
  let formTaxRate = '';
  let formError = '';
  let saving = false;
  let deleting = false;

  onMount(load);

  async function load() {
    loading = true;
    try { categories = await api.admin.categories.list(); }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  function openCreate() {
    editing = null; formName = ''; formTaxRate = '19'; formError = '';
    modalOpen = true;
  }

  function openEdit(c: ArticleCategory) {
    editing = c; formName = c.name; formTaxRate = String(c.tax_rate); formError = '';
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const tax_rate = parseFloat(formTaxRate.replace(',', '.'));
      if (isNaN(tax_rate) || tax_rate < 0 || tax_rate > 100) {
        formError = 'Ungültiger Steuersatz'; saving = false; return;
      }
      if (editing) {
        await api.admin.categories.update(editing.id, { name: formName, tax_rate });
      } else {
        await api.admin.categories.create({ name: formName, tax_rate });
      }
      modalOpen = false;
      await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Artikelgruppe "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.categories.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Artikelgruppen</h1>
    <button class="btn-primary" on:click={openCreate}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th class="num">Steuersatz</th><th></th></tr>
      </thead>
      <tbody>
        {#each categories as c}
          <tr>
            <td>{c.name}</td>
            <td class="num">{c.tax_rate} %</td>
            <td class="actions">
              <button class="btn-ghost" on:click={() => openEdit(c)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Artikelgruppe bearbeiten' : 'Neue Artikelgruppe'}>
  <form on:submit|preventDefault={save}>
    <div class="field">
      <label for="cat-name">Name</label>
      <input id="cat-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="cat-tax">Steuersatz (%)</label>
      <input id="cat-tax" inputmode="decimal" bind:value={formTaxRate}
             placeholder="z. B. 19 oder 7,5" required disabled={saving || deleting} />
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
