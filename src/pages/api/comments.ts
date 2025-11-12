import type { APIRoute } from 'astro';
import { db, Comment, eq, desc } from 'astro:db';

export const GET: APIRoute = async ({ url }) => {
  const postSlug = url.searchParams.get('postSlug');

  if (!postSlug) {
    return new Response(JSON.stringify({ error: 'postSlug is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const comments = await db
      .select()
      .from(Comment)
      .where(eq(Comment.postSlug, postSlug))
      .orderBy(desc(Comment.createdAt));

    return new Response(JSON.stringify(comments), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch comments' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};