/**
 * Global stores for the two authenticated-user sessions.
 *
 * Each store mirrors one server-side cookie. `null` means "no session of this
 * type" (either never logged in or just logged out). Both stores can carry a
 * value simultaneously when an admin scans their own QR token to test the
 * cash-register UI.
 */
import { writable } from 'svelte/store';
import type { User } from '@fairpos/shared';

/** Admin session user — populated by `/admin/+layout.svelte` on mount. */
export const adminUser = writable<User | null>(null);

/** Register-session user — populated by `/register/+layout.svelte` on mount. */
export const registerUser = writable<User | null>(null);
