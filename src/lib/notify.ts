export interface NotifiablePost {
  id: string;
  pubDate: Date;
  isPublished?: boolean;
}

/**
 * Which published posts still need a notification. Pure so the rule can be
 * tested without content collections or D1:
 * - drafts (`isPublished: false`) never qualify
 * - posts dated in the future wait until their `pubDate`
 * - anything already in `PostNotification` is skipped
 * Oldest first, so a backlog goes out in publication order.
 */
export function selectNewPosts<T extends NotifiablePost>(
  posts: readonly T[],
  notifiedSlugs: Iterable<string>,
  now: Date
): T[] {
  const notified = new Set(notifiedSlugs);
  return posts
    .filter((post) => post.isPublished !== false)
    .filter((post) => post.pubDate.getTime() <= now.getTime())
    .filter((post) => !notified.has(post.id))
    .sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
}

/**
 * Constant-time comparison of the `x-notify-secret` header against the
 * configured secret. Works in both workerd and Node (no `timingSafeEqual`
 * dependency). A missing header or unset secret never matches.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;

  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  const length = Math.max(a.length, b.length);

  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
