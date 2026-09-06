<script lang="ts">
  /**
   * Receipt confirmation (print or decline) shown after a checkout — used
   * identically by the Bonkasse (`register/[id]/receipt`) and Bedienungskasse
   * (`register/[id]/tables/[tableId]/checkout/receipt`) routes. Each is its
   * own SvelteKit route (own URL, own back-navigation target after "Kunde
   * wünscht keinen Beleg"/print — Nutzervorgabe 2026-08-30, für beide
   * Kassenarten), but the markup/logic was otherwise byte-for-byte
   * duplicated between them — lives here once instead.
   *
   * Reads its own query params (`invoiceId`, `receiptNumber`, `total`,
   * `count`, `tseWarning`) directly from the current route's URL — both call
   * sites hand these off identically from their own checkout flow
   * (`startCheckout()`/`charge()`), so there's nothing route-specific to pass
   * as props beyond the back-navigation target.
   *
   * No customer-facing QR code anymore (Task #100, 2026-09-01) — the digital
   * guest receipt feature was removed; "Kunde wünscht keinen Beleg" replaces
   * the old "Rechnung per QR Code gescannt" button but keeps its behavior
   * (close without printing).
   */
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api';

  interface Props {
    /** Route to navigate back to after printing or declining. */
    backHref: string;
  }

  let { backHref }: Props = $props();

  let invoiceId = $derived(page.url.searchParams.get('invoiceId') ?? '');
  let receiptNumber = $derived(page.url.searchParams.get('receiptNumber') ?? '');
  let total = $derived(Number(page.url.searchParams.get('total') ?? '0'));
  let count = $derived(Number(page.url.searchParams.get('count') ?? '0'));
  let tseWarning = $derived(page.url.searchParams.get('tseWarning'));

  let printing = $state(false);
  let printDone = $state(false);
  let error = $state('');

  async function printReceipt() {
    if (!invoiceId) return;
    printing = true; error = '';
    try {
      await api.registerSession.print(invoiceId);
      printDone = true;
      setTimeout(finish, 1200);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler';
    } finally {
      printing = false;
    }
  }

  /** Back to the calling flow's next screen — a full navigation, so its list is always freshly loaded (no stale-state risk like an in-page modal had, see D-047). */
  function finish() {
    goto(backHref);
  }

  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Rückgeldrechner (Task #118) — pure client-side helper, nothing is
  // sent to the backend or persisted. Cents throughout to avoid float
  // rounding; digits shift in from the right like a card terminal
  // (e.g. "2750" → 27,50 €) rather than needing a separate comma key.
  // Design (Kennbuchstaben, quick amounts, layout) matches the reviewed
  // prototype, iterated with the user 2026-09-05.
  const MAX_GIVEN_CENTS = 99999900; // 999.999,00 € — generous, never realistic to reach.
  const QUICK_AMOUNTS_CENTS = [500, 1000, 2000, 5000, 10000];

  let calcOpen = $state(true);
  let givenCents = $state(0);
  let hasEnteredGiven = $state(false);

  let totalCents = $derived(Math.round(total * 100));
  let diffCents = $derived(givenCents - totalCents);

  /** Formats a cent amount in German style with the euro sign, e.g. `27,50 €` / `-2,50 €`. */
  function fmtCents(cents: number): string {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    const euros = Math.floor(abs / 100).toLocaleString('de-DE');
    const rest = String(abs % 100).padStart(2, '0');
    return `${sign}${euros},${rest} €`;
  }

  function pressDigit(d: number) {
    hasEnteredGiven = true;
    givenCents = Math.min(givenCents * 10 + d, MAX_GIVEN_CENTS);
  }

  function backspaceGiven() {
    hasEnteredGiven = true;
    givenCents = Math.floor(givenCents / 10);
  }

  function clearGiven() {
    givenCents = 0;
    hasEnteredGiven = false;
  }

  /**
   * Sets the given amount directly, e.g. from a quick-amount chip.
   *
   * @param cents - The amount handed over, in cents.
   */
  function setGiven(cents: number) {
    hasEnteredGiven = true;
    givenCents = cents;
  }
</script>

<div class="page">
  <div class="layout">
    <!-- Unchanged existing UI — always first in the document, so its
         actions stay reachable without scrolling regardless of how tall the
         calculator to its side/below grows. -->
    <section class="old-ui">
      <header class="header">
        <h1>Rechnung {receiptNumber}</h1>
      </header>

      <div class="checkout-body">
        <div class="totals">
          <div class="total-final" class:negative={total < 0}>{fmt(total)} €</div>
          <div class="muted small">{count} Artikel</div>
        </div>
      </div>

      {#if tseWarning}<p class="warning-text">⚠ {tseWarning}</p>{/if}
      {#if printDone}<p class="success-text">✓ Bon wird gedruckt</p>{/if}
      {#if error}<p class="error-text">{error}</p>{/if}

      <div class="actions">
        <button class="btn-ghost" onclick={finish} disabled={printing}>Kunde wünscht keinen Beleg</button>
        <div class="spacer"></div>
        <button class="btn-primary" onclick={printReceipt} disabled={printing || printDone}>
          {printing ? 'Drucke…' : 'Rechnung drucken'}
        </button>
      </div>
    </section>

    <section class="calc-card">
      <button
        type="button"
        class="calc-toggle"
        aria-expanded={calcOpen}
        onclick={() => (calcOpen = !calcOpen)}
      >
        <span>Rückgeld berechnen{calcOpen ? ' ausblenden' : ''}</span>
        <span class="chev" class:open={calcOpen}>▾</span>
      </button>

      {#if calcOpen}
        <div class="calc-panel">
          <span class="calc-label">Gegeben</span>
          <div class="given-display" class:is-empty={!hasEnteredGiven}>
            {hasEnteredGiven ? fmtCents(givenCents) : '–,–– €'}
          </div>

          <div class="quick-amounts">
            {#each QUICK_AMOUNTS_CENTS as cents (cents)}
              <button type="button" class="chip" onclick={() => setGiven(cents)}>{fmtCents(cents).replace(',00', '')}</button>
            {/each}
          </div>

          <div class="keypad">
            {#each [7, 8, 9, 4, 5, 6, 1, 2, 3] as d (d)}
              <button type="button" class="key" onclick={() => pressDigit(d)}>{d}</button>
            {/each}
            <button type="button" class="key key-clear" onclick={clearGiven}>C</button>
            <button type="button" class="key" onclick={() => pressDigit(0)}>0</button>
            <button type="button" class="key key-back" onclick={backspaceGiven} aria-label="Löschen">⌫</button>
          </div>

          <div class="result">
            <span class="result-label">{!hasEnteredGiven ? 'Rückgeld' : diffCents < 0 ? 'Es fehlen noch' : 'Rückgeld'}</span>
            <span
              class="result-value"
              class:success={hasEnteredGiven && diffCents >= 0}
              class:short={hasEnteredGiven && diffCents < 0}
            >
              {hasEnteredGiven ? fmtCents(Math.abs(diffCents)) : '–,–– €'}
            </span>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .page { padding: 1rem; max-width: 500px; margin: 0 auto; }

  /* ── Responsive arrangement ───────────────────────────────────────────
     Phone (default): single column, old UI first, calculator below it —
     the old UI never grows, so it's always reachable without scrolling
     regardless of how tall the calculator gets underneath. Tablet and up:
     two columns side by side, same breakpoint the rest of the app already
     uses (register/[id]/+page.svelte's .pos-layout). */
  .layout { display: grid; grid-template-columns: 1fr; gap: 1rem; align-items: start; }
  @media (min-width: 768px) {
    .page { max-width: 820px; }
    .layout { grid-template-columns: 1fr 1fr; }
  }

  .header { margin-bottom: 1.25rem; }
  .header h1 { font-size: 1.2rem; margin: 0; }

  .checkout-body { display: flex; padding: 0.5rem 0; }
  .totals { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .total-final { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .total-final.negative { color: var(--color-danger); }
  .small { font-size: 0.85rem; }

  .success-text { color: #4caf7d; font-size: 0.9rem; margin-top: 0.5rem; }
  .warning-text { color: #f59e0b; font-size: 0.9rem; margin-top: 0.5rem; font-weight: 600; }
  .error-text { color: var(--color-danger); font-size: 0.9rem; margin-top: 0.5rem; }

  .actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.5rem; }
  .actions .spacer { flex: 1; }
  .actions .btn-primary { padding: 0.7rem 1.5rem; font-size: 1rem; }

  /* ── Rückgeldrechner ──────────────────────────────────────────────── */
  .calc-card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius); padding: 1.1rem;
  }
  .calc-toggle {
    width: 100%; min-height: 48px;
    padding: 0.75rem 1rem;
    background: transparent; border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text-muted);
    font-size: 0.95rem; font-weight: 600;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  }
  .calc-toggle:hover { border-color: var(--color-text-muted); color: var(--color-text); }
  .calc-toggle .chev { transition: transform 0.2s; }
  .calc-toggle .chev.open { transform: rotate(180deg); }

  .calc-panel { margin-top: 0.9rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .calc-label {
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-muted); font-weight: 600;
  }
  .given-display {
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); padding: 0.85rem 1rem;
    text-align: right; font-size: 1.7rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .given-display.is-empty { color: var(--color-text-muted); font-weight: 500; }

  .quick-amounts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
  .chip {
    min-height: 44px;
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text);
    font-size: 0.9rem; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .chip:hover { border-color: var(--color-primary); }
  .chip:active { transform: scale(0.97); }

  .keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  .key {
    min-height: 56px;
    background: var(--color-surface-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); color: var(--color-text);
    font-size: 1.35rem; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .key:active { transform: scale(0.96); }
  .key.key-clear { color: var(--color-danger); font-size: 0.95rem; }
  .key.key-back { font-size: 1.1rem; }

  .result {
    border-top: 1px solid var(--color-border); padding-top: 0.9rem;
    display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
    min-height: 2.2rem;
  }
  .result-label { font-size: 0.95rem; color: var(--color-text-muted); font-weight: 600; }
  .result-value { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
  .result-value.success { color: var(--color-success); }
  .result-value.short { color: var(--color-danger); font-size: 1.1rem; }
</style>
