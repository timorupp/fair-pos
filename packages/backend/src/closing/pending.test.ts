/** Unit tests for the pending-closing-days helper. */
import { describe, it, expect } from 'vitest';
import { pendingClosingDays, localDateString } from './pending.js';

describe('localDateString', () => {
  it('formats a date with zero-padded month and day', () => {
    expect(localDateString(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('uses the host\'s local components (not UTC)', () => {
    // 2026-06-24 00:30 local → must still be 2026-06-24 even if UTC offset would push it.
    expect(localDateString(new Date(2026, 5, 24, 0, 30))).toBe('2026-06-24');
  });
});

describe('pendingClosingDays', () => {
  const today = new Date(2026, 5, 24); // 24 June 2026, local

  it('returns an empty list when the register has never been used', () => {
    expect(pendingClosingDays(null, new Set(), today)).toEqual([]);
  });

  it('returns an empty list when the first activity is today', () => {
    expect(pendingClosingDays(new Date(2026, 5, 24, 10, 0), new Set(), today)).toEqual([]);
  });

  it('returns one day when activity started yesterday and there is no closing', () => {
    expect(pendingClosingDays(new Date(2026, 5, 23, 18, 0), new Set(), today)).toEqual(['2026-06-23']);
  });

  it('returns every day between the first activity and yesterday inclusive', () => {
    expect(pendingClosingDays(new Date(2026, 5, 20), new Set(), today))
      .toEqual(['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23']);
  });

  it('skips days that already have a closing', () => {
    const closed = new Set(['2026-06-21', '2026-06-22']);
    expect(pendingClosingDays(new Date(2026, 5, 20), closed, today))
      .toEqual(['2026-06-20', '2026-06-23']);
  });

  it('treats the first-activity day itself as needing a closing', () => {
    expect(pendingClosingDays(new Date(2026, 5, 23, 11, 30), new Set(), today)).toEqual(['2026-06-23']);
  });

  it('never includes today even when no closing exists', () => {
    expect(pendingClosingDays(new Date(2026, 5, 24, 8, 0), new Set(), today)).toEqual([]);
  });

  it('handles a closing chain followed by a fresh gap', () => {
    // First activity 2026-06-18, closings on 18 and 19, then no abschluss for 20-23.
    const closed = new Set(['2026-06-18', '2026-06-19']);
    expect(pendingClosingDays(new Date(2026, 5, 18), closed, today))
      .toEqual(['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23']);
  });

  it('handles a month boundary correctly', () => {
    // First activity 2026-05-30 → ten days until 2026-06-23 inclusive.
    const result = pendingClosingDays(new Date(2026, 4, 30), new Set(), today);
    expect(result[0]).toBe('2026-05-30');
    expect(result[result.length - 1]).toBe('2026-06-23');
    expect(result).toHaveLength(25);
  });

  it('handles a year boundary correctly', () => {
    const newYearsToday = new Date(2026, 0, 3); // 3 January 2026
    expect(pendingClosingDays(new Date(2025, 11, 30), new Set(), newYearsToday))
      .toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
});
