import type { APIRoute } from 'astro';
import { db, Reaction, eq } from 'astro:db';

export const GET: APIRoute = async ({ url }) => {
  const postSlug = url.searchParams.get('postSlug');

  if (!postSlug) {
    return new Response(JSON.stringify({ error: 'postSlug is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const reaction = await db
      .select()
      .from(Reaction)
      .where(eq(Reaction.postSlug, postSlug))
      .get();

    const loves = reaction?.loves || 0;

    return new Response(JSON.stringify({ loves }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch reactions' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};