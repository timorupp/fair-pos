<script lang="ts">
  import { preventDefault } from 'svelte/legacy';

  /**
   * PIN login (Task #90) — the only way in, admin or not. The PIN identifies
   * and authenticates in one step (no username field) — see
   * `packages/backend/src/auth/pin.ts` for the format and rationale. Always
   * lands on `/register` (Kassenauswahl); an admin-flagged user sees an
   * additional "Systemverwaltung" button there, gated by its own password
   * step-up (`admin/verify`) — this page never touches that.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { registerUser } from '$lib/stores/user';
  import { api } from '$lib/api';
  import { shouldShowInstallHint } from '$lib/pwaInstallHint';

  /** Displayed, hyphen-formatted value, e.g. "ABC-DEF-GHJ" (partial while typing). */
  let pinDisplay = $state('');
  let error = $state('');
  let loading = $state(false);
  /** Whether the PIN is shown in clear text — masked by default so it can't be read over someone's shoulder. */
  let showPin = $state(false);

  // "Zum Home-Bildschirm hinzufügen" hint (Task #89 follow-up) — only shown
  // here on the login screen, for operators who log in on their own phone
  // repeatedly rather than a shared register tablet. Deliberately not shown
  // anywhere past login — once someone's working, leave them alone, browser
  // tab or not.
  let installHintPlatform: 'ios' | 'android' | null = $state(null);

  onMount(() => {
    installHintPlatform = shouldShowInstallHint();
  });

  const PIN_LENGTH = 9;
  /** `XXX-XXX-XXX` — 9 PIN characters plus the 2 auto-inserted hyphens. */
  const MAX_DISPLAY_LENGTH = 11;

  /**
   * Strips separators/whitespace and uppercases — accepts typed or pasted
   * input with or without hyphens, in any letter case.
   *
   * @param raw - Raw input value.
   * @returns Normalized, separator-free, uppercase PIN (may be short while typing).
   */
  function normalize(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PIN_LENGTH);
  }

  /**
   * Re-inserts the `XXX-XXX-XXX` hyphens for display.
   *
   * @param normalized - Separator-free, uppercase PIN.
   * @returns The hyphen-grouped display form.
   */
  function format(normalized: string): string {
    const groups: string[] = [];
    for (let i = 0; i < normalized.length; i += 3) groups.push(normalized.slice(i, i + 3));
    return groups.join('-');
  }

  /** Reformats the field as the user types or pastes — handles both `ABC123XYZ` and `ABC-123-XYZ` paste input. */
  function onPinInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    pinDisplay = format(normalize(target.value));
  }

  /**
   * Masks every PIN character but keeps the hyphen separators visible — so
   * masking the field doesn't also hide which parts are auto-inserted
   * formatting the user never has to type themselves (Task #125).
   *
   * @param value - The hyphen-formatted display value.
   * @returns The same value with every non-hyphen character replaced by `•`.
   */
  function maskExceptHyphens(value: string): string {
    return value.replace(/[^-]/g, '•');
  }

  async function handleLogin() {
    error = '';
    loading = true;
    try {
      const user = await api.auth.pin(normalize(pinDisplay));
      registerUser.set(user);
      goto('/register');
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
      <img class="brand-icon" src="/fairpos-icon.svg" alt="" width="72" height="72" />
      <h1>FairPOS</h1>
      <p class="brand-sub">Kassensystem</p>
    </div>

    <form onsubmit={preventDefault(handleLogin)}>
      <div class="field">
        <label for="pin">PIN</label>
        <div class="pin-input-wrap">
          <input
            id="pin"
            class="pin-input"
            type="text"
            inputmode="text"
            value={pinDisplay}
            oninput={onPinInput}
            maxlength={MAX_DISPLAY_LENGTH}
            placeholder="XXX-XXX-XXX"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="characters"
            spellcheck="false"
            disabled={loading}
            required
          />
          <!-- The input's own text is transparent (see .pin-input color rules) —
               this overlay is the only thing that actually renders the value,
               so masking can replace PIN characters with a dot while leaving
               the hyphen separators plainly visible (Task #125). Same font
               metrics as .pin-input so it lines up exactly over the real
               caret; pointer-events: none passes clicks/typing through. -->
          <div class="pin-input-overlay" aria-hidden="true">
            {showPin ? pinDisplay : maskExceptHyphens(pinDisplay)}
          </div>
          <button
            type="button"
            class="toggle-visibility"
            onclick={() => (showPin = !showPin)}
            aria-label={showPin ? 'PIN verbergen' : 'PIN anzeigen'}
          >
            {showPin ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" class="btn-primary" disabled={loading || normalize(pinDisplay).length !== PIN_LENGTH}>
        {#if loading}
          <span class="btn-spinner"></span>
          Anmelden…
        {:else}
          Anmelden
        {/if}
      </button>
    </form>
  </div>

  {#if installHintPlatform}
    <div class="install-hint">
      {#if installHintPlatform === 'ios'}
        <p>Für schnelleren Zugriff: Teilen-Symbol (⬆️) unten antippen, dann <strong>„Zum Home-Bildschirm"</strong> wählen.</p>
      {:else}
        <p>Für schnelleren Zugriff: Menü (⋮) oben rechts antippen, dann <strong>„Zum Startbildschirm hinzufügen"</strong> wählen.</p>
      {/if}
    </div>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
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
    /* Rounded-square shape is already baked into the SVG itself, no CSS radius needed. */
    width: 72px;
    height: 72px;
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

  /* Wide letter-spacing + monospace makes the XXX-XXX-XXX groups easy to
     read/verify at a glance — matters here since a mistyped character fails
     silently (no separate username to cross-check against). Masked by
     default (Blickschutz); the toggle button below lets the user reveal it
     on demand to still self-check what they typed. */
  .pin-input-wrap {
    position: relative;
  }

  /* The input itself never shows visible text (see below) — .pin-input-overlay
     renders the value instead, so masking can dot out the PIN while leaving
     the hyphen separators visible. Both share the exact same font metrics/
     padding/border width so the overlay's text sits precisely over the
     input's own (invisible) text and caret. */
  .pin-input,
  .pin-input-overlay {
    font-family: ui-monospace, 'SF Mono', Consolas, monospace;
    font-size: 1.3rem;
    letter-spacing: 0.15em;
    text-align: center;
    padding-right: 2.75rem;
  }

  .pin-input {
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: var(--color-text);
  }

  .pin-input::placeholder {
    color: var(--color-text-muted);
    -webkit-text-fill-color: var(--color-text-muted);
    opacity: 1;
  }

  .pin-input-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1rem;
    padding-right: 2.75rem;
    border: 1px solid transparent;
    color: var(--color-text);
    pointer-events: none;
    white-space: pre;
    overflow: hidden;
  }

  .pin-input:disabled ~ .pin-input-overlay {
    opacity: 0.5;
  }

  .toggle-visibility {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0.4rem;
    color: var(--color-text-muted);
  }

  .toggle-visibility:hover {
    color: var(--color-text);
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

  .install-hint {
    width: 100%;
    max-width: 380px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0.85rem 1rem;
  }

  .install-hint p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .install-hint p strong {
    color: var(--color-text);
  }
</style>
