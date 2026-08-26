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
  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  let checking = $state(true);
  // Hide the "Kasse wechseln" button on the register-picker page itself —
  // there is nothing to switch back to from there.
  let onRegisterPicker = $derived($page.url.pathname === '/register');
  // Browser-tab title — falls back to a generic label until a sub-page tells
  // us which cash register the operator is on. See `lib/stores/page-title.ts`.
  let tabTitle = $derived($currentRegisterName ? `${$currentRegisterName} — FairPOS` : 'Kasse — FairPOS');

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

</script>

<svelte:head><title>{tabTitle}</title></svelte:head>

<div class="shell">
  <header class="topbar">
    <div class="brand"><span class="brand-icon">⊕</span> FairPOS</div>
    <div class="spacer"></div>
    {#if $registerUser}
      <span class="user-name">{$registerUser.name}</span>
      {#if !onRegisterPicker}
        <button class="btn-ghost icon-btn" onclick={() => goto('/register')} aria-label="Kasse wechseln" title="Kasse wechseln">⌂</button>
      {/if}
    {/if}
  </header>

  {#if checking}
    <p class="muted center">Prüfe Sitzung…</p>
  {:else}
    {@render children?.()}
  {/if}
</div>

<style>
  .shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); }
  .topbar {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.6rem 1rem; background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .brand { display: flex; align-items: center; gap: 0.35rem; font-weight: 700; font-size: 0.95rem; }
  .brand-icon { font-size: 1.1rem; color: var(--color-primary); line-height: 1; }
  .spacer { flex: 1; }
  .user-name { font-size: 0.85rem; color: var(--color-text-muted); }
  .icon-btn {
    width: 44px; height: 44px; padding: 0; font-size: 1.3rem;
    display: flex; align-items: center; justify-content: center;
  }
  .center { text-align: center; padding: 4rem; }

  /*
   * Base colors for .btn-primary/.btn-ghost — duplicated from
   * admin/+layout.svelte rather than shared, because admin and register are
   * separate top-level route trees with their own code-split CSS chunk (the
   * register UI never loads admin's layout, or vice versa) — confirmed via
   * the build output when a button-contrast fix applied only to admin
   * turned out to never have reached here. Keep both in sync by hand if
   * either changes.
   */
  :global(.btn-primary) {
    padding: 0.5rem 1rem; background: color-mix(in srgb, var(--color-primary) 78%, black); border: none;
    border-radius: var(--radius-sm); color: #eef1fb; font-size: 0.875rem;
    font-weight: 600; transition: background 0.15s;
  }
  :global(.btn-primary:hover) { background: var(--color-primary); }
  :global(.btn-primary:active) { background: var(--color-primary-hover); }
  :global(.btn-primary:disabled) { opacity: 0.5; cursor: not-allowed; }

  :global(.btn-ghost) {
    padding: 0.35rem 0.65rem; background: transparent; border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: 0.8rem;
    transition: border-color 0.15s, color 0.15s;
  }
  :global(.btn-ghost:hover) { border-color: var(--color-text-muted); color: var(--color-text); }
  :global(.btn-ghost.danger:hover) { border-color: var(--color-danger); color: var(--color-danger); }
  :global(.btn-ghost:disabled) { opacity: 0.5; cursor: not-allowed; }

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
