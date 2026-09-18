import { d1, Subscriber, eq } from '../../db/d1-client.js';

export type ConfirmLookup =
  | { status: 'not-found' }
  | { status: 'already-confirmed' }
  | { status: 'pending'; firstName: string };

export type ConfirmResult = 'confirmed' | 'not-found' | 'already-confirmed';

export type UnsubscribeLookup =
  | { status: 'not-found' }
  | { status: 'found'; firstName: string; alreadyUnsubscribed: boolean };

export type UnsubscribeResult = 'unsubscribed' | 'not-found';

async function findByToken(token: string) {
  return d1.select().from(Subscriber).where(eq(Subscriber.token, token)).get();
}

// GET /api/confirm: read-only. Email scanners prefetch links, so nothing
// changes until the reader submits the POST form.
export async function lookupConfirmToken(token: string): Promise<ConfirmLookup> {
  const row = await findByToken(token);
  if (!row) return { status: 'not-found' };
  if (row.confirmedAt) return { status: 'already-confirmed' };
  return { status: 'pending', firstName: row.firstName };
}

// POST /api/confirm: completes double opt-in exactly once per token.
export async function confirmSubscription(token: string, now: Date): Promise<ConfirmResult> {
  const row = await findByToken(token);
  if (!row) return 'not-found';
  if (row.confirmedAt) return 'already-confirmed';

  await d1.update(Subscriber).set({ confirmedAt: now }).where(eq(Subscriber.token, token));
  return 'confirmed';
}

export async function lookupUnsubscribeToken(token: string): Promise<UnsubscribeLookup> {
  const row = await findByToken(token);
  if (!row) return { status: 'not-found' };
  return { status: 'found', firstName: row.firstName, alreadyUnsubscribed: row.unsubscribedAt !== null };
}

// POST /api/unsubscribe: idempotent. A second submit is not an error and does
// not move the original unsubscribe time.
export async function unsubscribe(token: string, now: Date): Promise<UnsubscribeResult> {
  const row = await findByToken(token);
  if (!row) return 'not-found';
  if (row.unsubscribedAt) return 'unsubscribed';

  await d1.update(Subscriber).set({ unsubscribedAt: now }).where(eq(Subscriber.token, token));
  return 'unsubscribed';
}
