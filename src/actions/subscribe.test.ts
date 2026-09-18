import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1State, resetD1 } from '../test/fake-d1.js';
import type { SubscriberRow } from '../lib/subscribeDecision.js';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(async () => ({ data: { id: 'msg' }, error: null })) }));

vi.mock('../../db/d1-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/d1-client.js')>();
  const { fakeD1 } = await import('../test/fake-d1.js');
  return { ...actual, d1: fakeD1 };
});

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { subscribeToUpdatesHandler } from './index.js';

const validInput = {
  email: 'Jane@Example.com ',
  firstName: 'Jane',
  lastName: 'Doe',
  website: '',
  timestamp: String(Date.now() - 4000),
};

const expectedMessage = 'Check your email to confirm your subscription.';

const row = (overrides: Partial<SubscriberRow> = {}): SubscriberRow => ({
  id: 1,
  email: 'jane@example.com',
  firstName: 'Old',
  lastName: 'Name',
  token: 'old-token',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  confirmedAt: null,
  unsubscribedAt: null,
  ...overrides,
});

describe('subscribeToUpdatesHandler', () => {
  beforeEach(() => {
    resetD1();
    sendMock.mockClear();
  });

  it('rejects when the honeypot field is filled', async () => {
    await expect(
      subscribeToUpdatesHandler({ ...validInput, website: 'http://spam.example' })
    ).rejects.toThrow('Spam detected.');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects submissions faster than 3 seconds', async () => {
    await expect(
      subscribeToUpdatesHandler({ ...validInput, timestamp: String(Date.now()) })
    ).rejects.toThrow('Submission too fast');
  });

  it('inserts a normalized, unconfirmed row and emails a confirm link for a new address', async () => {
    resetD1([undefined]);
    const result = await subscribeToUpdatesHandler(validInput);

    expect(result).toEqual({ message: expectedMessage });
    expect(d1State.inserted).toHaveLength(1);
    const inserted = d1State.inserted[0];
    expect(inserted.email).toBe('jane@example.com');
    expect(inserted.firstName).toBe('Jane');
    expect(inserted.confirmedAt).toBeUndefined();
    expect(typeof inserted.token).toBe('string');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe('jane@example.com');
    expect(sent.subject).toBe('Confirm your subscription');
    expect(sent.html).toContain(`/api/confirm?token=${inserted.token}`);
  });

  it('strips HTML tags from names before storing them', async () => {
    resetD1([undefined]);
    await subscribeToUpdatesHandler({ ...validInput, firstName: '<b>Jane</b>', lastName: 'Doe<script>' });
    expect(d1State.inserted[0].firstName).toBe('Jane');
    expect(d1State.inserted[0].lastName).toBe('Doe');
  });

  it('resends with the existing token when the address is still unconfirmed', async () => {
    resetD1([row()]);
    const result = await subscribeToUpdatesHandler(validInput);

    expect(result).toEqual({ message: expectedMessage });
    expect(d1State.inserted).toHaveLength(0);
    expect(d1State.updated).toHaveLength(0);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { html: string };
    expect(sent.html).toContain('/api/confirm?token=old-token');
  });

  it('sends nothing and changes nothing for an active subscriber', async () => {
    resetD1([row({ confirmedAt: new Date() })]);
    const result = await subscribeToUpdatesHandler(validInput);

    expect(result).toEqual({ message: expectedMessage });
    expect(d1State.inserted).toHaveLength(0);
    expect(d1State.updated).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('re-opts-in a previously unsubscribed address with a new token', async () => {
    resetD1([row({ confirmedAt: new Date('2026-02-01'), unsubscribedAt: new Date('2026-03-01') })]);
    const result = await subscribeToUpdatesHandler(validInput);

    expect(result).toEqual({ message: expectedMessage });
    expect(d1State.updated).toHaveLength(1);
    const set = d1State.updated[0];
    expect(set.confirmedAt).toBeNull();
    expect(set.unsubscribedAt).toBeNull();
    expect(set.token).not.toBe('old-token');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { html: string };
    expect(sent.html).toContain(`/api/confirm?token=${set.token}`);
  });
});
