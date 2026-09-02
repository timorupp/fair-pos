<script lang="ts">
  /**
   * Receipt confirmation (print or decline) after a Bonkasse checkout — its
   * own route rather than a modal on top of the register page (Nutzervorgabe,
   * 2026-08-30: einheitliche UX mit der Bedienungskasse, siehe deren
   * `tables/[tableId]/checkout/receipt`). Everything shown arrives via query
   * params from the register page's `startCheckout()` — read directly by the
   * shared `ReceiptConfirmation` component, see there for details.
   */
  import { page } from '$app/state';
  import ReceiptConfirmation from '$lib/components/ReceiptConfirmation.svelte';

  let registerId = $derived(page.params['id'] ?? '');
</script>

<ReceiptConfirmation backHref={`/register/${registerId}`} />
