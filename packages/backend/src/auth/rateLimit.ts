/**
 * In-memory rate limiter for PIN login attempts (Task #90). Keyed by source
 * IP rather than by user — a failed PIN doesn't identify anyone (that's the
 * whole point, see `auth/pin.ts`), so there's no per-account counter to
 * attach a failure to. In-memory (not DB-backed) is a deliberate choice: this
 * backend already runs as a single Node process (no horizontal scaling, see
 * AGENTS.md architecture notes), so there's no multi-instance state to
 * coordinate, and losing the counters on a restart is harmless — an
 * attacker restarting the server to reset their own lockout isn't a
 * realistic threat model for this deployment.
 *
 * The PIN keyspace itself (32^9, see `auth/pin.ts`) already makes brute-force
 * guessing infeasible even at a much looser rate — this limiter is mainly
 * spam/load protection, not the primary defense.
 */

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptState {
  failureCount: number;
  /** Unix ms timestamp until which this IP is locked out, or `null` if not (yet) locked. */
  lockedUntil: number | null;
}

const attemptsByIp = new Map<string, AttemptState>();

/**
 * Checks whether the given IP is currently locked out.
 *
 * @param ip - Source IP of the login attempt.
 * @returns `true` if still within an active lockout window.
 */
export function isLockedOut(ip: string): boolean {
  const state = attemptsByIp.get(ip);
  if (!state?.lockedUntil) return false;
  if (Date.now() >= state.lockedUntil) {
    attemptsByIp.delete(ip);
    return false;
  }
  return true;
}

/**
 * Records a failed PIN attempt from the given IP, locking it out for
 * {@link LOCKOUT_MS} once {@link MAX_ATTEMPTS} is reached.
 *
 * @param ip - Source IP of the failed attempt.
 */
export function recordFailedAttempt(ip: string): void {
  const state = attemptsByIp.get(ip) ?? { failureCount: 0, lockedUntil: null };
  state.failureCount += 1;
  if (state.failureCount >= MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  attemptsByIp.set(ip, state);
}

/**
 * Clears any tracked failures for the given IP — called after a successful
 * login so a subsequent mistyped PIN starts a fresh count.
 *
 * @param ip - Source IP of the successful attempt.
 */
export function recordSuccessfulAttempt(ip: string): void {
  attemptsByIp.delete(ip);
}

/**
 * Counts IPs currently under an active lockout — for the admin dashboard
 * (Task #63) tile.
 *
 * @returns Number of IPs presently locked out.
 */
export function countActiveLockouts(): number {
  const now = Date.now();
  let count = 0;
  for (const state of attemptsByIp.values()) {
    if (state.lockedUntil && state.lockedUntil > now) count++;
  }
  return count;
}

/**
 * Clears every tracked IP's failure count/lockout — the admin "Alle aktiven
 * IP-Sperren zurücksetzen" button, and reused by tests to start from a known
 * state regardless of what earlier tests in the same process did.
 */
export function resetAllLockouts(): void {
  attemptsByIp.clear();
}
