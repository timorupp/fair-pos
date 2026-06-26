<script lang="ts">
  /**
   * Root layout — intentionally has no session check.
   *
   * Two completely separate sessions exist (admin vs. register). Each sub-area
   * runs its own auth gate in `+layout.svelte`. The root only ships the global
   * CSS reset and theme variables so even the public `/receipt/:token` PDF page
   * and the login page can render before any auth API is touched.
   */
</script>

<slot />

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

  /* Spinner animation reused across sub-layouts and the login page. */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
