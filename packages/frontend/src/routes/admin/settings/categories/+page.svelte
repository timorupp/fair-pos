<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { ArticleCategory, TaxCategory } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let categories: ArticleCategory[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  /** Currently configured percentages, used only to annotate the select options. */
  let vatRateStandard = $state('19');
  let vatRateReduced = $state('7');

  let modalOpen = $state(false);
  let editing: ArticleCategory | null = $state(null);
  let formName = $state('');
  let formTaxCategory: TaxCategory = $state('standard');
  let formError = $state('');
  let saving = $state(false);
  let deleting = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    try {
      const [cats, settings] = await Promise.all([api.admin.categories.list(), api.admin.settings.get()]);
      categories = cats;
      vatRateStandard = settings['vat_rate_standard'] ?? '19';
      vatRateReduced = settings['vat_rate_reduced'] ?? '7';
    } catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  /**
   * German label for a tax category, annotated with the currently configured
   * percentage (0% for `zero`, since that one is fixed by law).
   *
   * @param cat - The tax category to label.
   * @returns Display label, e.g. "Regelsteuersatz (19 %)".
   */
  function taxCategoryLabel(cat: TaxCategory): string {
    if (cat === 'standard') return `Regelsteuersatz (${vatRateStandard} %)`;
    if (cat === 'reduced') return `Ermäßigt (${vatRateReduced} %)`;
    return 'Steuerfrei (0 %)';
  }

  function openCreate() {
    editing = null; formName = ''; formTaxCategory = 'standard'; formError = '';
    modalOpen = true;
  }

  function openEdit(c: ArticleCategory) {
    editing = c; formName = c.name; formTaxCategory = c.tax_category; formError = '';
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      if (editing) {
        await api.admin.categories.update(editing.id, { name: formName, tax_category: formTaxCategory });
      } else {
        await api.admin.categories.create({ name: formName, tax_category: formTaxCategory });
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
    <button class="btn-primary" onclick={openCreate}>+ Neu</button>
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
            <td class="num">{taxCategoryLabel(c.tax_category)}</td>
            <td class="actions">
              <button class="btn-ghost" onclick={() => openEdit(c)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Artikelgruppe bearbeiten' : 'Neue Artikelgruppe'}>
  <form onsubmit={preventDefault(save)}>
    <div class="field">
      <label for="cat-name">Name</label>
      <input id="cat-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="cat-tax">Steuersatz</label>
      <select id="cat-tax" bind:value={formTaxCategory} required disabled={saving || deleting}>
        <option value="standard">{taxCategoryLabel('standard')}</option>
        <option value="reduced">{taxCategoryLabel('reduced')}</option>
        <option value="zero">{taxCategoryLabel('zero')}</option>
      </select>
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
