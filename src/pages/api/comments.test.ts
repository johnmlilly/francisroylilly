import { describe, expect, it } from 'vitest';
import { db, Comment } from '../../../db/client.js';
import { GET } from './comments.js';

function requestWith(params: Record<string, string>) {
  const url = new URL('http://localhost/api/comments');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return { url } as Parameters<typeof GET>[0];
}

describe('GET /api/comments', () => {
  it('returns 400 when postSlug is missing', async () => {
    const response = await GET(requestWith({}));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('postSlug is required');
  });

  it('returns comments for the given postSlug, newest first', async () => {
    const postSlug = 'comments-api-test';
    await db.insert(Comment).values([
      {
        postSlug,
        name: 'First',
        email: 'first@example.com',
        message: 'Older comment',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        postSlug,
        name: 'Second',
        email: 'second@example.com',
        message: 'Newer comment',
        createdAt: new Date().toISOString(),
      },
    ]);

    const response = await GET(requestWith({ postSlug }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('Second');
    expect(body[1].name).toBe('First');
  });

  it('returns an empty array for a postSlug with no comments', async () => {
    const response = await GET(requestWith({ postSlug: 'no-comments-here' }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual([]);
  });
});
