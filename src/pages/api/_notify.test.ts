import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1State, resetD1 } from '../../test/fake-d1.js';

const { batchSendMock, getCollectionMock } = vi.hoisted(() => ({
  batchSendMock: vi.fn(async (emails: unknown[]) => ({
    data: { data: emails.map((_, i) => ({ id: `msg-${i}` })) },
    error: null,
  })),
  getCollectionMock: vi.fn(async () => [] as unknown[]),
}));

vi.mock('../../../db/d1-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../db/d1-client.js')>();
  const { fakeD1 } = await import('../../test/fake-d1.js');
  return { ...actual, d1: fakeD1 };
});

vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSendMock };
  },
}));

vi.mock('astro:content', () => ({ getCollection: getCollectionMock }));

import { ALL, POST } from './notify.js';

const SECRET = 'test-notify-secret';

function call(headers: Record<string, string> = {}, query = '') {
  const url = new URL(`/api/notify${query}`, 'http://localhost');
  const request = new Request(url, { method: 'POST', headers });
  return POST({ request, url } as Parameters<typeof POST>[0]);
}

const entry = (id: string, pubDate: string) => ({
  id,
  data: { title: `Title ${id}`, description: `About ${id}`, pubDate: new Date(pubDate), isPublished: true },
});

const subscriber = (n: number) => ({
  id: n,
  email: `reader${n}@example.com`,
  firstName: `Reader${n}`,
  lastName: 'Doe',
  token: `tok-${n}`,
  createdAt: new Date('2026-01-01'),
  confirmedAt: new Date('2026-01-02'),
  unsubscribedAt: null,
});

type SentEmail = { to: string; subject: string; html: string };

describe('POST /api/notify', () => {
  beforeEach(() => {
    process.env.NOTIFY_SECRET = SECRET;
    resetD1();
    batchSendMock.mockClear();
    getCollectionMock.mockReset();
    getCollectionMock.mockResolvedValue([]);
  });

  it('rejects a missing or wrong secret with 401 before touching content', async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ 'x-notify-secret': 'wrong' })).status).toBe(401);
    expect(getCollectionMock).not.toHaveBeenCalled();
  });

  it('rejects when no secret is configured', async () => {
    delete process.env.NOTIFY_SECRET;
    expect((await call({ 'x-notify-secret': '' })).status).toBe(401);
  });

  it('answers 405 for other methods', async () => {
    const response = await ALL({} as Parameters<typeof ALL>[0]);
    expect(response.status).toBe(405);
  });

  it('batch-emails active subscribers about each new post and records the post', async () => {
    getCollectionMock.mockResolvedValue([entry('old-post', '2026-01-01'), entry('new-post', '2026-02-01')]);
    // 1st list: PostNotification rows; 2nd list: active subscribers.
    resetD1([], [[{ postSlug: 'old-post' }], [subscriber(1)]]);

    const response = await call({ 'x-notify-secret': SECRET });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notified: [{ slug: 'new-post', sent: 1, failed: 0 }],
      skipped: false,
    });

    expect(batchSendMock).toHaveBeenCalledTimes(1);
    const batch = batchSendMock.mock.calls[0][0] as SentEmail[];
    expect(batch).toHaveLength(1);
    expect(batch[0].to).toBe('reader1@example.com');
    expect(batch[0].subject).toBe('New update: Title new-post');
    expect(batch[0].html).toContain('/blog/new-post/');
    expect(batch[0].html).toContain('/api/unsubscribe?token=tok-1');

    expect(d1State.inserted).toHaveLength(1);
    expect(d1State.inserted[0].postSlug).toBe('new-post');
  });

  it('splits more than 100 recipients into multiple batch calls', async () => {
    getCollectionMock.mockResolvedValue([entry('p', '2026-01-01')]);
    const many = Array.from({ length: 150 }, (_, i) => subscriber(i + 1));
    resetD1([], [[], many]);

    const body = await (await call({ 'x-notify-secret': SECRET })).json();

    expect(batchSendMock).toHaveBeenCalledTimes(2);
    expect((batchSendMock.mock.calls[0][0] as unknown[]).length).toBe(100);
    expect((batchSendMock.mock.calls[1][0] as unknown[]).length).toBe(50);
    expect(body.notified).toEqual([{ slug: 'p', sent: 150, failed: 0 }]);
  });

  it('with skipSend=true records rows and sends nothing', async () => {
    getCollectionMock.mockResolvedValue([entry('a', '2026-01-01'), entry('b', '2026-02-01')]);
    resetD1([], [[]]);

    const body = await (await call({ 'x-notify-secret': SECRET }, '?skipSend=true')).json();

    expect(body.skipped).toBe(true);
    expect(body.notified.map((n: { slug: string }) => n.slug)).toEqual(['a', 'b']);
    expect(batchSendMock).not.toHaveBeenCalled();
    expect(d1State.inserted.map((r) => r.postSlug)).toEqual(['a', 'b']);
  });

  it('counts a failed batch but still records the post so a rerun never double-sends', async () => {
    getCollectionMock.mockResolvedValue([entry('p', '2026-01-01')]);
    resetD1([], [[], [subscriber(1), subscriber(2)]]);
    batchSendMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never);

    const body = await (await call({ 'x-notify-secret': SECRET })).json();
    expect(body.notified).toEqual([{ slug: 'p', sent: 0, failed: 2 }]);
    expect(d1State.inserted).toHaveLength(1);
  });
});
