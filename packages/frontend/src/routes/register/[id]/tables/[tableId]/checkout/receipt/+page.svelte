<script lang="ts">
  /**
   * Receipt confirmation (print or decline) after a table checkout — its own
   * route rather than a modal on top of the checkout page (Nutzervorgabe,
   * 2026-08-30: too cramped as an in-page dialog on a phone). Everything
   * shown arrives via query params from the checkout page's `charge()` —
   * read directly by the shared `ReceiptConfirmation` component, see there
   * for details.
   */
  import { page } from '$app/state';
  import ReceiptConfirmation from '$lib/components/ReceiptConfirmation.svelte';

  let registerId = $derived(page.params['id'] ?? '');
  let tableId = $derived(page.params['tableId'] ?? '');
</script>

<ReceiptConfirmation backHref={`/register/${registerId}/tables/${tableId}`} />
