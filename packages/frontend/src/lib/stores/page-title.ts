/**
 * Page-title fragment for the cash-register UIs.
 *
 * Sub-pages within `/register/[id]/**` write the current register name here
 * after loading it; the register layout reads it and writes the browser-tab
 * title (`<Kassenname> — FairPOS`). A null value falls back to a generic
 * default — the layout handles that.
 */

import { writable } from 'svelte/store';

/** The cash-register name currently being shown, or `null` before it's loaded. */
export const currentRegisterName = writable<string | null>(null);
