/**
 * Shared pending-Z-Bon summary, driving the global admin banner
 * (`admin/+layout.svelte`) plus the per-register badges. Lives outside any
 * one page so a closing action taken on `admin/registers/[id]/+page.svelte`
 * can refresh the banner immediately, without needing a route change or
 * waiting for the layout's own 5-minute poll — before this store existed,
 * the layout had no way to learn that a child page had just changed the
 * pending state.
 */
import { writable } from 'svelte/store';
import { api } from '$lib/api';

/** Shape returned by `GET /admin/closings/pending`. */
export interface PendingSummary {
  total_pending_registers: number;
  total_pending_days: number;
}

/** `null` while unknown or on a failed fetch — the banner simply hides in that case. */
export const pendingClosings = writable<PendingSummary | null>(null);

/**
 * Refetches the pending-Z-Bon summary and updates the shared store. Call
 * this after any action that closes a register (or otherwise changes which
 * days are outstanding) so the global banner reflects it right away.
 */
export async function refreshPendingClosings(): Promise<void> {
  try {
    pendingClosings.set(await api.admin.closings.pending());
  } catch {
    pendingClosings.set(null);
  }
}
