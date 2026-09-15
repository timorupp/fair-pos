<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Article, ArticleCategory, Printer, ProductOption, TaxCategory } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type ArticleRow = Article & { category_name: string; tax_category: TaxCategory };

  /** German label per tax category, used in the category-selection dropdown. */
  const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
    zero: 'steuerfrei', reduced: 'ermäßigt', standard: 'Regelsteuersatz',
  };

  let articles: ArticleRow[] = $state([]);
  let categories: ArticleCategory[] = $state([]);
  let printers: Printer[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let modalOpen = $state(false);
  let editing: ArticleRow | null = $state(null);
  let formName = $state('');
  let formCategoryId = $state('');
  let formPrice = $state('');
  let formDepositPrice = $state('');
  let formPrintDepositReceipt = $state(false);
  let formPrinterId = $state('');
  let formActive = $state(true);
  let formSkipPickupSlip = $state(false);
  let formError = $state('');
  let saving = $state(false);
  let deleting = $state(false);

  /** Product options for the currently-edited article (empty for "new" articles). */
  let options: ProductOption[] = $state([]);
  let optionsLoading = $state(false);
  let newOptionName = $state('');
  let addingOption = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    try {
      const [loadedArticles, loadedCategories, loadedPrinters] = await Promise.all([
        api.admin.articles.list(),
        api.admin.categories.list(),
        api.admin.printers.list(),
      ]);
      articles = loadedArticles.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      categories = loadedCategories;
      printers = loadedPrinters;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  }

  function parseDE(s: string): number {
    return parseFloat(s.replace(',', '.'));
  }

  function openCreate() {
    editing = null;
    formName = ''; formCategoryId = categories[0]?.id ?? '';
    formPrice = ''; formDepositPrice = ''; formPrintDepositReceipt = false;
    formPrinterId = ''; formActive = true; formSkipPickupSlip = false; formError = '';
    options = []; newOptionName = '';
    modalOpen = true;
  }

  async function openEdit(a: ArticleRow) {
    editing = a;
    formName = a.name;
    formCategoryId = a.category_id;
    formPrice = String(a.price).replace('.', ',');
    formDepositPrice = a.deposit_price !== null ? String(a.deposit_price).replace('.', ',') : '';
    formPrintDepositReceipt = a.print_deposit_receipt;
    formPrinterId = a.printer_id ?? '';
    formActive = a.is_active;
    formSkipPickupSlip = a.skip_pickup_slip;
    formError = '';
    newOptionName = '';
    modalOpen = true;
    await loadOptions();
  }

  /** Loads the product options for the currently-edited article. Silent on errors — the section just stays empty. */
  async function loadOptions() {
    if (!editing) { options = []; return; }
    optionsLoading = true;
    try { options = await api.admin.articles.listOptions(editing.id); }
    catch { options = []; }
    finally { optionsLoading = false; }
  }

  /**
   * Adds a new product option to the currently-edited article. Validates that the
   * input is non-empty and refreshes the list on success.
   */
  async function addOption() {
    if (!editing || !newOptionName.trim()) return;
    addingOption = true;
    try {
      await api.admin.articles.createOption(editing.id, { name: newOptionName.trim() });
      newOptionName = '';
      await loadOptions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Fehler');
    } finally { addingOption = false; }
  }

  /**
   * Removes a product option after operator confirmation.
   *
   * @param opt - The option to delete.
   */
  async function removeOption(opt: ProductOption) {
    if (!editing) return;
    if (!confirm(`Option "${opt.name}" wirklich löschen?`)) return;
    try {
      await api.admin.articles.deleteOption(editing.id, opt.id);
      await loadOptions();
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  async function save() {
    formError = ''; saving = true;
    const price = parseDE(formPrice);
    if (isNaN(price)) { formError = 'Ungültiger Preis'; saving = false; return; }
    const depositPrice = formDepositPrice !== '' ? parseDE(formDepositPrice) : null;
    if (depositPrice !== null && isNaN(depositPrice)) { formError = 'Ungültiger Pfandbetrag'; saving = false; return; }
    try {
      const data = {
        name: formName,
        category_id: formCategoryId,
        price,
        deposit_price: depositPrice,
        print_deposit_receipt: formPrintDepositReceipt,
        printer_id: formPrinterId || null,
        is_active: formActive,
        skip_pickup_slip: formSkipPickupSlip,
      };
      if (editing) { await api.admin.articles.update(editing.id, data); }
      else { await api.admin.articles.create(data); }
      modalOpen = false; await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Artikel "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.articles.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2 });
</script>

<div class="page">
  <div class="page-header">
    <h1>Artikel</h1>
    <button class="btn-primary" onclick={openCreate} disabled={categories.length === 0}>+ Neu</button>
  </div>

  {#if categories.length === 0 && !loading}
    <p class="muted">Bitte zuerst eine Artikelgruppe anlegen.</p>
  {:else if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Artikelgruppe</th><th class="num">Preis</th><th class="num">Pfand</th><th>Aktiv</th><th></th></tr>
      </thead>
      <tbody>
        {#each articles as a}
          <tr class:inactive={!a.is_active}>
            <td>{a.name}</td>
            <td>{a.category_name}</td>
            <td class="num">{fmt(a.price)} €</td>
            <td class="num">{a.deposit_price !== null ? fmt(a.deposit_price) + ' €' : '—'}</td>
            <td>{a.is_active ? '✓' : ''}</td>
            <td class="actions">
              <button class="btn-ghost" onclick={() => openEdit(a)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Artikel bearbeiten' : 'Neuer Artikel'}>
  <form onsubmit={preventDefault(save)}>
    <div class="field">
      <label for="art-name">Name</label>
      <input id="art-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="art-cat">Artikelgruppe</label>
      <select id="art-cat" bind:value={formCategoryId} required disabled={saving || deleting}>
        {#each categories as c}
          <option value={c.id}>{c.name} ({TAX_CATEGORY_LABELS[c.tax_category]})</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <label for="art-price">Preis (€)</label>
      <input id="art-price" inputmode="decimal" bind:value={formPrice} placeholder="0,00" required disabled={saving || deleting} />
    </div>
    <div class="field">
      <label for="art-deposit">Pfandbetrag (€, optional; negativ für Leergutrückgabe)</label>
      <input id="art-deposit" inputmode="decimal" bind:value={formDepositPrice} placeholder="—" disabled={saving || deleting} />
    </div>
    {#if formDepositPrice !== ''}
      <div class="field-check">
        <input type="checkbox" id="art-deposit-sep" bind:checked={formPrintDepositReceipt} disabled={saving || deleting} />
        <label for="art-deposit-sep">Pfandbon separat drucken</label>
      </div>
    {/if}
    <div class="field">
      <label for="art-printer">Bestelldrucker (optional)</label>
      <select id="art-printer" bind:value={formPrinterId} disabled={saving || deleting}>
        <option value="">— kein Drucker —</option>
        {#each printers as p}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
    <div class="field-check">
      <input type="checkbox" id="art-active" bind:checked={formActive} disabled={saving || deleting} />
      <label for="art-active">Aktiv</label>
    </div>
    <div class="field-check">
      <input type="checkbox" id="art-skip-pickup-slip" bind:checked={formSkipPickupSlip} disabled={saving || deleting} />
      <label for="art-skip-pickup-slip">Selbstabholerbon nicht drucken</label>
    </div>
    <p class="hint">
      Hat nur Auswirkung für die Bonkasse. Verwendung z.B. für Artikel zur Direktmitnahme oder für Pfand-Rückgabe.
    </p>

    {#if editing}
      <section class="options-section">
        <h3>Produktoptionen</h3>
        <p class="hint">
          Gelten ausschließlich für Bestellungen über die Bedienungskasse, nicht an der Bonkasse.
          Mehrfachauswahl pro Bestellung möglich.
        </p>
        {#if optionsLoading}
          <p class="muted">Lade…</p>
        {:else if options.length === 0}
          <p class="muted">Noch keine Optionen.</p>
        {:else}
          <ul class="option-list">
            {#each options as opt}
              <li>
                <span class="opt-name">{opt.name}</span>
                <button type="button" class="btn-ghost danger small" onclick={() => removeOption(opt)}>Löschen</button>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="add-option-row">
          <input
            type="text"
            placeholder="Neue Option (z. B. mit Ketchup)"
            bind:value={newOptionName}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
            disabled={addingOption}
          />
          <button type="button" class="btn-ghost" onclick={addOption}
                  disabled={addingOption || !newOptionName.trim()}>
            {addingOption ? '…' : 'Hinzufügen'}
          </button>
        </div>
      </section>
    {:else}
      <p class="hint">Produktoptionen können nach dem ersten Speichern angelegt werden.</p>
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
  .inactive td { opacity: 0.45; }
  .spacer { flex: 1; }
  /* Product-options block inside the edit modal */
  .options-section {
    border-top: 1px solid var(--color-border);
    margin-top: 1.25rem; padding-top: 1rem;
  }
  .options-section h3 {
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); margin: 0 0 0.5rem 0;
  }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }
  .option-list { list-style: none; padding: 0; margin: 0 0 0.75rem 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .option-list li {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  .opt-name { flex: 1; }
  .small { font-size: 0.8rem; padding: 0.25rem 0.5rem; }
  .add-option-row { display: flex; gap: 0.5rem; }
  .add-option-row input { flex: 1; }
</style>
