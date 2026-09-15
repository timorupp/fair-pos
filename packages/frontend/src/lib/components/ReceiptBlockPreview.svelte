<script lang="ts">
  /**
   * Renders a `PrintBlock[]` (the same format-independent model the ESC/POS
   * and PDF renderers already build from, see
   * `packages/backend/src/print/blocks.ts`) as narrow, bon-like HTML — Task
   * #147's on-screen receipt preview. Purely presentational: no data
   * fetching, no state beyond what it's handed.
   *
   * Deliberately fixed to a light, paper-like background regardless of the
   * app's own theme — it's meant to look like the physical receipt, not
   * blend into the surrounding UI.
   */
  import type { PrintBlock } from '$lib/api';

  interface Props { blocks: PrintBlock[] }
  let { blocks }: Props = $props();
</script>

<div class="receipt-preview">
  {#each blocks as b, i (i)}
    {#if b.kind === 'text'}
      <p class="text" class:bold={b.bold} class:center={b.align === 'center'} class:large={b.size === 'large'} class:xlarge={b.size === 'xlarge'}>{b.text}</p>
    {:else if b.kind === 'row'}
      <div class="row" class:bold={b.bold} class:large={b.size === 'large'} class:xlarge={b.size === 'xlarge'}>
        <span class="row-left">{b.left}</span>
        <span class="row-right">{b.right}</span>
      </div>
    {:else if b.kind === 'hr'}
      <hr />
    {:else if b.kind === 'blank'}
      <div class="blank"></div>
    {:else if b.kind === 'image'}
      <div class="image-wrap">
        <img src={`data:image/png;base64,${b.pngBase64}`} alt="" style={`width: ${b.widthFactor * 100}%`} />
      </div>
    {/if}
  {/each}
</div>

<style>
  /* Fixed light "paper" look on purpose — mimics the physical receipt regardless of the app's own theme. */
  .receipt-preview {
    font-family: 'Courier New', Courier, monospace;
    max-width: 320px; margin: 0 auto;
    background: #fff; color: #111;
    padding: 1rem; border: 1px solid #ddd; border-radius: var(--radius-sm);
    font-size: 0.75rem; line-height: 1.45;
  }
  .text { margin: 0 0 0.2rem; white-space: pre-wrap; overflow-wrap: break-word; }
  .text.center { text-align: center; }
  .text.bold { font-weight: 700; }
  .text.large { font-size: 0.9rem; }
  .text.xlarge { font-size: 1.15rem; }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem; }
  .row.bold { font-weight: 700; }
  .row.large { font-size: 0.9rem; }
  .row.xlarge { font-size: 1.15rem; }
  .row-left { text-align: left; overflow-wrap: anywhere; }
  .row-right { text-align: right; white-space: nowrap; }
  hr { border: none; border-top: 1px solid #111; margin: 0.4rem 0; }
  .blank { height: 0.6rem; }
  .image-wrap { display: flex; justify-content: center; margin: 0.4rem 0; }
  .image-wrap img { max-width: 100%; height: auto; }
</style>
