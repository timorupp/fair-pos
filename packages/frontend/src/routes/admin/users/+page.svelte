<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { adminUser } from '$lib/stores/user';
  import { copyToClipboard } from '$lib/clipboard';
  import type { User, Register } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  let users: User[] = [];
  let registers: Register[] = [];
  let loading = true;
  let error = '';

  let modalOpen = false;
  let editing: User | null = null;
  let formName = '';
  let formPassword = '';
  let formIsAdmin = false;
  let formActive = true;
  let formRegisterIds: string[] = [];
  let formError = '';
  let saving = false;
  let deleting = false;

  let tokenModal = false;
  let tokenUrl = '';

  onMount(load);

  async function load() {
    loading = true;
    try {
      [users, registers] = await Promise.all([
        api.admin.users.list(),
        api.admin.registers.list(),
      ]);
    }
    catch (e) { error = e instanceof Error ? e.message : 'Fehler'; }
    finally { loading = false; }
  }

  /**
   * Registers offered for assignment — archived registers (Task #55) are
   * hidden here just like from the operator login picker, unless the
   * currently-edited user is already assigned one; in that case it stays
   * visible (checked) so the admin can see and, if desired, remove it
   * explicitly instead of it silently vanishing from the list.
   */
  $: assignableRegisters = registers.filter((r) => r.is_active || formRegisterIds.includes(r.id));

  function openCreate() {
    editing = null; formName = ''; formPassword = ''; formIsAdmin = false; formActive = true;
    formRegisterIds = []; formError = '';
    modalOpen = true;
  }

  async function openEdit(u: User) {
    editing = u; formName = u.name; formPassword = ''; formIsAdmin = u.is_admin; formActive = u.is_active; formError = '';
    formRegisterIds = await api.admin.users.listRegisters(u.id).catch(() => []);
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      if (editing) {
        const data: { name?: string; password?: string; is_admin?: boolean; is_active?: boolean } =
          { name: formName, is_admin: formIsAdmin, is_active: formActive };
        if (formPassword) data.password = formPassword;
        await api.admin.users.update(editing.id, data);
        await api.admin.users.setRegisters(editing.id, formRegisterIds);
      } else {
        if (formIsAdmin && !formPassword) { formError = 'Passwort erforderlich für Administrator'; saving = false; return; }
        const created = await api.admin.users.create({ name: formName, password: formPassword || '', is_admin: formIsAdmin });
        await api.admin.users.setRegisters(created.id, formRegisterIds);
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
    if (!confirm(`Benutzer "${editing.name}" wirklich löschen?`)) return;
    deleting = true;
    try { await api.admin.users.delete(editing.id); modalOpen = false; await load(); }
    catch (e) { formError = e instanceof Error ? e.message : 'Fehler'; }
    finally { deleting = false; }
  }

  async function generateToken(u: User) {
    try {
      const { token } = await api.admin.users.generateToken(u.id);
      tokenUrl = `${location.origin}/login?token=${token}`;
      tokenModal = true;
    } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); }
  }

  function copyToken() { copyToClipboard(tokenUrl); }
  function openTokenInTab() { window.open(tokenUrl, '_blank'); }

  function toggleRegister(id: string) {
    if (formRegisterIds.includes(id)) {
      formRegisterIds = formRegisterIds.filter((r) => r !== id);
    } else {
      formRegisterIds = [...formRegisterIds, id];
    }
  }

  const isSelf = (u: User) => u.id === $adminUser?.id;

  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';
</script>

