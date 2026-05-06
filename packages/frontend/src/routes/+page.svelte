<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentUser } from '$lib/stores/user';

  onMount(() => {
    if ($currentUser?.is_admin) goto('/admin', { replaceState: true });
  });
</script>

{#if $currentUser && !$currentUser.is_admin}
  <main>
    <p class="hint">Bediener-Ansicht folgt…</p>
  </main>
{/if}

<style>
  main {
    display: flex; align-items: center; justify-content: center;
    min-height: 100dvh;
  }
  .hint { color: var(--color-text-muted); }
</style>
