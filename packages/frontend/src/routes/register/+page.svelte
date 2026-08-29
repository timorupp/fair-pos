<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { adminUser, registerUser } from '$lib/stores/user';
  import Modal from '$lib/components/Modal.svelte';

  type RegisterRow = {
    id: string; name: string;
    type: 'receipt_register' | 'service_register';
    printer_id: string | null; layout_id: string | null;
    locked: boolean; pending_days: string[];
  };

  let registers: RegisterRow[] = $state([]);
  /** Whether the logged-in user is admin-flagged — drives the "Systemverwaltung" button (Task #90). */
  let isAdmin = $state(false);
  let loading = $state(true);
  let error = $state('');

  // Systemverwaltung password step-up (Task #90) — asked once per session;
  // `openSystemverwaltung` tries `/admin/me` first and only shows this if
  // that comes back "not verified yet".
  let verifyOpen = $state(false);
  let verifyPassword = $state('');
  let verifyError = $state('');
  let verifying = $state(false);

  onMount(async () => {
    try {
      const me = await api.registerSession.me();
      registers = me.registers;
      isAdmin = me.user.is_admin;
      // If exactly one register is assigned, skip the selection screen —
      // but never for an admin, who needs the chance to reach
      // Systemverwaltung instead of being routed straight past this screen.
      if (!isAdmin && registers.length === 1) {
        goto(`/register/${registers[0]!.id}`, { replaceState: true });
        return;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      loading = false;
    }
  });

  const typeLabel = (t: RegisterRow['type']) =>
    t === 'receipt_register' ? 'Bonkasse' : 'Bedienungskasse';

  /** Ends the current session (Task #90: one session for everyone, not separate admin/register cookies). */
  async function logout() {
    try { await api.auth.logout(); } catch { /* ignore */ }
    registerUser.set(null);
    adminUser.set(null);
    goto('/login');
  }

  /**
   * Opens the admin area. If this session already passed the password
   * step-up (e.g. an earlier visit this session), goes straight there;
   * otherwise shows the password prompt.
   */
  async function openSystemverwaltung() {
    try {
      const user = await api.auth.admin.me();
      adminUser.set(user);
      goto('/admin');
    } catch (e) {
      if (e && typeof e === 'object' && 'needs_admin_verification' in e) {
        verifyError = '';
        verifyPassword = '';
        verifyOpen = true;
      } else {
        error = e instanceof Error ? e.message : 'Fehler';
      }
    }
  }

  /** Submits the Systemverwaltung password prompt. */
  async function confirmVerify() {
    verifying = true;
    verifyError = '';
    try {
      await api.auth.admin.verify(verifyPassword);
      const user = await api.auth.admin.me();
      adminUser.set(user);
      verifyOpen = false;
      goto('/admin');
    } catch (e) {
      verifyError = e instanceof Error ? e.message : 'Falsches Passwort';
    } finally {
      verifying = false;
    }
  }
</script>

<div class="page">
  <h1>Kasse wählen</h1>
  {#if loading}
    <p class="muted">Lade…</p>
  {:else if error}
    <p class="error-text">{error}</p>
  {:else if registers.length === 0}
    <p class="muted">Dir ist keine Kasse zugewiesen. Bitte den Administrator kontaktieren.</p>
  {:else}
    <div class="grid">
      {#each registers as r}
        <a class="card" class:locked={r.locked} href="/register/{r.id}">
          <div class="card-name">{r.name}</div>
          <div class="card-type">{typeLabel(r.type)}</div>
          {#if r.locked}
            <div class="card-lock">🔒 {r.pending_days.length} Tag{r.pending_days.length === 1 ? '' : 'e'} ausstehend</div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}

  {#if !loading && isAdmin}
    <div class="admin-row">
      <button class="btn-ghost" onclick={openSystemverwaltung}>Systemverwaltung</button>
    </div>
  {/if}

  <div class="footer">
    <button class="btn-ghost" onclick={logout}>Abmelden</button>
  </div>
</div>

<Modal bind:open={verifyOpen} title="Systemverwaltung">
  <p class="muted small">Bitte Passwort eingeben, um in die Systemverwaltung zu wechseln.</p>
  <form onsubmit={(e) => { e.preventDefault(); confirmVerify(); }}>
    <label class="field-label">
      Passwort
      <input type="password" bind:value={verifyPassword} autocomplete="current-password" disabled={verifying} required />
    </label>
    {#if verifyError}<p class="error-text small">{verifyError}</p>{/if}
    <div class="modal-actions">
      <button type="button" class="btn-ghost" onclick={() => (verifyOpen = false)} disabled={verifying}>Abbrechen</button>
      <div class="spacer"></div>
      <button type="submit" class="btn-primary" disabled={verifying || !verifyPassword}>
        {verifying ? 'Prüfe…' : 'Weiter'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .page { padding: 2rem; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 1.25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .admin-row { margin-top: 1.5rem; display: flex; justify-content: center; }
  .footer { margin-top: 1rem; display: flex; justify-content: center; }
  .card {
    display: flex; flex-direction: column; gap: 0.5rem;
    padding: 1.5rem; border: 1px solid var(--color-border); border-radius: var(--radius);
    background: var(--color-surface); text-decoration: none; color: var(--color-text);
    transition: border-color 0.15s, transform 0.05s;
  }
  .card:hover { border-color: var(--color-primary); transform: translateY(-1px); }
  .card-name { font-size: 1.1rem; font-weight: 600; }
  .card-type { font-size: 0.85rem; color: var(--color-text-muted); }
  .card.locked { background: #f59e0b22; border-color: #f59e0b88; }
  .card-lock { font-size: 0.85rem; font-weight: 600; color: #c87a00; }

  .small { font-size: 0.85rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
  .field-label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; color: var(--color-text-muted); }
  .field-label input { padding: 0.6rem 0.75rem; font-size: 1rem; }
  .modal-actions { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
  .modal-actions .spacer { flex: 1; }
</style>
