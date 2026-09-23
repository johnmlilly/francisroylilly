import { describe, expect, it } from 'vitest';
import { oneWeekBefore, selectNewSubscribers } from './subscriberReport.js';

const now = new Date('2026-09-17T12:00:00Z');
const subscriber = (email: string, createdAt: string, confirmedAt: string | null = null) => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email,
  createdAt: new Date(createdAt),
  confirmedAt: confirmedAt ? new Date(confirmedAt) : null,
});

describe('oneWeekBefore', () => {
  it('returns exactly 7 days earlier', () => {
    expect(oneWeekBefore(now)).toEqual(new Date('2026-09-10T12:00:00Z'));
  });
});

describe('selectNewSubscribers', () => {
  it('returns subscribers created within the window, oldest first', () => {
    const since = oneWeekBefore(now);
    const subscribers = [
      subscriber('newer@example.com', '2026-09-15'),
      subscriber('older@example.com', '2026-09-11'),
      subscriber('too-old@example.com', '2026-09-01'),
    ];

    expect(selectNewSubscribers(subscribers, since, now).map((s) => s.email)).toEqual([
      'older@example.com',
      'newer@example.com',
    ]);
  });

  it('includes subscribers exactly at the window edges', () => {
    const since = oneWeekBefore(now);
    const subscribers = [subscriber('start@example.com', since.toISOString()), subscriber('end@example.com', now.toISOString())];

    expect(selectNewSubscribers(subscribers, since, now).map((s) => s.email)).toEqual([
      'start@example.com',
      'end@example.com',
    ]);
  });

  it('returns an empty list when nobody subscribed in the window', () => {
    const since = oneWeekBefore(now);
    expect(selectNewSubscribers([subscriber('too-old@example.com', '2026-08-01')], since, now)).toEqual([]);
  });
});
