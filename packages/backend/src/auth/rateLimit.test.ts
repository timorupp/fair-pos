import { beforeEach, describe, expect, it } from 'vitest';
import {
  countActiveLockouts, isLockedOut, recordFailedAttempt, recordSuccessfulAttempt, resetAllLockouts,
} from './rateLimit.js';

beforeEach(resetAllLockouts);

describe('isLockedOut / recordFailedAttempt', () => {
  it('is not locked out before any failures', () => {
    expect(isLockedOut('1.2.3.4')).toBe(false);
  });

  it('is not locked out after 2 failures', () => {
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    expect(isLockedOut('1.2.3.4')).toBe(false);
  });

  it('locks out after the 3rd failure', () => {
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    expect(isLockedOut('1.2.3.4')).toBe(true);
  });

  it('tracks each IP independently', () => {
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    expect(isLockedOut('1.2.3.4')).toBe(true);
    expect(isLockedOut('5.6.7.8')).toBe(false);
  });
});

describe('recordSuccessfulAttempt', () => {
  it('clears a partial failure count so a later mistype starts fresh', () => {
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    recordSuccessfulAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    recordFailedAttempt('1.2.3.4');
    expect(isLockedOut('1.2.3.4')).toBe(false); // only 2 failures since the reset
  });
});

describe('countActiveLockouts', () => {
  it('counts only IPs currently locked out', () => {
    recordFailedAttempt('1.1.1.1');
    recordFailedAttempt('1.1.1.1');
    recordFailedAttempt('1.1.1.1'); // locked
    recordFailedAttempt('2.2.2.2'); // not locked (only 1 failure)
    expect(countActiveLockouts()).toBe(1);
  });

  it('is zero after resetAllLockouts', () => {
    recordFailedAttempt('1.1.1.1');
    recordFailedAttempt('1.1.1.1');
    recordFailedAttempt('1.1.1.1');
    resetAllLockouts();
    expect(countActiveLockouts()).toBe(0);
  });
});