<div class="page">
  <div class="page-header">
    <h1>Benutzer</h1>
    <button class="btn-primary" on:click={openCreate}>+ Neu</button>
  </div>

  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Rolle</th><th>Status</th><th>Erstellt</th><th></th></tr>
      </thead>
      <tbody>
        {#each users as u}
          <tr class:inactive={!u.is_active}>
            <td>{u.name}{#if isSelf(u)} <span class="self-badge">ich</span>{/if}</td>
            <td>{u.is_admin ? 'Administrator' : 'Bediener'}</td>
            <td>{#if !u.is_active}<span class="archived-badge">Deaktiviert</span>{:else}<span class="muted small">aktiv</span>{/if}</td>
            <td class="num">{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
            <td class="actions">
              <button class="btn-primary login-btn" on:click={() => generateToken(u)} disabled={!u.is_active}>Login</button>
              <button class="btn-ghost" on:click={() => openEdit(u)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}>
  <form on:submit|preventDefault={save}>
    <div class="field">
      <label for="u-name">Name</label>
      <input id="u-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    <div class="field-check">
      <input type="checkbox" id="u-admin" bind:checked={formIsAdmin}
             disabled={saving || deleting || (editing !== null && isSelf(editing))} />
      <label for="u-admin">Administrator (Zugang zur Administrationsoberfläche)</label>
    </div>
    {#if formIsAdmin}
      <div class="field">
        <label for="u-pw">{editing ? 'Neues Passwort (leer = unverändert)' : 'Passwort'}</label>
        <input id="u-pw" type="password" bind:value={formPassword}
               required={!editing && formIsAdmin} disabled={saving || deleting} />
      </div>
    {/if}
    {#if editing}
      <div class="field-check">
        <input type="checkbox" id="u-active" bind:checked={formActive} disabled={saving || deleting || (editing !== null && isSelf(editing))} />
        <label for="u-active">Aktiv</label>
      </div>
      {#if !formActive}
        <p class="hint">Deaktivierte Benutzer können sich nicht mehr anmelden (auch nicht per QR-Login) und werden aus der Kassenzuweisung ausgeblendet, bleiben aber vollständig in der Datenbank erhalten.</p>
      {/if}
    {/if}
    {#if assignableRegisters.length > 0}
      <div class="field">
        <span class="field-label">Zugewiesene Kassen</span>
        <div class="register-list">
          {#each assignableRegisters as r}
            {@const selected = formRegisterIds.includes(r.id)}
            <label class="register-item" class:selected>
              <input type="checkbox"
                     checked={selected}
                     on:change={() => toggleRegister(r.id)}
                     disabled={saving || deleting} />
              <span class="register-name">{r.name}</span>
              <span class="register-type-badge type-{r.type}">{typeLabel(r.type)}</span>
            </label>
          {/each}
        </div>
      </div>
    {/if}
    {#if formError}<p class="error-text">{formError}</p>{/if}
    <div class="modal-actions">
      {#if editing && !isSelf(editing)}
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

<Modal bind:open={tokenModal} title="QR-Login-Link">
  <div class="token-box">
    <p class="muted">Dieser Link ist 10 Minuten gültig und kann nur einmal verwendet werden.</p>
    {#if tokenUrl}
      <img class="token-qr" src="/api/admin/qr.png?data={encodeURIComponent(tokenUrl)}&size=320" alt="QR-Code für den Login-Link" />
    {/if}
    <code class="token-url">{tokenUrl}</code>
    <div class="modal-actions">
      <button class="btn-ghost" on:click={() => (tokenModal = false)}>Schließen</button>
      {#if $adminUser && tokenUrl.includes(`token=`)}
        <button class="btn-ghost" on:click={openTokenInTab}>In neuem Tab öffnen</button>
      {/if}
      <button class="btn-primary" on:click={copyToken}>Link kopieren</button>
    </div>
  </div>
</Modal>

<style>
  .self-badge {
    font-size: 0.7rem; padding: 0.1rem 0.4rem;
    background: rgba(79,124,255,0.12); color: var(--color-primary);
    border-radius: 4px; margin-left: 0.35rem; vertical-align: middle;
  }
  .token-box { display: flex; flex-direction: column; gap: 1rem; align-items: stretch; }
  .token-qr {
    align-self: center; width: 220px; height: 220px;
    background: white; padding: 0.5rem; border-radius: var(--radius-sm);
  }
  .token-url {
    display: block; padding: 0.75rem;
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); font-size: 0.8rem;
    word-break: break-all; color: var(--color-text);
  }
  .spacer { flex: 1; }
  .small { font-size: 0.85rem; }
  tr.inactive td { opacity: 0.45; }
  .archived-badge {
    font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px;
    color: var(--color-text-muted);
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
  }
  .hint { font-size: 0.85rem; color: var(--color-text-muted); margin: 0 0 0.75rem 0; }
  .field-label { font-size: 0.8rem; color: var(--color-text-muted); display: block; margin-bottom: 0.4rem; }
  /* Register assignment list — each row is a full-width clickable card laid out
     as a 3-column grid (checkbox · name · type-badge) so the columns line up
     across rows instead of drifting to the centre. */
  .register-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .register-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center; gap: 0.75rem;
    padding: 0.6rem 0.8rem;
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.9rem; cursor: pointer; text-align: left;
    transition: background 0.1s, border-color 0.1s;
  }
  .register-item:hover { background: var(--color-surface-hover); border-color: var(--color-primary); }
  .register-item.selected {
    background: rgba(79, 124, 255, 0.10);
    border-color: var(--color-primary);
  }
  .register-item input[type="checkbox"] {
    /* Pin the checkbox to its grid cell so it doesn't get auto-stretched. */
    margin: 0; justify-self: start;
  }
  .register-name { font-weight: 500; }
  .register-type-badge {
    font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px;
    color: var(--color-text-muted);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
  }
  .register-type-badge.type-receipt_register {
    color: #4f7cff;
    background: rgba(79, 124, 255, 0.08);
    border-color: rgba(79, 124, 255, 0.3);
  }
  .register-type-badge.type-service_register {
    color: #4caf7d;
    background: rgba(76, 175, 125, 0.08);
    border-color: rgba(76, 175, 125, 0.3);
  }
</style>
