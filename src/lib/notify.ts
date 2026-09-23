import { newPostNotificationEmail } from '../../emails/newPostNotification.js';
import { EMAIL_FROM, SITE_URL } from '../consts.js';

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

/** Split a list into consecutive groups of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

export interface NotificationRecipient {
  firstName: string;
  email: string;
  token: string;
}

export interface NotificationEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/** Resend's `batch.send`, narrowed to what sending a post notification needs. */
export interface BatchSender {
  batch: { send(emails: NotificationEmail[]): Promise<{ error: unknown }> };
}

/** One rendered email per subscriber for a single post. */
export function buildNotificationEmails(
  post: { id: string; title: string; description: string },
  subscribers: readonly NotificationRecipient[]
): NotificationEmail[] {
  return subscribers.map((subscriber) => {
    const { subject, html } = newPostNotificationEmail({
      firstName: subscriber.firstName,
      title: post.title,
      description: post.description,
      postUrl: `${SITE_URL}/blog/${post.id}/`,
      unsubscribeUrl: `${SITE_URL}/api/unsubscribe?token=${subscriber.token}`,
    });
    return { from: EMAIL_FROM, to: subscriber.email, subject, html };
  });
}

/**
 * Send in batches and tally the outcome. A rejected call or an error in the
 * response fails that whole batch; the rest still go out, and the caller
 * reports the counts.
 */
export async function sendInBatches(
  resend: BatchSender,
  emails: readonly NotificationEmail[],
  batchSize: number
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const group of chunk(emails, batchSize)) {
    try {
      const { error } = await resend.batch.send(group);
      if (error) failed += group.length;
      else sent += group.length;
    } catch {
      failed += group.length;
    }
  }

  return { sent, failed };
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
