import { describe, expect, it, vi } from 'vitest';
import type { BatchSender, NotificationEmail } from './notify.js';
import {
  buildNotificationEmails,
  chunk,
  secretsMatch,
  selectNewPosts,
  sendInBatches,
} from './notify.js';

const now = new Date('2026-09-17T12:00:00Z');
const post = (id: string, pubDate: string, isPublished = true) => ({
  id,
  pubDate: new Date(pubDate),
  isPublished,
});

describe('selectNewPosts', () => {
  it('returns unnotified published posts, oldest first', () => {
    const posts = [post('newer', '2026-09-10'), post('older', '2026-09-01'), post('done', '2026-08-01')];
    const result = selectNewPosts(posts, ['done'], now);
    expect(result.map((p) => p.id)).toEqual(['older', 'newer']);
  });

  it('never includes a draft, even when it has no notification row', () => {
    const posts = [post('draft', '2026-09-01', false), post('live', '2026-09-02')];
    expect(selectNewPosts(posts, [], now).map((p) => p.id)).toEqual(['live']);
  });

  it('holds back posts dated in the future', () => {
    const posts = [post('future', '2026-12-25'), post('today', '2026-09-17T11:59:00Z')];
    expect(selectNewPosts(posts, [], now).map((p) => p.id)).toEqual(['today']);
  });

  it('returns nothing when everything is already notified', () => {
    const posts = [post('a', '2026-01-01'), post('b', '2026-02-01')];
    expect(selectNewPosts(posts, ['a', 'b'], now)).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into groups of at most size, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('buildNotificationEmails', () => {
  const newPost = { id: 'first-steps', title: 'First steps', description: 'He walked.' };
  const subscriber = { firstName: 'Ann', email: 'ann@example.com', token: 'tok-1' };

  it('renders one email per subscriber with a personal unsubscribe link', () => {
    const emails = buildNotificationEmails(newPost, [
      subscriber,
      { firstName: 'Bo', email: 'bo@example.com', token: 'tok-2' },
    ]);

    expect(emails.map((email) => email.to)).toEqual(['ann@example.com', 'bo@example.com']);
    expect(emails[0].subject).toContain('First steps');
    expect(emails[0].html).toContain('Ann');
    expect(emails[0].html).toContain('/blog/first-steps/');
    expect(emails[0].html).toContain('token=tok-1');
    expect(emails[1].html).toContain('token=tok-2');
  });

  it('returns nothing when there are no subscribers', () => {
    expect(buildNotificationEmails(newPost, [])).toEqual([]);
  });
});

describe('sendInBatches', () => {
  const emails = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      from: 'updates@example.com',
      to: `sub${i}@example.com`,
      subject: 'New update',
      html: '<p>Hi</p>',
    }));

  const sender = (send: BatchSender['batch']['send']): BatchSender => ({ batch: { send } });

  it('sends every batch and counts them as sent', async () => {
    const send = vi.fn(async () => ({ error: null }));
    const result = await sendInBatches(sender(send), emails(5), 2);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map((call) => (call[0] as NotificationEmail[]).length)).toEqual([2, 2, 1]);
    expect(result).toEqual({ sent: 5, failed: 0 });
  });

  it('counts a batch that comes back with an error as failed', async () => {
    const send = vi.fn(async () => ({ error: { message: 'rate limited' } }));
    expect(await sendInBatches(sender(send), emails(3), 2)).toEqual({ sent: 0, failed: 3 });
  });

  it('keeps sending after a batch throws', async () => {
    let call = 0;
    const send = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('network down');
      return { error: null };
    });

    expect(await sendInBatches(sender(send), emails(4), 2)).toEqual({ sent: 2, failed: 2 });
  });

  it('never calls the sender when there is nothing to send', async () => {
    const send = vi.fn(async () => ({ error: null }));
    expect(await sendInBatches(sender(send), [], 100)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('secretsMatch', () => {
  it('matches identical secrets', () => {
    expect(secretsMatch('s3cret', 's3cret')).toBe(true);
  });

  it('rejects different secrets of equal and unequal length', () => {
    expect(secretsMatch('s3cret', 's3creT')).toBe(false);
    expect(secretsMatch('s3cret', 's3cret-longer')).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
  });

  it('rejects a missing header or unset secret', () => {
    expect(secretsMatch(null, 's3cret')).toBe(false);
    expect(secretsMatch(undefined, 's3cret')).toBe(false);
    expect(secretsMatch('s3cret', undefined)).toBe(false);
  });
});
