/** Options for the {@link longpress} action. */
export interface LongpressOptions {
  /** Invoked once the hold completes. */
  onHold: () => void;
  /** How long the pointer must stay down before `onHold` fires. Default 600ms. */
  durationMs?: number;
}

/**
 * Svelte action for "hold to confirm" buttons — critical actions (checkout,
 * place order) that shouldn't fire from an accidental tap. Calls
 * `options.onHold` only once the pointer has been held down on the element
 * continuously for `options.durationMs`; releasing early cancels it and
 * nothing happens.
 *
 * Toggles a `holding` class on the element for the duration of the press,
 * meant to drive a purely cosmetic CSS fill animation (see the
 * `.hold-btn`/`.hold-fill` pattern at each call site) — the timer here is
 * the actual source of truth for whether the action fires, the CSS is just
 * visual feedback and doesn't need to be perfectly in sync.
 *
 * @param node - The button element to attach the hold gesture to.
 * @param options - Callback plus optional hold duration — see {@link LongpressOptions}.
 * @returns Svelte action lifecycle object (`destroy` detaches all listeners).
 */
export function longpress(node: HTMLElement, options: LongpressOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Whether the element is currently disabled — checked both at press-start and again when the hold completes, in case its disabled state changes mid-press. */
  function isDisabled(): boolean {
    return node instanceof HTMLButtonElement && node.disabled;
  }

  function start(e: PointerEvent) {
    if (e.button !== 0) return; // primary touch / left mouse button only
    if (isDisabled()) return;
    node.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      node.classList.remove('holding');
      if (isDisabled()) return;
      options.onHold();
    }, options.durationMs ?? 600);
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    node.classList.remove('holding');
  }

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('pointercancel', cancel);

  return {
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('pointercancel', cancel);
    },
  };
}
