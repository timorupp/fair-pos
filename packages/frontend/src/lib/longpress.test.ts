/** Unit tests for the hold-to-confirm Svelte action. Needs a DOM (jsdom) for `document`/dispatched pointer events. */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { longpress } from './longpress.js';

function pointerEvent(type: string, button = 0): Event {
  // jsdom's PointerEvent constructor doesn't reliably set `button`, so build
  // a plain Event and override the property directly — the action only reads
  // `e.button`, nothing else PointerEvent-specific.
  const event = new Event(type);
  Object.defineProperty(event, 'button', { value: button });
  return event;
}

describe('longpress', () => {
  let node: HTMLButtonElement;
  let onHold: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    node = document.createElement('button');
    onHold = vi.fn<() => void>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onHold after holding for the full default duration (600ms)', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(600);
    expect(onHold).toHaveBeenCalledOnce();
  });

  it('does not fire if released before the duration elapses', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(300);
    node.dispatchEvent(pointerEvent('pointerup'));
    vi.advanceTimersByTime(600);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not fire if the pointer leaves the element before the duration elapses', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(300);
    node.dispatchEvent(pointerEvent('pointerleave'));
    vi.advanceTimersByTime(600);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not start holding (no class, no callback) when the button is disabled', () => {
    node.disabled = true;
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    expect(node.classList.contains('holding')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not fire onHold if the button becomes disabled mid-hold', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(300);
    node.disabled = true;
    vi.advanceTimersByTime(300);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons (e.g. right click)', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown', 2));
    vi.advanceTimersByTime(600);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('toggles the holding class while pressed and clears it on release', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    expect(node.classList.contains('holding')).toBe(true);
    node.dispatchEvent(pointerEvent('pointerup'));
    expect(node.classList.contains('holding')).toBe(false);
  });

  it('clears the holding class once onHold fires', () => {
    longpress(node, { onHold });
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(600);
    expect(node.classList.contains('holding')).toBe(false);
  });

  it('stops listening after destroy() is called', () => {
    const action = longpress(node, { onHold });
    action.destroy();
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(600);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('supports a custom durationMs', () => {
    longpress(node, { onHold, durationMs: 1000 });
    node.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(600);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onHold).toHaveBeenCalledOnce();
  });
});
