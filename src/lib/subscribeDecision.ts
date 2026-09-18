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

export type SubscribeDecision =
  | { kind: 'insert'; values: typeof Subscriber.$inferInsert; sendTo: SendTo }
  | { kind: 'resend'; sendTo: SendTo }
  | { kind: 'noop' }
  | {
      kind: 'reactivate';
      set: Pick<SubscriberRow, 'firstName' | 'lastName' | 'token' | 'confirmedAt' | 'unsubscribedAt'>;
      sendTo: SendTo;
    };

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
    // Signed up before but never confirmed - resend using the same token.
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
