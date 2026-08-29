<script lang="ts">
  /**
   * SSL-Zertifikat für den nginx-Reverse-Proxy (Task #66) — eigene Seite,
   * bewusst nicht in "System" oder "TSE" integriert (Nutzervorgabe:
   * bestehende Seiten sollen nicht zu umfangreich werden). Validierung
   * (Format, Schlüssel passt zum Zertifikat, nicht abgelaufen) passiert
   * komplett im Backend, bevor irgendetwas geschrieben oder `sudo`
   * aufgerufen wird — siehe `system/tlsCert.ts`.
   */
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  type CertInfo = { subject: string; validFrom: string; validTo: string };

  let installed: CertInfo | null = $state(null);
  let loading = $state(true);
  let loadError = $state('');

  let certFile: File | null = $state(null);
  let keyFile: File | null = $state(null);
  let uploading = $state(false);
  let uploadError = $state('');
  let uploadSuccess = $state(false);

  onMount(load);

  async function load() {
    loading = true;
    try {
      installed = (await api.admin.tlsCert.get()).installed;
      loadError = '';
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  /** Formats an X.509 validity timestamp (ISO-ish, exact format depends on Node/OpenSSL) as a short German date. */
  function dateLabel(raw: string): string {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString('de-DE');
  }

  async function upload() {
    if (!certFile || !keyFile) return;
    const warning = installed
      ? 'Das aktuell installierte Zertifikat wird ersetzt und nginx neu geladen. Fortfahren?'
      : 'Zertifikat installieren und nginx neu laden. Fortfahren?';
    if (!confirm(warning)) return;

    uploading = true; uploadError = ''; uploadSuccess = false;
    try {
      const [cert, key] = await Promise.all([certFile.text(), keyFile.text()]);
      installed = (await api.admin.tlsCert.upload(cert, key)).installed;
      uploadSuccess = true;
      certFile = null; keyFile = null;
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      uploading = false;
    }
  }
</script>

<div class="page">
  <div class="page-header"><h1>SSL-Zertifikat</h1></div>
  <p class="hint">
    Zertifikat für den nginx-Reverse-Proxy vor dieser Anwendung (Abschnitt
    „Reverse-Proxy / TLS" der Installationsanleitung). Ein Upload hier ersetzt
    das aktuell installierte Zertifikat sofort und lädt nginx neu — bei einem
    ungültigen Zertifikat wird automatisch auf das vorherige zurückgerollt,
    der laufende Proxy bleibt also in jedem Fall erreichbar.
  </p>

  {#if loadError}<p class="error-text">{loadError}</p>{/if}

  <section class="card">
    <h2>Aktuelles Zertifikat</h2>
    {#if loading}
      <p class="muted">Lade…</p>
    {:else if installed}
      <dl class="kv">
        <dt>Ausgestellt für</dt><dd>{installed.subject}</dd>
        <dt>Gültig von</dt><dd>{dateLabel(installed.validFrom)}</dd>
        <dt>Gültig bis</dt><dd>{dateLabel(installed.validTo)}</dd>
      </dl>
    {:else}
      <p class="muted">Kein Zertifikat installiert.</p>
    {/if}
  </section>

  <section class="card">
    <h2>Neues Zertifikat hochladen</h2>
    <div class="field">
      <label for="cert-file">Zertifikat (PEM, .crt/.pem)</label>
      <input id="cert-file" type="file" accept=".crt,.pem,.cer"
             onchange={(e) => (certFile = e.currentTarget.files?.[0] ?? null)} disabled={uploading} />
    </div>
    <div class="field">
      <label for="key-file">Privater Schlüssel (PEM, .key/.pem)</label>
      <input id="key-file" type="file" accept=".key,.pem"
             onchange={(e) => (keyFile = e.currentTarget.files?.[0] ?? null)} disabled={uploading} />
    </div>
    {#if uploadError}<p class="error-text">{uploadError}</p>{/if}
    {#if uploadSuccess}<p class="success-text">Zertifikat installiert, nginx neu geladen.</p>{/if}
    <button class="btn-primary" onclick={upload} disabled={uploading || !certFile || !keyFile}>
      {uploading ? 'Installiere…' : 'Hochladen und installieren'}
    </button>
  </section>
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
  .kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 1.25rem; margin: 0; font-size: 0.9rem; }
  .kv dt { color: var(--color-text-muted); }
  .kv dd { margin: 0; min-width: 0; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
  .field label { font-size: 0.85rem; color: var(--color-text-muted); }
  .success-text { color: #4caf7d; font-size: 0.875rem; }
</style>
