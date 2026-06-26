/** Unit tests for the default-event selector. */
import { describe, it, expect } from 'vitest';
import { pickDefaultEventId, type EventLike } from './event-select.js';

const ev = (id: string, start: string, end: string): EventLike => ({
  id, start_time: start, end_time: end,
});

describe('pickDefaultEventId', () => {
  const now = new Date('2026-06-24T12:00:00Z');

  it('returns null when no events are configured', () => {
    expect(pickDefaultEventId([], now)).toBeNull();
  });

  it('picks the currently running event when one surrounds now', () => {
    const events = [
      ev('past', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'),
      ev('current', '2026-06-23T00:00:00Z', '2026-06-25T00:00:00Z'),
      ev('future', '2027-01-01T00:00:00Z', '2027-01-02T00:00:00Z'),
    ];
    expect(pickDefaultEventId(events, now)).toBe('current');
  });

  it('treats end_time as exclusive: an event ending exactly at now is considered past', () => {
    const events = [
      ev('ended-now', '2026-06-23T00:00:00Z', '2026-06-24T12:00:00Z'),
      ev('earlier',   '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z'),
    ];
    expect(pickDefaultEventId(events, now)).toBe('ended-now');
  });

  it('treats start_time as inclusive: an event starting exactly at now is currently running', () => {
    const events = [
      ev('just-started', '2026-06-24T12:00:00Z', '2026-06-25T00:00:00Z'),
    ];
    expect(pickDefaultEventId(events, now)).toBe('just-started');
  });

  it('picks the most recent past event when no event is currently running', () => {
    const events = [
      ev('oldest', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
      ev('middle', '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z'),
      ev('newest', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'),
    ];
    expect(pickDefaultEventId(events, now)).toBe('newest');
  });

  it('ignores future events entirely when only future events exist', () => {
    const events = [
      ev('soon',  '2026-07-01T00:00:00Z', '2026-07-02T00:00:00Z'),
      ev('later', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
    ];
    expect(pickDefaultEventId(events, now)).toBeNull();
  });

  it('accepts Date instances as well as ISO strings', () => {
    const events = [{
      id: 'd',
      start_time: new Date('2026-06-23T00:00:00Z'),
      end_time:   new Date('2026-06-25T00:00:00Z'),
    }];
    expect(pickDefaultEventId(events, now)).toBe('d');
  });
});
