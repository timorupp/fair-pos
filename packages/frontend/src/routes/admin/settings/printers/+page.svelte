<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api';
  import type { Printer } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let printers: Printer[] = [];
  let printerStatus: Record<string, 'unknown' | 'online' | 'offline'> = {};
  let loading = true;
  let error = '';

  // Edit modal state
  let modalOpen = false;
  let editing: Printer | null = null;
  let formName = '';
  let formIp = '';
  let formPort = 9100;
  let formError = '';
  /** Id of the printer currently being promoted; disables the button while the request is in flight. */
  let settingDefaultId: string | null = null;
  let saving = false;
  let deleting = false;

  // Test-print state inside the edit modal
  let testPrinting = false;
  let testFeedback = '';

  let statusTimer: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    await load();
    statusTimer = setInterval(refreshStatuses, 30_000);
  });

  onDestroy(() => { if (statusTimer) clearInterval(statusTimer); });

  async function load() {
    loading = true;
    try {
      printers = await api.admin.printers.list();
      printerStatus = Object.fromEntries(printers.map((p) => [p.id, 'unknown']));
      refreshStatuses();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  }

  /** Probes every printer concurrently and updates the status map. Failures simply show as offline. */
  async function refreshStatuses() {
    await Promise.all(printers.map(async (p) => {
      try {
        const { online } = await api.admin.printers.status(p.id);
        printerStatus[p.id] = online ? 'online' : 'offline';
      } catch {
        printerStatus[p.id] = 'offline';
      }
    }));
    printerStatus = { ...printerStatus };
  }

  function openCreate() {
    editing = null; formName = ''; formIp = ''; formPort = 9100; formError = '';
    testFeedback = '';
    modalOpen = true;
  }

  function openEdit(p: Printer) {
    editing = p; formName = p.name; formIp = p.ip_address; formPort = p.port;
    formError = ''; testFeedback = '';
    modalOpen = true;
  }

  /**
   * Promotes the given printer to default. The button is hidden for the
   * already-default printer, so this only runs on rows that need switching.
   *
   * @param p - The printer to promote.
   */
  async function setAsDefault(p: Printer) {
    settingDefaultId = p.id;
    try {
      await api.admin.printers.setDefault(p.id);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      settingDefaultId = null;
    }
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const data = { name: formName, ip_address: formIp, port: formPort };
      if (editing) await api.admin.printers.update(editing.id, data);
      else await api.admin.printers.create(data);
      modalOpen = false;
      await load();
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

  /**
   * Enqueues a test print and immediately reloads the job queue so the operator
   * sees it appear (and watch it progress through pending → printing → done/failed).
   * Goes through the full ESC/POS pipeline rather than a direct synchronous send.
   */
  async function testPrint() {
    if (!editing) return;
    testPrinting = true; testFeedback = '';
    try {
      await api.admin.printers.testPrint(editing.id);
      testFeedback = '✓ Testdruck in Warteschlange';
    } catch (e) {
      testFeedback = '✗ ' + (e instanceof Error ? e.message : 'Fehler');
    } finally { testPrinting = false; }
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
        <tr><th>Status</th><th>Name</th><th>IP-Adresse</th><th class="num">Port</th><th>Standard</th><th></th></tr>
      </thead>
      <tbody>
        {#each printers as p}
          <tr>
            <td>
              <span class="status-dot status-{printerStatus[p.id] ?? 'unknown'}"
                    title={printerStatus[p.id] === 'online' ? 'Online' : printerStatus[p.id] === 'offline' ? 'Nicht erreichbar' : 'Status unbekannt'}></span>
            </td>
            <td>{p.name}</td>
            <td>{p.ip_address}</td>
            <td class="num">{p.port}</td>
            <td>
              {#if p.is_default}
                <span class="default-badge">★ Standard</span>
              {:else}
                <button class="btn-ghost small"
                        on:click={() => setAsDefault(p)}
                        disabled={settingDefaultId === p.id}>
                  {settingDefaultId === p.id ? '…' : 'Als Standard'}
                </button>
              {/if}
            </td>
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
    {#if editing}
      <div class="section-divider"></div>

      <div class="section">
        <div class="section-header">
          <h3>Testdruck</h3>
          <button type="button" class="btn-ghost" on:click={testPrint} disabled={testPrinting}>
            {testPrinting ? 'Sende…' : 'Testseite drucken'}
          </button>
        </div>
        {#if testFeedback}<p class="feedback" class:err={testFeedback.startsWith('✗')}>{testFeedback}</p>{/if}
      </div>

      <p class="hint">
        Druckwarteschlange unter
        <a href="/admin/settings/print-queue">Einstellungen → Druckwarteschlange</a>.
      </p>
    {/if}

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

  /* Online-status dot in the printer list */
  .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle; }
  .status-online   { background: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.25); }
  .status-offline  { background: #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,0.20); }
  .status-unknown  { background: var(--color-text-muted); opacity: 0.4; }

  /* Edit-modal sections */
  .section-divider { height: 1px; background: var(--color-border); margin: 1.25rem 0; }
  .section { margin-bottom: 1rem; }
  .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .section-header h3 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 0; }
  .feedback { font-size: 0.85rem; color: var(--color-text); margin: 0.25rem 0; }
  .feedback.err { color: var(--color-danger); }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 1rem 0 0; }
  .default-badge {
    display: inline-block; font-size: 0.75rem; font-weight: 700;
    padding: 0.15rem 0.5rem; border-radius: 999px;
    color: #c87a00;
    background: rgba(245, 158, 11, 0.10);
    border: 1px solid rgba(245, 158, 11, 0.4);
    letter-spacing: 0.04em;
  }
  .small { font-size: 0.8rem; padding: 0.25rem 0.6rem; }
</style>
