import { describe, expect, it } from 'vitest';
import { db, Reaction } from '../../../db/client.js';
import { apiContext } from '../../test/helpers.js';
import { GET } from './reactions.js';

const requestWith = (params: Record<string, string> = {}) =>
  apiContext('/api/reactions', params);

describe('GET /api/reactions', () => {
  it('returns 400 when postSlug is missing', async () => {
    const response = await GET(requestWith({}));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('postSlug is required');
  });

  it('returns 0 loves for a postSlug with no reaction row', async () => {
    const response = await GET(requestWith({ postSlug: 'no-reaction-here' }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.loves).toBe(0);
  });

  it('returns the stored love count for an existing postSlug', async () => {
    const postSlug = 'reactions-api-test';
    await db.insert(Reaction).values({ postSlug, loves: 5 });

    const response = await GET(requestWith({ postSlug }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.loves).toBe(5);
  });
});
