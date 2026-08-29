/**
 * Detection helpers for the "Zum Home-Bildschirm hinzufügen" hint on the
 * login page — shown to operators who log in on their own phone repeatedly
 * (Task #89 follow-up), since neither iOS nor Android exposes a way to
 * trigger the install step programmatically; the best we can do is detect
 * whether it's already done and, if not, point at the right platform-specific
 * instructions.
 */

/** localStorage key for "don't show the install hint on this device again". */
export const DISMISS_STORAGE_KEY = 'fairpos-install-hint-dismissed';

/**
 * Whether the app is currently running installed/standalone — covers both
 * the standard `display-mode` media query (Android/desktop Chrome, and
 * modern iOS Safari) and the legacy iOS-only `navigator.standalone`
 * property (older iOS Safari versions never implemented the media query).
 *
 * @returns `true` if already installed, so the hint should stay hidden.
 */
export function isRunningStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/**
 * Detects the mobile platform from the user agent, to pick the right
 * install instructions. There's no clean feature-detection API for this —
 * UA sniffing is the only option. iPadOS 13+ reports as `MacIntel` with no
 * touch-point signal in the UA string itself, hence the extra
 * `maxTouchPoints` check to still recognize it as iOS.
 *
 * @returns `'ios'`, `'android'`, or `null` for desktop/unrecognized (the
 *   hint is skipped in that case — "add to home screen" isn't a relevant
 *   concept there for this use case).
 */
export function detectMobilePlatform(): 'ios' | 'android' | null {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

/**
 * Whether the install hint should currently be shown: not already
 * installed, a recognized mobile platform, and not previously dismissed on
 * this device.
 *
 * @returns The platform to show instructions for, or `null` to hide the hint entirely.
 */
export function shouldShowInstallHint(): 'ios' | 'android' | null {
  if (isRunningStandalone()) return null;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
  } catch {
    // Private-mode/storage-disabled browsers can throw on access — treat as not dismissed.
  }
  if (dismissed) return null;
  return detectMobilePlatform();
}

/** Persists "don't show the install hint again" for this device — best-effort, storage failures are silently ignored. */
export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, '1');
  } catch {
    // Nothing more we can do — worst case the hint reappears next time.
  }
}
