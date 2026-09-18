import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1State, resetD1 } from '../test/fake-d1.js';
import type { SubscriberRow } from './subscribeDecision.js';

vi.mock('../../db/d1-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/d1-client.js')>();
  const { fakeD1 } = await import('../test/fake-d1.js');
  return { ...actual, d1: fakeD1 };
});

import {
  confirmSubscription,
  lookupConfirmToken,
  lookupUnsubscribeToken,
  unsubscribe,
} from './subscriptions.js';

const now = new Date('2026-09-17T12:00:00Z');

const row = (overrides: Partial<SubscriberRow> = {}): SubscriberRow => ({
  id: 1,
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  token: 'tok',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  confirmedAt: null,
  unsubscribedAt: null,
  ...overrides,
});

beforeEach(() => resetD1());

describe('lookupConfirmToken', () => {
  it('reports not-found for an unknown token', async () => {
    resetD1([undefined]);
    expect(await lookupConfirmToken('nope')).toEqual({ status: 'not-found' });
  });

  it('reports pending with the first name for an unconfirmed token', async () => {
    resetD1([row()]);
    expect(await lookupConfirmToken('tok')).toEqual({ status: 'pending', firstName: 'Jane' });
  });

  it('reports already-confirmed and never writes', async () => {
    resetD1([row({ confirmedAt: now })]);
    expect(await lookupConfirmToken('tok')).toEqual({ status: 'already-confirmed' });
    expect(d1State.updated).toHaveLength(0);
  });
});

describe('confirmSubscription', () => {
  it('sets confirmedAt exactly once', async () => {
    resetD1([row()]);
    expect(await confirmSubscription('tok', now)).toBe('confirmed');
    expect(d1State.updated).toEqual([{ confirmedAt: now }]);
  });

  it('refuses a second confirmation', async () => {
    resetD1([row({ confirmedAt: now })]);
    expect(await confirmSubscription('tok', now)).toBe('already-confirmed');
    expect(d1State.updated).toHaveLength(0);
  });

  it('refuses an unknown token', async () => {
    resetD1([undefined]);
    expect(await confirmSubscription('nope', now)).toBe('not-found');
    expect(d1State.updated).toHaveLength(0);
  });
});

describe('lookupUnsubscribeToken', () => {
  it('reports not-found for an unknown token', async () => {
    resetD1([undefined]);
    expect(await lookupUnsubscribeToken('nope')).toEqual({ status: 'not-found' });
  });

  it('reports whether the subscriber already unsubscribed', async () => {
    resetD1([row({ confirmedAt: now }), row({ confirmedAt: now, unsubscribedAt: now })]);
    expect(await lookupUnsubscribeToken('tok')).toEqual({
      status: 'found',
      firstName: 'Jane',
      alreadyUnsubscribed: false,
    });
    expect(await lookupUnsubscribeToken('tok')).toEqual({
      status: 'found',
      firstName: 'Jane',
      alreadyUnsubscribed: true,
    });
  });
});

describe('unsubscribe', () => {
  it('sets unsubscribedAt for an active subscriber', async () => {
    resetD1([row({ confirmedAt: now })]);
    expect(await unsubscribe('tok', now)).toBe('unsubscribed');
    expect(d1State.updated).toEqual([{ unsubscribedAt: now }]);
  });

  it('is idempotent: a second submit succeeds without another write', async () => {
    resetD1([row({ confirmedAt: now, unsubscribedAt: new Date('2026-05-01') })]);
    expect(await unsubscribe('tok', now)).toBe('unsubscribed');
    expect(d1State.updated).toHaveLength(0);
  });

  it('refuses an unknown token', async () => {
    resetD1([undefined]);
    expect(await unsubscribe('nope', now)).toBe('not-found');
  });
});
