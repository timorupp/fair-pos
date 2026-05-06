<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { currentUser } from '$lib/stores/user';
  import { api } from '$lib/api';

  let checking = true;

  onMount(async () => {
    try {
      const user = await api.auth.me();
      currentUser.set(user);
    } catch {
      currentUser.set(null);
      if ($page.url.pathname !== '/login') {
        goto('/login');
      }
    } finally {
      checking = false;
    }
  });
</script>

{#if checking}
  <div class="splash">
    <span class="spinner" />
  </div>
{:else}
  <slot />
{/if}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(:root) {
    --color-bg: #0f1117;
    --color-surface: #1c1f2e;
    --color-surface-2: #252839;
    --color-border: #2e3347;
    --color-primary: #4f7cff;
    --color-primary-hover: #6b91ff;
    --color-danger: #ff4f4f;
    --color-text: #e8eaf0;
    --color-text-muted: #7b80a0;
    --color-success: #3ecf8e;
    --radius: 10px;
    --radius-sm: 6px;
    font-family: system-ui, -apple-system, sans-serif;
    color: var(--color-text);
    background: var(--color-bg);
  }

  :global(body) {
    min-height: 100dvh;
    background: var(--color-bg);
  }

  :global(input) {
    font-family: inherit;
    font-size: 1rem;
  }

  :global(button) {
    font-family: inherit;
    cursor: pointer;
  }

  .splash {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
  }

  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
