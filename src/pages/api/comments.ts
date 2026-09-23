import type { APIRoute } from 'astro';
import { db, Comment, eq, desc } from '../../../db/client.js';
import { json, requirePostSlug } from '../../lib/http.js';

// Hits Turso on every request — must run on-demand, not at build time.
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const scope = requirePostSlug(url);
  if ('error' in scope) return scope.error;

  try {
    const comments = await db
      .select()
      .from(Comment)
      .where(eq(Comment.postSlug, scope.postSlug))
      .orderBy(desc(Comment.createdAt));

    return json(comments, 200);
  } catch (error) {
    return json({ error: 'Failed to fetch comments' }, 500);
  }
};
