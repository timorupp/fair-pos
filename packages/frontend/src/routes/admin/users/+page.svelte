<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { adminUser } from '$lib/stores/user';
  import { copyToClipboard } from '$lib/clipboard';
  import type { User, Register } from '@fairpos/shared';
  import Modal from '$lib/components/Modal.svelte';

  type UserRow = User & { has_pin: boolean };

  let users: UserRow[] = $state([]);
  let registers: Register[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  let modalOpen = $state(false);
  let editing: User | null = $state(null);
  let formName = $state('');
  let formPassword = $state('');
  let formIsAdmin = $state(false);
  let formIsEventAdmin = $state(false);
  let formActive = $state(true);
  let formRegisterIds: string[] = $state([]);
  let formError = $state('');
  let saving = $state(false);
  let deleting = $state(false);

  // PIN management (Task #90) — replaces the old QR-login-link modal.
  let pinModal = $state(false);
  let pinModalUser: UserRow | null = $state(null);
  /** Hyphen-formatted, editable candidate/current PIN shown in the modal. */
  let pinDisplay = $state('');
  let pinSaving = $state(false);
  let pinError = $state('');
  let pinPrinting = $state(false);

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
  let assignableRegisters = $derived(registers.filter((r) => r.is_active || formRegisterIds.includes(r.id)));

  function openCreate() {
    editing = null; formName = ''; formPassword = ''; formIsAdmin = false; formIsEventAdmin = false; formActive = true;
    formRegisterIds = []; formError = '';
    modalOpen = true;
  }

  async function openEdit(u: User) {
    editing = u; formName = u.name; formPassword = '';
    formIsAdmin = u.is_admin; formIsEventAdmin = u.is_event_admin; formActive = u.is_active; formError = '';
    formRegisterIds = await api.admin.users.listRegisters(u.id).catch(() => []);
    modalOpen = true;
  }

  async function save() {
    formError = ''; saving = true;
    try {
      const needsAdminLevel = formIsAdmin || formIsEventAdmin;
      if (editing) {
        const hadAdminLevel = editing.is_admin || editing.is_event_admin;
        if (needsAdminLevel && !formPassword && !hadAdminLevel) {
          formError = 'Passwort erforderlich für Administrator';
          saving = false;
          return;
        }
        const data: { name?: string; password?: string; is_admin?: boolean; is_event_admin?: boolean; is_active?: boolean } =
          { name: formName, is_event_admin: formIsEventAdmin, is_active: formActive };
        if ($adminUser?.is_admin) data.is_admin = formIsAdmin;
        if (formPassword) data.password = formPassword;
        await api.admin.users.update(editing.id, data);
        await api.admin.users.setRegisters(editing.id, formRegisterIds);
      } else {
        if (needsAdminLevel && !formPassword) { formError = 'Passwort erforderlich für Administrator'; saving = false; return; }
        const created = await api.admin.users.create({
          name: formName, password: formPassword || '', is_admin: formIsAdmin, is_event_admin: formIsEventAdmin,
        });
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

  /** Strips separators/whitespace and uppercases — same normalization as the PIN login field. */
  function normalizePin(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
  }

  /** Re-inserts the `XXX-XXX-XXX` hyphens for display. */
  function formatPin(normalized: string): string {
    const groups: string[] = [];
    for (let i = 0; i < normalized.length; i += 3) groups.push(normalized.slice(i, i + 3));
    return groups.join('-');
  }

  function onPinInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    pinDisplay = formatPin(normalizePin(target.value));
  }

  /**
   * Opens the PIN modal with an empty field — deliberately not pre-filled
   * with a generated candidate, so it can never look like "this is the
   * existing PIN" (the actual PIN is never retrievable, only its hash is
   * stored). A candidate only appears after an explicit "Neu erzeugen" click.
   */
  function openPinModal(u: UserRow) {
    pinModalUser = u;
    pinError = '';
    pinDisplay = '';
    pinModal = true;
  }

  /** Fetches another random candidate, discarding the current one (not yet saved). */
  async function regeneratePin() {
    if (!pinModalUser) return;
    pinError = '';
    try {
      const { pin } = await api.admin.users.generatePin(pinModalUser.id);
      pinDisplay = pin;
    } catch (e) {
      pinError = e instanceof Error ? e.message : 'Fehler';
    }
  }

  async function savePin() {
    if (!pinModalUser) return;
    pinSaving = true; pinError = '';
    try {
      await api.admin.users.setPin(pinModalUser.id, normalizePin(pinDisplay));
      pinModal = false;
      await load();
    } catch (e) {
      pinError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      pinSaving = false;
    }
  }

  function copyPin() { copyToClipboard(pinDisplay); }

  /**
   * Prints the currently displayed PIN (saved or not) on the default
   * printer, after an explicit confirmation — the slip shows the PIN in
   * clear text, so this shouldn't happen by an accidental click.
   */
  async function printPin() {
    if (!pinModalUser) return;
    if (!confirm('Achtung, die PIN wird am Standarddrucker ausgedruckt.')) return;
    pinPrinting = true; pinError = '';
    try {
      await api.admin.users.printPin(pinModalUser.id, normalizePin(pinDisplay));
    } catch (e) {
      pinError = e instanceof Error ? e.message : 'Fehler';
    } finally {
      pinPrinting = false;
    }
  }

  function toggleRegister(id: string) {
    if (formRegisterIds.includes(id)) {
      formRegisterIds = formRegisterIds.filter((r) => r !== id);
    } else {
      formRegisterIds = [...formRegisterIds, id];
    }
  }

  const isSelf = (u: User) => u.id === $adminUser?.id;

  /**
   * Whether the current form's password field may be shown — hidden for a
   * Veranstaltungs-Administrator editing an existing System-Administrator,
   * since setting a new password would let them take over that account
   * without ever touching is_admin directly (backend enforces the same rule).
   */
  let canSetPassword = $derived.by(() => {
    if (!formIsAdmin && !formIsEventAdmin) return false;
    const target = editing;
    if (!target || !target.is_admin) return true;
    return Boolean($adminUser?.is_admin);
  });

  /** Combined role label — a user can hold either admin flag, both, or neither (Task #94). */
  function roleLabel(u: User): string {
    const roles: string[] = [];
    if (u.is_admin) roles.push('System-Administrator');
    if (u.is_event_admin) roles.push('Veranstaltungs-Administrator');
    return roles.length > 0 ? roles.join(' + ') : 'Bediener';
  }

  const typeLabel = (t: string) => t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';
</script>

<div class="page">
  <div class="page-header">
    <h1>Benutzer</h1>
    <button class="btn-primary" onclick={openCreate}>+ Neu</button>
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
            <td>{roleLabel(u)}</td>
            <td>{#if !u.is_active}<span class="archived-badge">Deaktiviert</span>{:else}<span class="muted small">aktiv</span>{/if}</td>
            <td class="num">{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
            <td class="actions">
              <button class="btn-primary login-btn" onclick={() => openPinModal(u)} disabled={!u.is_active}>
                {u.has_pin ? 'PIN ändern' : 'PIN vergeben'}
              </button>
              <button class="btn-ghost" onclick={() => openEdit(u)}>Bearbeiten</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<Modal bind:open={modalOpen} title={editing ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}>
  <form onsubmit={preventDefault(save)}>
    <div class="field">
      <label for="u-name">Name</label>
      <input id="u-name" bind:value={formName} required disabled={saving || deleting} />
    </div>
    {#if $adminUser?.is_admin}
      <div class="field-check">
        <input type="checkbox" id="u-admin" bind:checked={formIsAdmin}
               disabled={saving || deleting || (editing !== null && isSelf(editing))} />
        <label for="u-admin">System-Administrator (voller Zugriff)</label>
      </div>
    {/if}
    <div class="field-check">
      <input type="checkbox" id="u-event-admin" bind:checked={formIsEventAdmin}
             disabled={saving || deleting} />
      <label for="u-event-admin">Veranstaltungs-Administrator (Zugriff beschränkt auf die aktive Veranstaltung)</label>
    </div>
    {#if canSetPassword}
      <div class="field">
        <label for="u-pw">{editing ? 'Neues Passwort (leer = unverändert)' : 'Passwort'}</label>
        <input id="u-pw" type="password" bind:value={formPassword}
               required={!editing && (formIsAdmin || formIsEventAdmin)} disabled={saving || deleting} />
      </div>
    {/if}
    {#if editing}
      <div class="field-check">
        <input type="checkbox" id="u-active" bind:checked={formActive} disabled={saving || deleting || (editing !== null && isSelf(editing))} />
        <label for="u-active">Aktiv</label>
      </div>
      {#if !formActive}
        <p class="hint">Deaktivierte Benutzer können sich nicht mehr anmelden (auch nicht per PIN) und werden aus der Kassenzuweisung ausgeblendet, bleiben aber vollständig in der Datenbank erhalten.</p>
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
                     onchange={() => toggleRegister(r.id)}
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

<Modal bind:open={pinModal} title={pinModalUser ? `PIN — ${pinModalUser.name}` : 'PIN'}>
  <div class="pin-box">
    <p class="muted">
      Diese PIN identifiziert und authentifiziert den Benutzer beim Anmelden —
      kein zusätzlicher Benutzername nötig. Selbst eingeben oder über
      „Neu erzeugen" vorschlagen lassen.
    </p>
    <input
      class="pin-input"
      type="text"
      value={pinDisplay}
      oninput={onPinInput}
      placeholder="XXX-XXX-XXX"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="characters"
      spellcheck="false"
      disabled={pinSaving}
    />
    {#if pinError}<p class="error-text small">{pinError}</p>{/if}
    <!-- Utility actions on their own row — five buttons in one un-wrapped
         .modal-actions row overflowed the dialog on narrower screens
         (found live, 2026-08-29). Kept separate from the primary
         Abbrechen/Speichern row rather than just wrapping, so a wrapped
         "Speichern" doesn't end up looking like it belongs with these. -->
    <div class="pin-utility-actions">
      <button class="btn-ghost" onclick={regeneratePin} disabled={pinSaving}>Neu erzeugen</button>
      <button class="btn-ghost" onclick={copyPin} disabled={!pinDisplay}>Kopieren</button>
      <button class="btn-ghost" onclick={printPin} disabled={pinPrinting || normalizePin(pinDisplay).length !== 9}>
        {pinPrinting ? 'Drucke…' : 'PIN drucken'}
      </button>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick={() => (pinModal = false)} disabled={pinSaving}>Abbrechen</button>
      <button class="btn-primary" onclick={savePin} disabled={pinSaving || normalizePin(pinDisplay).length !== 9}>
        {pinSaving ? 'Speichern…' : 'Speichern'}
      </button>
    </div>
  </div>
</Modal>

<style>
  .self-badge {
    font-size: 0.7rem; padding: 0.1rem 0.4rem;
    background: rgba(79,124,255,0.12); color: var(--color-primary);
    border-radius: 4px; margin-left: 0.35rem; vertical-align: middle;
  }
  .pin-box { display: flex; flex-direction: column; gap: 1rem; align-items: stretch; }
  .pin-utility-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .pin-input {
    padding: 0.75rem 1rem;
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text);
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    font-size: 1.3rem; letter-spacing: 0.15em; text-align: center;
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
