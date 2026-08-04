<script lang="ts">
  /**
   * Layout for the cash-register UIs. Reads the register-session cookie and
   * redirects to `/login` if absent. Independent of the admin session — both
   * can be active simultaneously.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api } from '$lib/api';
  import { registerUser } from '$lib/stores/user';
  import { currentRegisterName } from '$lib/stores/page-title';

  let checking = true;
  // Hide the "Kasse wechseln" button on the register-picker page itself —
  // there is nothing to switch back to from there.
  $: onRegisterPicker = $page.url.pathname === '/register';
  // Browser-tab title — falls back to a generic label until a sub-page tells
  // us which cash register the operator is on. See `lib/stores/page-title.ts`.
  $: tabTitle = $currentRegisterName ? `${$currentRegisterName} — FairPOS` : 'Kasse — FairPOS';

  onMount(async () => {
    try {
      const user = await api.auth.register.me();
      registerUser.set(user);
    } catch {
      // No register session → back to the login page; the token URL handles re-entry.
      goto('/login');
      return;
    } finally {
      checking = false;
    }
  });

  /** Clears only the register-session cookie; an admin session, if any, stays. */
  async function logout() {
    try { await api.auth.register.logout(); } catch { /* ignore */ }
    registerUser.set(null);
    goto('/login');
  }
</script>

<svelte:head><title>{tabTitle}</title></svelte:head>

<div class="shell">
  <header class="topbar">
    <div class="brand">FairPOS — Kasse</div>
    <div class="spacer"></div>
    {#if $registerUser}
      <span class="user-name">{$registerUser.name}</span>
      {#if !onRegisterPicker}
        <button class="btn-ghost" on:click={() => goto('/register')}>Kasse wechseln</button>
      {/if}
      <button class="btn-ghost" on:click={logout}>Abmelden</button>
    {/if}
  </header>

  {#if checking}
    <p class="muted center">Prüfe Sitzung…</p>
  {:else}
    <slot />
  {/if}
</div>

<style>
  .shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); }
  .topbar {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.6rem 1rem; background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .brand { font-weight: 700; font-size: 0.95rem; }
  .spacer { flex: 1; }
  .user-name { font-size: 0.85rem; color: var(--color-text-muted); }
  .center { text-align: center; padding: 4rem; }

  /* ── Touch-friendly button sizing inside the cash-register UIs ──
     Targets the Anforderungen rule "Kassen laufen auf Tablet/Smartphone".
     Every button is at least 48 px tall — the Material Design / Apple HIG
     minimum tap-target. Specific sizes still win via the local stylesheet. */
  :global(.register-shell .btn-primary),
  :global(.register-shell .btn-ghost),
  :global(.order-page .btn-primary),
  :global(.order-page .btn-ghost),
  :global(.page .btn-primary),
  :global(.page .btn-ghost) {
    min-height: 48px;
    padding: 0.6rem 1rem;
    font-size: 1rem;
  }
  /* Modal action buttons in the cash-register flow are extra prominent so they
     match the "Kassieren" button visually. */
  :global(.modal-actions .btn-primary),
  :global(.modal-actions .btn-ghost) {
    min-height: 56px;
    padding: 0.8rem 1.5rem;
    font-size: 1rem;
  }
  /* Quantity steppers (+ / −) need to be fat-finger-safe too. */
  :global(.qty-btn),
  :global(.step-btn) {
    min-width: 44px !important;
    min-height: 44px !important;
    width: 44px !important;
    height: 44px !important;
    font-size: 1.25rem !important;
  }
</style>
