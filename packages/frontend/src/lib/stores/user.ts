/**
 * Global store for the currently authenticated user.
 * Null means unauthenticated or session not yet checked.
 */
import { writable } from 'svelte/store';
import type { User } from '@fairpos/shared';

export const currentUser = writable<User | null>(null);
