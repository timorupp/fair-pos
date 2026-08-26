<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';
  import { registerUser } from '$lib/stores/user';

  type RegisterRow = {
    id: string; name: string;
    type: 'receipt_register' | 'service_register';
    printer_id: string | null; layout_id: string | null;
    locked: boolean; pending_days: string[];
  };

  let registers: RegisterRow[] = $state([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const me = await api.registerSession.me();
      registers = me.registers;
      // If exactly one register is assigned, skip the selection screen.
      if (registers.length === 1) {
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

  /** Clears only the register-session cookie; an admin session, if any, stays. */
  async function logout() {
    try { await api.auth.register.logout(); } catch { /* ignore */ }
    registerUser.set(null);
    goto('/login');
  }
</script>

<div class="page">
  <div class="header">
    <h1>Kasse wählen</h1>
    <button class="btn-ghost" onclick={logout}>Abmelden</button>
  </div>
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
</div>

<style>
  .page { padding: 2rem; max-width: 720px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
  h1 { font-size: 1.25rem; margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
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
</style>
