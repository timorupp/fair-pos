<script lang="ts">
  /**
   * Split-Horizon-DNS / DNS-Masquerading (Task #92) — eigene Seite, analog
   * zur SSL-Zertifikat-Seite. Kein separater Ein/Aus-Schalter (Nutzervorgabe,
   * 2026-08-30): "konfiguriert" bedeutet, dass eine Domain gespeichert ist;
   * "Deaktivieren" entfernt die Konfiguration wieder vollständig. Speichern
   * validiert und installiert zuerst (inkl. `dnsmasq --test` mit
   * automatischem Rollback im Backend) — erst bei Erfolg wird gespeichert.
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { DnsConfigSettings } from '$lib/api';

  let loading = $state(true);
  let loadError = $state('');
  let configured = $state(false);

  let domain = $state('');
  let upstreamPrimary = $state('');
  let upstreamSecondary = $state('');
  let targetIp = $state('');
  let ttl = $state(300);

  let detecting = $state(false);
  let saving = $state(false);
  let saveError = $state('');
  let saveSuccess = $state(false);
  let disabling = $state(false);

  let testing = $state(false);
  let testResult: { success: boolean; message: string } | null = $state(null);

  onMount(load);

  function applySettings(settings: DnsConfigSettings) {
    configured = settings.configured;
    domain = settings.domain;
    upstreamPrimary = settings.upstreamPrimary;
    upstreamSecondary = settings.upstreamSecondary;
    targetIp = settings.targetIp;
    ttl = settings.ttl;
  }

  async function load() {
    loading = true;
    try {
      applySettings(await api.admin.dnsConfig.get());
      loadError = '';
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  async function detectIp() {
    detecting = true; saveError = '';
    try {
      targetIp = (await api.admin.dnsConfig.detectIp()).ip;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      detecting = false;
    }
  }

  async function save() {
    saving = true; saveError = ''; saveSuccess = false; testResult = null;
    try {
      applySettings(await api.admin.dnsConfig.save({ domain, upstreamPrimary, upstreamSecondary, targetIp, ttl }));
      saveSuccess = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      saving = false;
    }
  }

  async function disable() {
    if (!confirm('DNS-Masquerading deaktivieren? Geräte am Veranstaltungsort lösen die Domain danach nicht mehr auf die eigene Adresse auf.')) return;
    disabling = true; saveError = ''; testResult = null;
    try {
      await api.admin.dnsConfig.disable();
      configured = false;
      saveSuccess = false;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      disabling = false;
    }
  }

  async function test() {
    testing = true; testResult = null;
    try {
      const result = await api.admin.dnsConfig.test();
      testResult = { success: result.success, message: result.message };
    } catch (e) {
      testResult = { success: false, message: e instanceof Error ? e.message : 'Fehler' };
    } finally {
      testing = false;
    }
  }
</script>

<div class="page">
  <div class="page-header"><h1>DNS-Masquerading</h1></div>
  <p class="hint">
    Split-Horizon-DNS für den Veranstaltungsort: Geräte im WLAN des Vereins
    erhalten diesen Server als DNS-Resolver per DHCP und lösen die unten
    konfigurierte Domain direkt auf die eigene IP-Adresse auf — alle anderen
    Domains werden ganz normal an die eingetragenen DNS-Server weitergeleitet.
    So greift das bei „SSL-Zertifikat" hochgeladene, offiziell vertrauenswürdige
    Zertifikat, ohne dass auf einem Gerät manuell eine eigene Zertifizierungs-
    stelle installiert werden muss.
  </p>

  {#if loadError}<p class="error-text">{loadError}</p>{/if}

  <section class="card">
    <h2>Konfiguration</h2>
    {#if loading}
      <p class="muted">Lade…</p>
    {:else}
      <div class="field">
        <label for="domain">Domain</label>
        <input id="domain" type="text" placeholder="kasse.mein-verein.de" bind:value={domain} disabled={saving} />
      </div>
      <div class="field">
        <label for="target-ip">Eigene IP-Adresse</label>
        <div class="row">
          <input id="target-ip" type="text" placeholder="192.168.1.50" bind:value={targetIp} disabled={saving} />
          <button class="btn-ghost" onclick={detectIp} disabled={detecting || saving}>
            {detecting ? 'Erkenne…' : 'Auto-erkennen'}
          </button>
        </div>
      </div>
      <div class="field">
        <label for="upstream-primary">Primärer DNS-Server (Weiterleitung)</label>
        <input id="upstream-primary" type="text" placeholder="9.9.9.9" bind:value={upstreamPrimary} disabled={saving} />
      </div>
      <div class="field">
        <label for="upstream-secondary">Sekundärer DNS-Server (optional)</label>
        <input id="upstream-secondary" type="text" placeholder="1.1.1.1" bind:value={upstreamSecondary} disabled={saving} />
      </div>
      <div class="field">
        <label for="ttl">TTL für die eigene Domain (Sekunden)</label>
        <input id="ttl" type="number" min="10" max="86400" bind:value={ttl} disabled={saving} />
      </div>

      {#if saveError}<p class="error-text">{saveError}</p>{/if}
      {#if saveSuccess}<p class="success-text">Gespeichert, dnsmasq neu geladen.</p>{/if}

      <div class="actions">
        <button class="btn-primary" onclick={save} disabled={saving || !domain || !targetIp || !upstreamPrimary}>
          {saving ? 'Speichere…' : 'Speichern und anwenden'}
        </button>
        {#if configured}
          <button class="btn-ghost" onclick={disable} disabled={disabling}>
            {disabling ? 'Deaktiviere…' : 'Deaktivieren'}
          </button>
        {/if}
      </div>
    {/if}
  </section>

  {#if configured}
    <section class="card">
      <h2>Auflösung testen</h2>
      <p class="muted">Prüft direkt beim lokalen Resolver dieses Servers, ob die Domain auf die eigene IP-Adresse auflöst.</p>
      <button class="btn-ghost" onclick={test} disabled={testing}>
        {testing ? 'Teste…' : 'Auflösung testen'}
      </button>
      {#if testResult}
        <p class={testResult.success ? 'success-text' : 'error-text'}>{testResult.message}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.25rem;
    max-width: 640px;
  }
  .card h2 {
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); margin: 0 0 0.75rem 0;
  }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin: 0 0 1.25rem 0; max-width: 640px; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
  .field label { font-size: 0.85rem; color: var(--color-text-muted); }
  .row { display: flex; gap: 0.5rem; }
  .row input { flex: 1; }
  .actions { display: flex; gap: 0.75rem; align-items: center; }
  .success-text { color: #4caf7d; font-size: 0.875rem; }
</style>
