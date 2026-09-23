import type { APIRoute } from 'astro';
import { db, Reaction, eq } from '../../../db/client.js';
import { json, requirePostSlug } from '../../lib/http.js';

// Hits Turso on every request — must run on-demand, not at build time.
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const scope = requirePostSlug(url);
  if ('error' in scope) return scope.error;

  try {
    const reaction = await db
      .select()
      .from(Reaction)
      .where(eq(Reaction.postSlug, scope.postSlug))
      .get();

    const loves = reaction?.loves || 0;

    return json({ loves }, 200);
  } catch (error) {
    return json({ error: 'Failed to fetch reactions' }, 500);
  }
};
