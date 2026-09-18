import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { Resend } from 'resend';
import { d1, PostNotification, Subscriber, and, isNotNull, isNull } from '../../../db/d1-client.js';
import { newPostNotificationEmail } from '../../../emails/newPostNotification.js';
import { SITE_URL } from '../../consts.js';
import { secretsMatch, selectNewPosts } from '../../lib/notify.js';

// Reads D1 and content per request; never prerender.
export const prerender = false;

const FROM = 'Francis Roy Lilly <updates@francisroylilly.com>';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Called by `.github/workflows/notify-subscribers.yml` after a push to `main`
 * touching blog content. Emails every active subscriber about each published
 * post that has no `PostNotification` row yet, then records the row.
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
      let sent = 0;
      let failed = 0;

      for (const subscriber of subscribers) {
        const { subject, html } = newPostNotificationEmail({
          firstName: subscriber.firstName,
          title: post.title,
          description: post.description,
          postUrl: `${SITE_URL}/blog/${post.id}/`,
          unsubscribeUrl: `${SITE_URL}/api/unsubscribe?token=${subscriber.token}`,
        });

        try {
          const { error } = await resend!.emails.send({ from: FROM, to: subscriber.email, subject, html });
          if (error) failed++;
          else sent++;
        } catch {
          failed++;
        }
      }

      // Record regardless of partial failures so a rerun never double-sends;
      // failures are visible in the response and the Actions log.
      await d1.insert(PostNotification).values({ postSlug: post.id, notifiedAt: new Date() });
      notified.push({ slug: post.id, sent, failed });
    }
  }

  return json({ notified, skipped: skipSend }, 200);
};

export const ALL: APIRoute = () => json({ error: 'Method not allowed' }, 405);
