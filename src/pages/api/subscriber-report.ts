import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { d1, Subscriber } from '../../../db/d1-client.js';
import { subscriberReportEmail } from '../../../emails/subscriberReport.js';
import { EMAIL_FROM } from '../../consts.js';
import { secretsMatch } from '../../lib/notify.js';
import { oneWeekBefore, selectNewSubscribers } from '../../lib/subscriberReport.js';

// Reads D1 per request; never prerender.
export const prerender = false;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Called by `.github/workflows/subscriber-report.yml` on a weekly schedule.
 * Emails `REPORT_EMAIL` every subscriber (confirmed or not) who signed up in
 * the last 7 days, with name, email, subscribe date, and confirmation status.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!secretsMatch(request.headers.get('x-report-secret'), process.env.REPORT_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const reportEmail = process.env.REPORT_EMAIL;
  if (!reportEmail) {
    return json({ error: 'REPORT_EMAIL is not configured' }, 500);
  }

  const now = new Date();
  const since = oneWeekBefore(now);
  const subscribers = await d1.select().from(Subscriber);
  const rows = selectNewSubscribers(subscribers, since, now);

  const { subject, html } = subscriberReportEmail({ rows, periodStart: since, periodEnd: now });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({ from: EMAIL_FROM, to: reportEmail, subject, html });

  return json({ count: rows.length, sent: !error }, error ? 502 : 200);
};

export const ALL: APIRoute = () => json({ error: 'Method not allowed' }, 405);
