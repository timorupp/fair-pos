<script lang="ts">
  /**
   * Landing page — pure router. Probes both sessions:
   *   - admin session → `/admin`
   *   - register session → `/register`
   *   - no session → `/login`
   *
   * Doesn't show any UI other than a transient "Weiterleiten…" message.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  onMount(async () => {
    try { await api.auth.admin.me(); goto('/admin', { replaceState: true }); return; } catch { /* no admin */ }
    try { await api.auth.register.me(); goto('/register', { replaceState: true }); return; } catch { /* no register */ }
    goto('/login', { replaceState: true });
  });
</script>

<main>
  <p class="hint">Weiterleiten…</p>
</main>

<style>
  main {
    display: flex; align-items: center; justify-content: center;
    min-height: 100dvh;
  }
  .hint { color: var(--color-text-muted); }
</style>
