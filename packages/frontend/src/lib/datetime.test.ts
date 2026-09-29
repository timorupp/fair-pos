/** Unit tests for datetime formatting helpers. */
import { describe, it, expect } from 'vitest';
import { toLocalDateTimeInput } from './datetime';

describe('toLocalDateTimeInput', () => {
  it('round-trips local date/time components through an ISO string, regardless of the host timezone', () => {
    const local = new Date(2026, 8, 21, 14, 30); // 21 Sept 2026, 14:30 local
    expect(toLocalDateTimeInput(local.toISOString())).toBe('2026-09-21T14:30');
  });

  it('pads single-digit month/day/hour/minute with a leading zero', () => {
    const local = new Date(2026, 0, 5, 9, 5); // 5 Jan 2026, 09:05 local
    expect(toLocalDateTimeInput(local.toISOString())).toBe('2026-01-05T09:05');
  });

  it('reads the Date\'s local components, not toISOString()\'s UTC ones (the actual D-081 bug)', () => {
    const local = new Date(2026, 5, 15, 23, 45);
    const utcBased = local.toISOString().slice(0, 16); // what the old, buggy implementation returned
    const result = toLocalDateTimeInput(local.toISOString());
    expect(result).toBe('2026-06-15T23:45');
    // Only a meaningful assertion when the test host isn't at UTC+0 itself —
    // there the two would coincide even with the old buggy code.
    if (local.getTimezoneOffset() !== 0) {
      expect(result).not.toBe(utcBased);
    }
  });
});
