/** Pure helpers for selecting the default reporting event. */

/** Minimal event shape consumed by the selector. */
export interface EventLike {
  id: string;
  start_time: Date | string;
  end_time: Date | string;
}

/**
 * Picks the event that should be pre-selected when an operator opens a report.
 *
 * Rules per Anforderungen (section "Auswertungen"):
 *  - If exactly one event currently surrounds `now` (start_time ≤ now < end_time), pick it.
 *  - Otherwise pick the most recent event whose `end_time` is in the past.
 *  - If no events qualify, return `null`.
 *
 * @param events - Candidate events (any order; selector sorts internally).
 * @param now - Reference timestamp (server "now"); injected for testability.
 * @returns The id of the event to pre-select, or `null` when none is suitable.
 */
export function pickDefaultEventId(events: EventLike[], now: Date): string | null {
  const ts = (v: Date | string): number => (typeof v === 'string' ? new Date(v).getTime() : v.getTime());
  const nowMs = now.getTime();

  // Prefer a currently running event.
  const running = events.find((e) => ts(e.start_time) <= nowMs && nowMs < ts(e.end_time));
  if (running) return running.id;

  // Fallback: the most recently ended past event.
  const past = events
    .filter((e) => ts(e.end_time) <= nowMs)
    .sort((a, b) => ts(b.end_time) - ts(a.end_time));
  return past[0]?.id ?? null;
}
