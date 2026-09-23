import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetD1 } from '../../test/fake-d1.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async () => ({ data: { id: 'msg-1' }, error: null })),
}));

vi.mock('../../../db/d1-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../db/d1-client.js')>();
  const { fakeD1 } = await import('../../test/fake-d1.js');
  return { ...actual, d1: fakeD1 };
});

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { ALL, POST } from './subscriber-report.js';

const SECRET = 'test-report-secret';

function call(headers: Record<string, string> = {}) {
  const request = new Request('http://localhost/api/subscriber-report', { method: 'POST', headers });
  return POST({ request } as Parameters<typeof POST>[0]);
}

const subscriber = (email: string, createdAt: string, confirmedAt: string | null) => ({
  id: 1,
  email,
  firstName: 'Jane',
  lastName: 'Doe',
  token: 'tok',
  createdAt: new Date(createdAt),
  confirmedAt: confirmedAt ? new Date(confirmedAt) : null,
  unsubscribedAt: null,
});

describe('POST /api/subscriber-report', () => {
  beforeEach(() => {
    process.env.REPORT_SECRET = SECRET;
    process.env.REPORT_EMAIL = 'owner@example.com';
    resetD1();
    sendMock.mockClear();
  });

  it('rejects a missing or wrong secret with 401 before touching D1', async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ 'x-report-secret': 'wrong' })).status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects when no secret is configured', async () => {
    delete process.env.REPORT_SECRET;
    expect((await call({ 'x-report-secret': '' })).status).toBe(401);
  });

  it('answers 405 for other methods', async () => {
    const response = await ALL({} as Parameters<typeof ALL>[0]);
    expect(response.status).toBe(405);
  });

  it('errors when REPORT_EMAIL is not configured', async () => {
    delete process.env.REPORT_EMAIL;
    const response = await call({ 'x-report-secret': SECRET });
    expect(response.status).toBe(500);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('emails REPORT_EMAIL a report of subscribers from the last 7 days', async () => {
    resetD1([], [
      [
        subscriber('recent@example.com', new Date().toISOString(), null),
        subscriber('old@example.com', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z'),
      ],
    ]);

    const response = await call({ 'x-report-secret': SECRET });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1, sent: true });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0] as { to: string; html: string };
    expect(args.to).toBe('owner@example.com');
    expect(args.html).toContain('recent@example.com');
    expect(args.html).not.toContain('old@example.com');
  });

  it('reports a send failure as a 502 without dropping the count', async () => {
    resetD1([], [[subscriber('recent@example.com', new Date().toISOString(), null)]]);
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never);

    const response = await call({ 'x-report-secret': SECRET });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ count: 1, sent: false });
  });
});
