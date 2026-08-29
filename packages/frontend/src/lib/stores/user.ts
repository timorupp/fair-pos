/**
 * Global stores for the current user (Task #90: a single session for
 * everyone, PIN login — see `auth/session.ts`).
 *
 * `registerUser` mirrors "is there a valid session at all" — populated by
 * `/register/+layout.svelte` on mount, and by the PIN login page on success.
 * `adminUser` mirrors "has this session also passed the Systemverwaltung
 * password step-up" — populated by `/admin/+layout.svelte` on mount, and by
 * the step-up dialog on success. Both can be non-null at once (an
 * admin-flagged user who stepped up), but `adminUser` is never set without
 * `registerUser` also being set.
 */
import { writable } from 'svelte/store';
import type { User } from '@fairpos/shared';

/** Set once the current session has passed the admin step-up. */
export const adminUser = writable<User | null>(null);

/** Set for any valid session, admin or not. `null` means not logged in. */
export const registerUser = writable<User | null>(null);
