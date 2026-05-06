<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let settings: Record<string, string> = {};
  let loading = true;
  let saving = false;
  let error = '';
  let success = false;

  onMount(async () => {
    try { settings = await api.admin.settings.get(); }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
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
</script>

<div class="page">
  <div class="page-header">
    <h1>Unternehmensdaten</h1>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else}
    <form on:submit|preventDefault={save} class="settings-form">
      <section>
        <h2>Unternehmen / Verein</h2>
        <div class="field">
          <label for="s-company-name">Name des Unternehmens / Vereins</label>
          <input id="s-company-name" value={settings['company_name'] ?? ''}
                 on:input={(e) => { settings['company_name'] = e.currentTarget.value; success = false; }}
                 disabled={saving} />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="s-street">Straße und Hausnummer</label>
            <input id="s-street" value={settings['company_street'] ?? ''}
                   on:input={(e) => { settings['company_street'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
        </div>
        <div class="field-row">
          <div class="field field-short">
            <label for="s-postal">PLZ</label>
            <input id="s-postal" value={settings['company_postal_code'] ?? ''}
                   on:input={(e) => { settings['company_postal_code'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
          <div class="field">
            <label for="s-city">Ort</label>
            <input id="s-city" value={settings['company_city'] ?? ''}
                   on:input={(e) => { settings['company_city'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
        </div>
        <div class="field">
          <label for="s-tax-no">Steuernummer (Finanzamt)</label>
          <input id="s-tax-no" value={settings['company_tax_number'] ?? ''}
                 on:input={(e) => { settings['company_tax_number'] = e.currentTarget.value; success = false; }}
                 disabled={saving} placeholder="z. B. 123/456/78901" />
        </div>
        <div class="field">
          <label for="s-vat-id">USt-IdNr. (optional)</label>
          <input id="s-vat-id" value={settings['company_vat_id'] ?? ''}
                 on:input={(e) => { settings['company_vat_id'] = e.currentTarget.value; success = false; }}
                 disabled={saving} placeholder="z. B. DE123456789" />
        </div>
      </section>

      <section>
        <h2>Belegnummern</h2>
        <div class="field-row">
          <div class="field field-short">
            <label for="s-prefix">Präfix</label>
            <input id="s-prefix" value={settings['receipt_prefix'] ?? ''}
                   on:input={(e) => { settings['receipt_prefix'] = e.currentTarget.value; success = false; }}
                   disabled={saving} placeholder="z. B. RE-" />
          </div>
          <div class="field field-short">
            <label for="s-counter">Startwert Zähler</label>
            <input id="s-counter" type="number" min="1" value={settings['receipt_counter_start'] ?? '1'}
                   on:input={(e) => { settings['receipt_counter_start'] = e.currentTarget.value; success = false; }}
                   disabled={saving} />
          </div>
        </div>
        <p class="hint">Beispielergebnis: {(settings['receipt_prefix'] ?? 'RE-')}{String(parseInt(settings['receipt_counter_start'] ?? '1') || 1).padStart(5, '0')}</p>
      </section>

      <section>
        <h2>Pfand</h2>
        <div class="field field-short">
          <label for="s-vat-deposit">Umsatzsteuersatz Pfand (%)</label>
          <input id="s-vat-deposit" inputmode="decimal" value={settings['vat_rate_deposit'] ?? ''}
                 on:input={(e) => { settings['vat_rate_deposit'] = e.currentTarget.value; success = false; }}
                 disabled={saving} placeholder="z. B. 19" />
        </div>
      </section>

      {#if error}<p class="error-text">{error}</p>{/if}
      {#if success}<p class="success-text">Gespeichert.</p>{/if}

      <div class="form-footer">
        <button type="submit" class="btn-primary" disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </form>
  {/if}
</div>

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
  .form-footer { padding-top: 0.5rem; }
</style>
