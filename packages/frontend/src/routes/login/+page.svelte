<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  /**
   * Combined login page. Two flows:
   *  - `?token=…` query → exchanges the QR token via `auth.register.token` and
   *    redirects to `/register` (cash-register UI).
   *  - Username + password form → admin login via `auth.admin.login` and
   *    redirect to `/admin` (admin UI).
   *
   * Each flow only writes to its own session cookie; the other (if any) is
   * untouched.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { adminUser, registerUser } from '$lib/stores/user';
  import { api } from '$lib/api';

  let name = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  /** Hides the password form while we're exchanging a token from the URL. */
  let exchangingToken = $state(false);

  onMount(async () => {
    const token = page.url.searchParams.get('token');
    if (!token) return;

    exchangingToken = true;
    try {
      const user = await api.auth.register.token(token);
      registerUser.set(user);
      // QR-token logins land in the cash-register UI, not the admin area.
      goto('/register', { replaceState: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Token ungültig oder abgelaufen';
    } finally {
      exchangingToken = false;
    }
  });

  /**
   * Submits the admin login form. On success, stores the admin user and routes
   * to `/admin`.
   */
  async function handleLogin() {
    error = '';
    loading = true;
    try {
      const user = await api.auth.admin.login(name, password);
      adminUser.set(user);
      goto('/admin');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen';
    } finally {
      loading = false;
    }
  }
</script>

<main>
  <div class="card">
    <div class="brand">
      <div class="brand-icon">⊕</div>
      <h1>FairPOS</h1>
      <p class="brand-sub">Kassensystem</p>
    </div>

    {#if exchangingToken}
      <div class="exchanging">
        <span class="btn-spinner"></span>
        <span>Token wird geprüft…</span>
      </div>
    {:else}
    <form onsubmit={preventDefault(handleLogin)}>
      <div class="field">
        <label for="name">Benutzername</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          autocomplete="username"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          disabled={loading}
          required
        />
      </div>

      <div class="field">
        <label for="password">Passwort</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          disabled={loading}
          required
        />
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" class="btn-primary" disabled={loading}>
        {#if loading}
          <span class="btn-spinner"></span>
          Anmelden…
        {:else}
          Anmelden
        {/if}
      </button>
    </form>
    {/if}
  </div>
</main>

<style>
  main {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 1rem;
    background:
      radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79, 124, 255, 0.15), transparent),
      var(--color-bg);
  }

  .card {
    width: 100%;
    max-width: 380px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 2.5rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .brand-icon {
    font-size: 2.5rem;
    color: var(--color-primary);
    line-height: 1;
    margin-bottom: 0.25rem;
  }

  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-text);
  }

  .brand-sub {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  input {
    padding: 0.75rem 1rem;
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 1rem;
    transition: border-color 0.15s;
    outline: none;
    width: 100%;
  }

  input:focus {
    border-color: var(--color-primary);
  }

  input:disabled {
    opacity: 0.5;
  }

  .error {
    padding: 0.65rem 1rem;
    background: rgba(255, 79, 79, 0.1);
    border: 1px solid rgba(255, 79, 79, 0.3);
    border-radius: var(--radius-sm);
    color: var(--color-danger);
    font-size: 0.875rem;
  }

  /* Rest state muted, hover/press step up through the original accent tones — see admin/+layout.svelte for the full rationale (kept consistent app-wide). */
  .btn-primary {
    margin-top: 0.5rem;
    padding: 0.85rem;
    background: color-mix(in srgb, var(--color-primary) 78%, black);
    border: none;
    border-radius: var(--radius-sm);
    color: #eef1fb;
    font-size: 1rem;
    font-weight: 600;
    transition: background 0.15s, opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 52px;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary);
  }

  .btn-primary:active:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .exchanging {
    display: flex; align-items: center; justify-content: center;
    gap: 0.6rem; padding: 1rem; color: var(--color-text-muted);
  }
  .exchanging .btn-spinner { border-top-color: var(--color-primary); }
</style>
