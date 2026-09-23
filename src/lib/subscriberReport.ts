export interface ReportSubscriber {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}

/** `now` minus 7 days: the default weekly report window. */
export function oneWeekBefore(now: Date): Date {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/** Subscribers created in `[since, now]`, oldest first. */
export function selectNewSubscribers<T extends ReportSubscriber>(
  subscribers: readonly T[],
  since: Date,
  now: Date
): T[] {
  return subscribers
    .filter((s) => s.createdAt.getTime() >= since.getTime() && s.createdAt.getTime() <= now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
