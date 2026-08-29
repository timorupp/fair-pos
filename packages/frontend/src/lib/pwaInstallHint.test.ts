/** Unit tests for the PWA install-hint detection helpers. Needs jsdom for `navigator`/`window`/`localStorage`. */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectMobilePlatform, dismissInstallHint, DISMISS_STORAGE_KEY, isRunningStandalone, shouldShowInstallHint,
} from './pwaInstallHint.js';

/** Overrides `navigator.userAgent`/`navigator.platform`/`navigator.maxTouchPoints` for one test. */
function setUserAgent(ua: string, platform = '', maxTouchPoints = 0): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = (query: string) => ({ matches: false, media: query }) as MediaQueryList;
  delete (navigator as Navigator & { standalone?: boolean }).standalone;
});

afterEach(() => {
  localStorage.clear();
});

describe('detectMobilePlatform', () => {
  it('recognizes an iPhone user agent', () => {
    setUserAgent(IPHONE_UA);
    expect(detectMobilePlatform()).toBe('ios');
  });

  it('recognizes iPadOS 13+ reporting as MacIntel with touch points', () => {
    setUserAgent(DESKTOP_UA.replace('Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15'), 'MacIntel', 5);
    expect(detectMobilePlatform()).toBe('ios');
  });

  it('does not misidentify a real Mac (no touch points) as iOS', () => {
    setUserAgent(DESKTOP_UA.replace('Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15'), 'MacIntel', 0);
    expect(detectMobilePlatform()).toBeNull();
  });

  it('recognizes an Android user agent', () => {
    setUserAgent(ANDROID_UA);
    expect(detectMobilePlatform()).toBe('android');
  });

  it('returns null for desktop', () => {
    setUserAgent(DESKTOP_UA, 'Win32', 0);
    expect(detectMobilePlatform()).toBeNull();
  });
});

describe('isRunningStandalone', () => {
  it('is false when neither signal is set', () => {
    expect(isRunningStandalone()).toBe(false);
  });

  it('is true when the display-mode media query matches', () => {
    window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    expect(isRunningStandalone()).toBe(true);
  });

  it('is true when the legacy iOS navigator.standalone flag is set', () => {
    (navigator as Navigator & { standalone?: boolean }).standalone = true;
    expect(isRunningStandalone()).toBe(true);
  });
});

describe('shouldShowInstallHint', () => {
  it('returns the platform on a recognized mobile browser, not yet installed/dismissed', () => {
    setUserAgent(IPHONE_UA);
    expect(shouldShowInstallHint()).toBe('ios');
  });

  it('returns null when already running standalone', () => {
    setUserAgent(IPHONE_UA);
    (navigator as Navigator & { standalone?: boolean }).standalone = true;
    expect(shouldShowInstallHint()).toBeNull();
  });

  it('returns null after dismissInstallHint() was called', () => {
    setUserAgent(IPHONE_UA);
    dismissInstallHint();
    expect(shouldShowInstallHint()).toBeNull();
    expect(localStorage.getItem(DISMISS_STORAGE_KEY)).toBe('1');
  });

  it('returns null on desktop regardless of dismissal state', () => {
    setUserAgent(DESKTOP_UA, 'Win32', 0);
    expect(shouldShowInstallHint()).toBeNull();
  });
});
