/** JSON response helper shared by the API routes. */
export function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Every public read route is scoped to one post. Returns the slug, or the 400
 * to send back when it is missing.
 */
export function requirePostSlug(url: URL): { postSlug: string } | { error: Response } {
  const postSlug = url.searchParams.get('postSlug');

  if (!postSlug) {
    return { error: json({ error: 'postSlug is required' }, 400) };
  }

  return { postSlug };
}
