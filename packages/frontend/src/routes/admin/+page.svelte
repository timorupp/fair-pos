<script lang="ts">
  import { onMount } from 'svelte';
  import { adminUser } from '$lib/stores/user';
  import { api } from '$lib/api';

  /** Drift in whole seconds between this browser's clock and the server's, or `null` before the first check / on error. */
  let driftSeconds: number | null = $state(null);

  /**
   * Compares the browser's own clock against the server's (Task #60) — the
   * TSE syncs its time against the *server's* system clock, so a drift here
   * is worth flagging early. 30s threshold: small clock skew is normal and
   * harmless, this is meant to catch a genuinely wrong system clock.
   */
  onMount(async () => {
    try {
      const status = await api.admin.system.status();
      const serverTime = new Date(status.server_time).getTime();
      driftSeconds = Math.round((Date.now() - serverTime) / 1000);
    } catch {
      // Silent — this is a soft, informational check; the System-Seite itself surfaces load errors.
    }
  });
</script>

<div class="page">
  <div class="page-header">
    <h1>Dashboard</h1>
  </div>

  {#if driftSeconds !== null && Math.abs(driftSeconds) > 30}
    <a class="drift-banner" href="/admin/settings/system">
      <strong>⚠ Uhrzeit-Abweichung erkannt</strong>
      Serverzeit liegt {Math.abs(driftSeconds)} Sekunden {driftSeconds > 0 ? 'hinter' : 'vor'} der Browserzeit
      dieses Geräts — relevant für die TSE-Zeitsynchronisation. In den Systemeinstellungen prüfen/korrigieren.
    </a>
  {/if}

  <p class="muted">Willkommen, {$adminUser?.name}. Wähle links einen Bereich aus.</p>
</div>

<style>
  .drift-banner {
    display: block;
    background: #f59e0b22;
    border: 1px solid #f59e0b88;
    color: var(--color-text);
    padding: 0.75rem 1.25rem;
    border-radius: var(--radius);
    margin-bottom: 1rem;
    font-size: 0.9rem;
    text-decoration: none;
    transition: background 0.1s;
  }
  .drift-banner:hover { background: #f59e0b33; }
  .drift-banner strong { display: block; color: #c87a00; margin-bottom: 0.15rem; }
</style>
