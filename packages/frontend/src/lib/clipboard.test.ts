/**
 * Unit tests for the clipboard fallback helper. Needs a DOM (jsdom) for
 * `document`/`navigator`, unlike this package's other pure-TS helper tests.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('copyToClipboard', () => {
  it('uses navigator.clipboard.writeText when available (secure context)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await copyToClipboard('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to document.execCommand when navigator.clipboard is undefined (e.g. plain HTTP over a LAN — this project\'s actual deployment model)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await copyToClipboard('world');

    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when navigator.clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await copyToClipboard('fallback-case');

    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('removes the temporary textarea again after copying via the fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);

    await copyToClipboard('cleanup-check');

    expect(document.querySelector('textarea')).toBeNull();
  });
});
