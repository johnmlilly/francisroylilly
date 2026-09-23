import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { Resend } from 'resend';
import { d1, PostNotification, Subscriber, and, isNotNull, isNull } from '../../../db/d1-client.js';
import { json } from '../../lib/http.js';
import {
  buildNotificationEmails,
  secretsMatch,
  selectNewPosts,
  sendInBatches,
} from '../../lib/notify.js';

// Reads D1 and content per request; never prerender.
export const prerender = false;

// Resend's batch endpoint accepts up to 100 emails per call. One call per
// chunk keeps us well under the per-second request limit.
const BATCH_SIZE = 100;

/**
 * Called by `.github/workflows/notify-subscribers.yml` once the pushed commit
 * is deployed. Emails every active subscriber about each published post that
 * has no `PostNotification` row yet, then records the row.
 * `?skipSend=true` records rows without sending (backfill after bulk imports).
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!secretsMatch(request.headers.get('x-notify-secret'), process.env.NOTIFY_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const skipSend = url.searchParams.get('skipSend') === 'true';

  const published = await getCollection('blog', ({ data }) => data.isPublished);
  const notifiedRows = await d1.select({ postSlug: PostNotification.postSlug }).from(PostNotification);

  const newPosts = selectNewPosts(
    published.map((post) => ({
      id: post.id,
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      isPublished: post.data.isPublished,
    })),
    notifiedRows.map((row) => row.postSlug),
    new Date()
  );

  const notified: { slug: string; sent: number; failed: number }[] = [];

  if (newPosts.length > 0) {
    const subscribers = skipSend
      ? []
      : await d1
          .select()
          .from(Subscriber)
          .where(and(isNotNull(Subscriber.confirmedAt), isNull(Subscriber.unsubscribedAt)));

    const resend = skipSend ? null : new Resend(process.env.RESEND_API_KEY);

    for (const post of newPosts) {
      const { sent, failed } = resend
        ? await sendInBatches(resend, buildNotificationEmails(post, subscribers), BATCH_SIZE)
        : { sent: 0, failed: 0 };

      // Record regardless of partial failures so a rerun never double-sends;
      // failures are visible in the response and the Actions log. Ignore a
      // conflict in case two runs overlap despite the workflow concurrency group.
      await d1
        .insert(PostNotification)
        .values({ postSlug: post.id, notifiedAt: new Date() })
        .onConflictDoNothing();
      notified.push({ slug: post.id, sent, failed });
    }
  }

  return json({ notified, skipped: skipSend }, 200);
};

export const ALL: APIRoute = () => json({ error: 'Method not allowed' }, 405);
