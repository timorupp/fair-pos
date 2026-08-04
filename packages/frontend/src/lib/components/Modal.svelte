<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** Whether the modal is visible. Use bind:open to control from parent. */
  export let open = false;
  /** Title shown in the modal header. */
  export let title = '';

  const dispatch = createEventDispatcher<{ close: void }>();

  /**
   * Closes the modal AND emits a `close` event. Callers that need to react to
   * the user dismissing the modal (X / backdrop / Escape) should listen for
   * `on:close` — relying on `bind:open` alone gives a reactive cascade that
   * Svelte doesn't always sequence consistently across nested updates.
   */
  function close(): void {
    open = false;
    dispatch('close');
  }

  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div class="backdrop" role="presentation" on:click={close}>
    <div class="modal" role="dialog" aria-modal="true" on:click|stopPropagation>
      <div class="modal-header">
        <h2>{title}</h2>
        <button class="close-btn" on:click={close} aria-label="Schließen">✕</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    width: 100%;
    max-width: 440px;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 1rem;
    padding: 0.25rem;
    line-height: 1;
    transition: color 0.15s;
  }

  .close-btn:hover { color: var(--color-text); }

  .modal-body {
    padding: 1.5rem;
  }
</style>
