import { describe, expect, it } from 'vitest';
import { CONFIRMATION_RESEND_WINDOW_MS, decideSubscribe, type SubscriberRow } from './subscribeDecision.js';

const now = new Date('2026-09-17T12:00:00Z');
const input = { email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' };
const newToken = () => 'fresh-token';

const row = (overrides: Partial<SubscriberRow> = {}): SubscriberRow => ({
  id: 1,
  email: 'jane@example.com',
  firstName: 'Old',
  lastName: 'Name',
  token: 'old-token',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  confirmedAt: null,
  unsubscribedAt: null,
  lastEmailedAt: null,
  ...overrides,
});

const msAgo = (ms: number) => new Date(now.getTime() - ms);

describe('decideSubscribe', () => {
  it('inserts a new unconfirmed row and sends a confirmation for a new email', () => {
    const decision = decideSubscribe(undefined, input, now, newToken);
    expect(decision).toEqual({
      kind: 'insert',
      values: { ...input, token: 'fresh-token', createdAt: now },
      sendTo: { firstName: 'Jane', email: input.email, token: 'fresh-token' },
    });
  });

  it('resends with the same token when the email is still unconfirmed', () => {
    const decision = decideSubscribe(row(), input, now, newToken);
    expect(decision).toEqual({
      kind: 'resend',
      sendTo: { firstName: 'Old', email: input.email, token: 'old-token' },
    });
  });

  it('does nothing for an active subscriber', () => {
    const decision = decideSubscribe(row({ confirmedAt: now }), input, now, newToken);
    expect(decision).toEqual({ kind: 'noop' });
  });

  it('reactivates a previously unsubscribed email with a new token and cleared timestamps', () => {
    const decision = decideSubscribe(
      row({ confirmedAt: new Date('2026-02-01T00:00:00Z'), unsubscribedAt: new Date('2026-03-01T00:00:00Z') }),
      input,
      now,
      newToken
    );
    expect(decision).toEqual({
      kind: 'reactivate',
      set: {
        firstName: 'Jane',
        lastName: 'Doe',
        token: 'fresh-token',
        confirmedAt: null,
        unsubscribedAt: null,
      },
      sendTo: { firstName: 'Jane', email: input.email, token: 'fresh-token' },
    });
  });

  describe('throttle', () => {
    const unsubscribed = { confirmedAt: new Date('2026-02-01T00:00:00Z'), unsubscribedAt: new Date('2026-03-01T00:00:00Z') };

    it('throttles a resend when a confirmation went out inside the window', () => {
      const existing = row({ lastEmailedAt: msAgo(CONFIRMATION_RESEND_WINDOW_MS - 1) });
      expect(decideSubscribe(existing, input, now, newToken)).toEqual({ kind: 'throttled' });
    });

    it('throttles a reactivation when a confirmation went out inside the window', () => {
      const existing = row({ ...unsubscribed, lastEmailedAt: msAgo(1000) });
      expect(decideSubscribe(existing, input, now, newToken)).toEqual({ kind: 'throttled' });
    });

    it('allows a resend at exactly the window and beyond', () => {
      expect(decideSubscribe(row({ lastEmailedAt: msAgo(CONFIRMATION_RESEND_WINDOW_MS) }), input, now, newToken).kind).toBe('resend');
      expect(decideSubscribe(row({ lastEmailedAt: msAgo(CONFIRMATION_RESEND_WINDOW_MS * 3) }), input, now, newToken).kind).toBe('resend');
    });

    it('allows a reactivation once the window has passed', () => {
      const existing = row({ ...unsubscribed, lastEmailedAt: msAgo(CONFIRMATION_RESEND_WINDOW_MS) });
      expect(decideSubscribe(existing, input, now, newToken).kind).toBe('reactivate');
    });

    it('never throttles a row that has no lastEmailedAt (pre-migration rows)', () => {
      expect(decideSubscribe(row({ lastEmailedAt: null }), input, now, newToken).kind).toBe('resend');
      expect(decideSubscribe(row({ ...unsubscribed, lastEmailedAt: null }), input, now, newToken).kind).toBe('reactivate');
    });

    it('never throttles an active subscriber into a send', () => {
      expect(decideSubscribe(row({ confirmedAt: now, lastEmailedAt: msAgo(1000) }), input, now, newToken)).toEqual({ kind: 'noop' });
    });
  });
});
