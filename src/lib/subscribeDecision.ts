import type { Subscriber } from '../../db/d1-schema.js';

export type SubscriberRow = typeof Subscriber.$inferSelect;

export interface SubscribeInput {
  email: string;
  firstName: string;
  lastName: string;
}

interface SendTo {
  firstName: string;
  email: string;
  token: string;
}

// A confirmation email for the same address is sent at most once per window.
export const CONFIRMATION_RESEND_WINDOW_MS = 10 * 60 * 1000;

export type SubscribeDecision =
  | { kind: 'insert'; values: typeof Subscriber.$inferInsert; sendTo: SendTo }
  | { kind: 'resend'; sendTo: SendTo }
  | { kind: 'noop' }
  | { kind: 'throttled' }
  | {
      kind: 'reactivate';
      set: Pick<SubscriberRow, 'firstName' | 'lastName' | 'token' | 'confirmedAt' | 'unsubscribedAt'>;
      sendTo: SendTo;
    };

function emailedRecently(existing: SubscriberRow, now: Date): boolean {
  return (
    existing.lastEmailedAt !== null &&
    now.getTime() - existing.lastEmailedAt.getTime() < CONFIRMATION_RESEND_WINDOW_MS
  );
}

// Pure double-opt-in branch logic, separated from the D1 and Resend calls so
// every branch can be unit-tested without a database.
export function decideSubscribe(
  existing: SubscriberRow | undefined,
  input: SubscribeInput,
  now: Date,
  newToken: () => string
): SubscribeDecision {
  if (!existing) {
    const token = newToken();
    return {
      kind: 'insert',
      values: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        token,
        createdAt: now,
      },
      sendTo: { firstName: input.firstName, email: input.email, token },
    };
  }

  if (!existing.confirmedAt) {
    // Signed up before but never confirmed - resend using the same token,
    // unless a confirmation went out recently.
    if (emailedRecently(existing, now)) return { kind: 'throttled' };
    return {
      kind: 'resend',
      sendTo: { firstName: existing.firstName, email: input.email, token: existing.token },
    };
  }

  if (!existing.unsubscribedAt) {
    // Already an active subscriber - nothing to send.
    return { kind: 'noop' };
  }

  // Previously unsubscribed - fresh opt-in with a new token, through DOI again.
  if (emailedRecently(existing, now)) return { kind: 'throttled' };
  const token = newToken();
  return {
    kind: 'reactivate',
    set: {
      firstName: input.firstName,
      lastName: input.lastName,
      token,
      confirmedAt: null,
      unsubscribedAt: null,
    },
    sendTo: { firstName: input.firstName, email: input.email, token },
  };
}
