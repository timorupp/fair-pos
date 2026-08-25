<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { Printer } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let settings: Record<string, string> = $state({});
  /** All configured printers — used by the logo testdruck dropdown. */
  let printers: Printer[] = $state([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let success = $state(false);

  onMount(async () => {
    try {
      [settings, printers] = await Promise.all([
        api.admin.settings.get(),
        api.admin.printers.list(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { loading = false; }
  });

  async function save() {
    error = ''; success = false; saving = true;
    try {
      await api.admin.settings.save(settings);
      success = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally { saving = false; }
  }

  function field(key: string) {
    return {
      value: settings[key] ?? '',
      oninput: (e: Event) => { settings[key] = (e.target as HTMLInputElement).value; success = false; },
    };
  }

  /** Whether the receipt-preview modal is currently visible. */
  let previewOpen = $state(false);

  /**
   * Reload-counter appended as a query parameter to the preview URL so the browser
   * pulls a fresh PDF every time the operator opens the modal (rather than the cached one).
   */
  let previewVersion = $state(0);

  /**
   * Opens the inline receipt preview. Bumps `previewVersion` so the `<embed>` re-fetches.
   */
  function openPreview() {
    previewVersion += 1;
    previewOpen = true;
  }

  // ── Logo ────────────────────────────────────────────────────────────────
  /** Cache-buster appended to the preview image URL so a fresh upload shows up immediately. */
  let logoVersion = $state(0);
  /** True once the preview image has actually loaded; lets us hide the "no logo" hint. */
  let logoExists = $state(false);
  let logoBusy = $state(false);
  let logoError = $state('');
  /** Bound to the hidden `<input type="file">` so we can clear it after upload. */
  let logoFileInput: HTMLInputElement = $state()!;

  /**
   * Uploads the file selected via the file picker, refreshes the preview,
   * and clears the input so the same file can be picked again later.
   */
  async function onLogoUpload(): Promise<void> {
    const file = logoFileInput.files?.[0];
    if (!file) return;
    logoBusy = true; logoError = '';
    try {
      await api.admin.logo.upload(file);
      logoVersion += 1;
      logoExists = true;
    } catch (e) {
      logoError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      logoBusy = false;
      logoFileInput.value = '';
    }
  }

  /**
   * Removes the stored logo after confirmation, then hides the preview.
   */
  async function removeLogo(): Promise<void> {
    if (!confirm('Logo wirklich entfernen?')) return;
    logoBusy = true; logoError = '';
    try {
      await api.admin.logo.remove();
      logoExists = false;
      logoVersion += 1;
    } catch (e) {
      logoError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      logoBusy = false;
    }
  }

  /** Currently chosen printer for the logo test print. */
  let testPrintPrinterId = $state('');
  let testPrintFeedback = $state('');
  let testPrintBusy = $state(false);

  /**
   * Enqueues a test page on the chosen printer. The backend's test-print
   * endpoint always embeds the configured logo (independent of the per-bon
   * flags), so this is also the canonical way to verify the logo renders.
   */
  async function runLogoTestPrint(): Promise<void> {
    if (!testPrintPrinterId) { testPrintFeedback = 'Bitte Drucker wählen.'; return; }
    testPrintBusy = true; testPrintFeedback = '';
    try {
      await api.admin.printers.testPrint(testPrintPrinterId);
      testPrintFeedback = '✓ Testdruck wurde in die Druckwarteschlange gestellt.';
    } catch (e) {
      testPrintFeedback = e instanceof Error ? e.message : 'Fehler';
    } finally {
      testPrintBusy = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Unternehmensdaten</h1>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else}
    <form onsubmit={preventDefault(save)} class="settings-form">
      <section>
        <h2>Unternehmen / Verein</h2>
        <div class="field">
          <label for="s-company-name">Name des Unternehmens / Vereins</label>
          <input id="s-company-name" value={settings['company_name'] ?? ''}
                 oninput={(e) => { settings['company_name'] = e.currentTarget.value; success = false; }}
                 disabled={saving} />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="s-street">Straße und Hausnummer</label>
            <input id="s-street" value={settings['company_street'] ?? ''}
                   oninput={(e) => { settings['company_street'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
        </div>
        <div class="field-row">
          <div class="field field-short">
            <label for="s-postal">PLZ</label>
            <input id="s-postal" value={settings['company_postal_code'] ?? ''}
                   oninput={(e) => { settings['company_postal_code'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
          <div class="field">
            <label for="s-city">Ort</label>
            <input id="s-city" value={settings['company_city'] ?? ''}
                   oninput={(e) => { settings['company_city'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
        </div>
        <div class="field">
          <label for="s-tax-no">Steuernummer (Finanzamt)</label>
          <input id="s-tax-no" value={settings['company_tax_number'] ?? ''}
                 oninput={(e) => { settings['company_tax_number'] = e.currentTarget.value; success = false; }}
                 disabled={saving} placeholder="z. B. 123/456/78901" />
        </div>
        <div class="field">
          <label for="s-vat-id">USt-IdNr. (optional)</label>
          <input id="s-vat-id" value={settings['company_vat_id'] ?? ''}
                 oninput={(e) => { settings['company_vat_id'] = e.currentTarget.value; success = false; }}
                 disabled={saving} placeholder="z. B. DE123456789" />
        </div>
      </section>

      <section>
        <h2>Belegnummern</h2>
        <div class="field-row">
          <div class="field field-short">
            <label for="s-prefix">Präfix</label>
            <input id="s-prefix" value={settings['receipt_prefix'] ?? ''}
                   oninput={(e) => { settings['receipt_prefix'] = e.currentTarget.value; success = false; }}
                   disabled={saving} placeholder="z. B. RE-" />
          </div>
          <div class="field field-short">
            <label for="s-counter">Startwert Zähler</label>
            <input id="s-counter" type="number" min="1" value={settings['receipt_counter_start'] ?? '1'}
                   oninput={(e) => { settings['receipt_counter_start'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
        </div>
        <p class="hint">Beispielergebnis: {(settings['receipt_prefix'] ?? 'RE-')}{String(parseInt(settings['receipt_counter_start'] ?? '1') || 1).padStart(5, '0')}</p>
      </section>

      <section>
        <h2>Logo</h2>
        <p class="hint">
          Bild (PNG oder JPG, max. 2 MB) — wird mittig oben über dem Firmennamen auf den ausgewählten
          Beleg- und Bon-Typen gedruckt. Wir skalieren es automatisch auf eine bondruckergerechte Größe.
        </p>

        <div class="logo-row">
          {#if logoExists}
            <img
              class="logo-preview"
              src="{api.admin.logo.previewUrl()}?v={logoVersion}"
              alt="Logo"
              onload={() => (logoExists = true)}
              onerror={() => (logoExists = false)}
            />
          {:else}
            <!-- Initial probe: try to load once. If 404, the onerror flips logoExists to false. -->
            <img
              class="logo-preview hidden-probe"
              src="{api.admin.logo.previewUrl()}?v={logoVersion}"
              alt=""
              onload={() => (logoExists = true)}
              onerror={() => (logoExists = false)}
            />
            <p class="muted">Noch kein Logo hinterlegt.</p>
          {/if}

          <div class="logo-actions">
            <input
              type="file"
              accept="image/png,image/jpeg"
              bind:this={logoFileInput}
              onchange={onLogoUpload}
              disabled={logoBusy || saving}
            />
            {#if logoExists}
              <button type="button" class="btn-ghost danger" onclick={removeLogo} disabled={logoBusy || saving}>
                Logo entfernen
              </button>
            {/if}
          </div>
        </div>
        {#if logoError}<p class="error-text">{logoError}</p>{/if}

        <h3 class="logo-flags-title">Größe</h3>
        <div class="field field-short">
          <label for="s-logo-zoom">Zoom (%)</label>
          <input id="s-logo-zoom" type="number" min="1" max="500" step="1"
                 value={settings['logo_zoom_percent'] ?? '100'}
                 oninput={(e) => { settings['logo_zoom_percent'] = e.currentTarget.value; success = false; }}
                 disabled={saving} />
          <p class="hint">
            100 % = volle Bonbreite (Standard). Werte über 100 % werden hardwareseitig auf die maximale Druckbreite begrenzt; kleiner als 100 % verkleinert das Logo proportional. Änderung wird nach „Speichern" wirksam.
          </p>
        </div>

        <h3 class="logo-flags-title">Logo drucken auf …</h3>
        {#if !logoExists}
          <p class="muted small">Erst ein Logo hochladen — solange keines hinterlegt ist, werden die Häkchen ignoriert.</p>
        {/if}
        <div class="logo-flags">
          <label><input type="checkbox" checked={settings['logo_on_receipt'] === 'true'}
            onchange={(e) => { settings['logo_on_receipt'] = e.currentTarget.checked ? 'true' : 'false'; success = false; }}
            disabled={saving} /> Kassenbon (Rechnung)</label>
          <label><input type="checkbox" checked={settings['logo_on_cancellation'] === 'true'}
            onchange={(e) => { settings['logo_on_cancellation'] = e.currentTarget.checked ? 'true' : 'false'; success = false; }}
            disabled={saving} /> Stornobeleg</label>
          <label><input type="checkbox" checked={settings['logo_on_z_bon'] === 'true'}
            onchange={(e) => { settings['logo_on_z_bon'] = e.currentTarget.checked ? 'true' : 'false'; success = false; }}
            disabled={saving} /> Z-Bon (Tagesabschluss)</label>
          <label><input type="checkbox" checked={settings['logo_on_order_slip'] === 'true'}
            onchange={(e) => { settings['logo_on_order_slip'] = e.currentTarget.checked ? 'true' : 'false'; success = false; }}
            disabled={saving} /> Bestellbon (Bedienung)</label>
          <label><input type="checkbox" checked={settings['logo_on_pickup_slip'] === 'true'}
            onchange={(e) => { settings['logo_on_pickup_slip'] = e.currentTarget.checked ? 'true' : 'false'; success = false; }}
            disabled={saving} /> Selbstabholerbon (Bonkasse)</label>
          <label><input type="checkbox" checked={settings['logo_on_deposit_slip'] === 'true'}
            onchange={(e) => { settings['logo_on_deposit_slip'] = e.currentTarget.checked ? 'true' : 'false'; success = false; }}
            disabled={saving} /> Pfandbon</label>
        </div>

        <h3 class="logo-flags-title">Testdruck</h3>
        <p class="hint">
          Druckt eine Testseite mit Logo (sofern hochgeladen) auf dem gewählten Drucker. Nützlich, um
          Größe und Druckqualität des Logos vor dem produktiven Einsatz zu prüfen.
        </p>
        <p class="hint warn">
          ⚠ Änderungen am Zoom werden erst nach <strong>Speichern</strong> wirksam — also zuerst speichern,
          dann Testdruck.
        </p>
        <div class="logo-actions">
          <select bind:value={testPrintPrinterId} disabled={testPrintBusy}>
            <option value="">— Drucker wählen —</option>
            {#each printers as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          <button type="button" class="btn-ghost" onclick={runLogoTestPrint}
                  disabled={!testPrintPrinterId || testPrintBusy}>
            {testPrintBusy ? 'Sende…' : 'Testdruck'}
          </button>
        </div>
        {#if testPrintFeedback}<p class="hint">{testPrintFeedback}</p>{/if}
      </section>

      <section>
        <h2>Pfand</h2>
        <div class="field field-short">
          <label for="s-vat-deposit">Umsatzsteuersatz Pfand (%)</label>
          <input id="s-vat-deposit" inputmode="decimal" value={settings['vat_rate_deposit'] ?? ''}
                 oninput={(e) => { settings['vat_rate_deposit'] = e.currentTarget.value; success = false; }}
                 disabled={saving} placeholder="z. B. 19" />
        </div>
      </section>

      {#if error}<p class="error-text">{error}</p>{/if}
      {#if success}<p class="success-text">Gespeichert.</p>{/if}

      <div class="form-footer">
        <button type="button" class="btn-ghost" onclick={openPreview}>Bon-Vorschau (PDF)</button>
        <div class="spacer"></div>
        <button type="submit" class="btn-primary" disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </form>
  {/if}
</div>

<Modal bind:open={previewOpen} title="Bon-Vorschau (PDF)">
  <embed
    title="Bon-Vorschau"
    src="/api/admin/settings/receipt-preview?v={previewVersion}"
    type="application/pdf"
    class="preview-embed"
  />
  <div class="preview-actions">
    <a class="btn-ghost"
       href="/api/admin/settings/receipt-preview?v={previewVersion}"
       target="_blank" rel="noopener">In neuem Tab öffnen</a>
    <div class="spacer"></div>
    <button class="btn-primary" onclick={() => (previewOpen = false)}>Schließen</button>
  </div>
</Modal>

<style>
  .settings-form { display: flex; flex-direction: column; gap: 2rem; max-width: 560px; }
  section { display: flex; flex-direction: column; gap: 0; }
  h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
       color: var(--color-text-muted); margin-bottom: 1rem; padding-bottom: 0.5rem;
       border-bottom: 1px solid var(--color-border); }
  .field-row { display: flex; gap: 1rem; }
  .field-row .field { flex: 1; }
  .field-short { max-width: 180px; flex: 0 0 auto !important; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin-top: -0.5rem; margin-bottom: 0.75rem; }
  .success-text { color: #4caf7d; font-size: 0.875rem; }
  .form-footer { display: flex; gap: 0.5rem; align-items: center; padding-top: 0.5rem; }
  .form-footer .spacer { flex: 1; }
  .preview-embed { width: 100%; height: 60vh; min-height: 400px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
  .preview-actions { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.75rem; }
  .preview-actions .spacer { flex: 1; }
  .logo-row { display: flex; flex-direction: column; gap: 0.75rem; }
  .logo-preview { max-width: 200px; max-height: 100px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: #fff; padding: 0.25rem; }
  .logo-preview.hidden-probe { display: none; }
  .logo-actions { display: flex; gap: 0.5rem; align-items: center; }
  .logo-flags-title { font-size: 0.85rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; }
  .logo-flags { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.4rem 1rem; font-size: 0.9rem; }
  .logo-flags label { display: flex; align-items: center; gap: 0.4rem; }
  .small { font-size: 0.8rem; }
  .hint.warn { color: #c87a00; }
</style>
