<script lang="ts">
  import { createBubbler, stopPropagation } from 'svelte/legacy';

  const bubble = createBubbler();
  import { createEventDispatcher } from 'svelte';

  
  
  interface Props {
    /** Whether the modal is visible. Use bind:open to control from parent. */
    open?: boolean;
    /** Title shown in the modal header. */
    title?: string;
    children?: import('svelte').Snippet;
  }

  let { open = $bindable(false), title = '', children }: Props = $props();

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

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div class="backdrop" role="presentation" onclick={close}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={stopPropagation(bubble('click'))}>
      <div class="modal-header">
        <h2>{title}</h2>
        <button class="close-btn" onclick={close} aria-label="Schließen">✕</button>
      </div>
      <div class="modal-body">
        {@render children?.()}
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
    /* `dvh` first would be ideal, but a browser that doesn't support it
       drops the whole declaration — falling back to `vh` here means the
       modal always gets SOME height cap (found live, 2026-08-27: a long
       list — e.g. Task #88's "Position wählen" step — could otherwise grow
       past the screen with no scrollbar at all, not even a squished one). */
    max-height: 90vh;
    max-height: 90dvh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
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
    overflow-y: auto;
    /* Without this, a flex child with overflow-y:auto refuses to shrink
       below its content's natural height — the classic "flexbox ignores my
       overflow rule" trap — and the scrollbar never appears even with the
       max-height fix above in place. */
    min-height: 0;
  }
</style>
