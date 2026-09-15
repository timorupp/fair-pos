/** Unit tests for the pure calendar-day comparison helper — see healthJob.integration.test.ts for tick()'s DB-backed logging behavior. */
import { describe, it, expect } from 'vitest';
import { certificateExpiresTodayOrEarlier } from './healthJob.js';

describe('certificateExpiresTodayOrEarlier()', () => {
  // Fixed at local noon, not a UTC boundary time — keeps "later today"/
  // "tomorrow" below unambiguous regardless of the test runner's timezone
  // offset from UTC (a UTC-only time like 23:00 can already be the next
  // calendar day in timezones ahead of UTC, e.g. Europe/Berlin/CEST).
  const now = new Date(2026, 8, 12, 12, 0, 0); // 2026-09-12 12:00 local

  it('is true for a date in the past', () => {
    const yesterday = new Date(2026, 8, 11, 8, 0, 0).getTime() / 1000;
    expect(certificateExpiresTodayOrEarlier(yesterday, now)).toBe(true);
  });

  it('is true for later today, even though the exact instant has not passed yet', () => {
    const laterToday = new Date(2026, 8, 12, 23, 0, 0).getTime() / 1000;
    expect(certificateExpiresTodayOrEarlier(laterToday, now)).toBe(true);
  });

  it('is false for tomorrow', () => {
    const tomorrow = new Date(2026, 8, 13, 0, 0, 1).getTime() / 1000;
    expect(certificateExpiresTodayOrEarlier(tomorrow, now)).toBe(false);
  });

  it('is false for a date far in the future', () => {
    const nextYear = new Date(2027, 8, 12, 12, 0, 0).getTime() / 1000;
    expect(certificateExpiresTodayOrEarlier(nextYear, now)).toBe(false);
  });
});
