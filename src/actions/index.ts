// src/actions/index.ts
import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { Resend } from 'resend';
import { db, Comment, Reaction, eq, desc } from '../../db/client.js';
import { d1, Subscriber } from '../../db/d1-client.js';
import { confirmSubscriptionEmail } from '../../emails/confirmSubscription.js';
import { EMAIL_FROM, SITE_URL } from '../consts.js';
import { decideSubscribe } from '../lib/subscribeDecision.js';

const addCommentInput = z.object({
  postSlug: z.string(),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Valid email is required'),
  message: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment too long'),
  // Honeypot field - bots will fill this, humans won't see it
  website: z.string().optional(),
  // Timestamp to check submission speed
  timestamp: z.string(),
});

// Extracted from defineAction() so it can be unit tested directly -
// Astro Actions throw ActionCalledFromServerError when invoked outside Astro.callAction().
export async function addCommentHandler({
  postSlug,
  name,
  email,
  message,
  website,
  timestamp,
}: z.infer<typeof addCommentInput>) {
  // 1. HONEYPOT CHECK - if website field is filled, it's a bot
  if (website && website.length > 0) {
    throw new Error('Spam detected.');
  }

  // 2. TIME-BASED CHECK - submission must take at least 3 seconds
  const formLoadTime = parseInt(timestamp);
  const currentTime = Date.now();
  const timeDiff = (currentTime - formLoadTime) / 1000; // in seconds

  if (timeDiff < 3) {
    throw new Error('Submission too fast. Please try again.');
  }

  // 3. CONTENT VALIDATION - check for spam patterns
  const spamPatterns = [
    /\b(viagra|cialis|poker|casino)\b/i,
    /https?:\/\/.*https?:\/\//i, // Multiple URLs
    /<script>/i, // Script tags
    /\[url=/i, // BBCode links
    /\b(fuck|shit|bitch|asshole|bastard|damn|dick|piss|crap|slut|whore|cunt)\b/i, // Common curse words
  ];

  const hasSpam = spamPatterns.some(pattern =>
    pattern.test(message) || pattern.test(name)
  );

  if (hasSpam) {
    throw new Error('Comment contains prohibited content.');
  }

  // 4. RATE LIMITING - check recent comments from same email
  const recentComments = await db
    .select()
    .from(Comment)
    .where(eq(Comment.email, email))
    .orderBy(desc(Comment.createdAt))
    .limit(1);

  if (recentComments.length > 0) {
    const lastComment = recentComments[0];
    const timeSinceLastComment = (Date.now() - new Date(lastComment.createdAt).getTime()) / 1000;

    // Must wait 30 seconds between comments
    if (timeSinceLastComment < 30) {
      throw new Error('Please wait before posting another comment.');
    }
  }

  // 5. SANITIZE INPUT - strip HTML tags
  const sanitizedName = name.replace(/<[^>]*>/g, '');
  const sanitizedMessage = message.replace(/<[^>]*>/g, '');

  // All checks passed - insert comment
  const comment = await db
    .insert(Comment)
    .values({
      postSlug,
      name: sanitizedName,
      email: email.toLowerCase(),
      message: sanitizedMessage,
      createdAt: new Date().toISOString(),
    })
    .returning();

  return comment[0];
}

const addLoveInput = z.object({
  postSlug: z.string(),
});

// Extracted from defineAction() so it can be unit tested directly -
// Astro Actions throw ActionCalledFromServerError when invoked outside Astro.callAction().
export async function addLoveHandler({ postSlug }: z.infer<typeof addLoveInput>) {
  // Find existing record
  const existing = await db
    .select()
    .from(Reaction)
    .where(eq(Reaction.postSlug, postSlug))
    .get();

  if (existing) {
    // Increment love count
    await db
      .update(Reaction)
      .set({ loves: existing.loves + 1 })
      .where(eq(Reaction.postSlug, postSlug));
  } else {
    // Create new record
    await db.insert(Reaction).values({
      postSlug,
      loves: 1,
    });
  }

  return { success: true };
}

const subscribeToUpdatesInput = z.object({
  email: z.string().email('Valid email is required'),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
  // Honeypot field - bots will fill this, humans won't see it
  website: z.string().optional(),
  // Timestamp to check submission speed
  timestamp: z.string(),
});

async function sendConfirmationEmail(firstName: string, email: string, token: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const confirmUrl = `${SITE_URL}/api/confirm?token=${token}`;
  const { subject, html } = confirmSubscriptionEmail({ firstName, confirmUrl });

  // The SDK reports failures through `error` instead of throwing.
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject,
    html,
  });

  if (error) {
    throw new Error('We could not send the confirmation email. Please try again.');
  }
}

// Extracted from defineAction() so it can be unit tested directly -
// Astro Actions throw ActionCalledFromServerError when invoked outside Astro.callAction().
export async function subscribeToUpdatesHandler({
  email,
  firstName,
  lastName,
  website,
  timestamp,
}: z.infer<typeof subscribeToUpdatesInput>) {
  // 1. HONEYPOT CHECK - if website field is filled, it's a bot
  if (website && website.length > 0) {
    throw new Error('Spam detected.');
  }

  // 2. TIME-BASED CHECK - submission must take at least 3 seconds. The page
  // script fills `timestamp`; an empty or non-numeric value means the form was
  // posted without running it, which is treated the same as too fast.
  const formLoadTime = /^\d+$/.test(timestamp) ? Number(timestamp) : Number.NaN;
  const timeDiff = (Date.now() - formLoadTime) / 1000; // in seconds

  if (!Number.isFinite(timeDiff) || timeDiff < 3) {
    throw new Error('Submission too fast. Please try again.');
  }

  // 3. SANITIZE INPUT - strip HTML tags
  const sanitizedFirstName = firstName.replace(/<[^>]*>/g, '');
  const sanitizedLastName = lastName.replace(/<[^>]*>/g, '');
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await d1
    .select()
    .from(Subscriber)
    .where(eq(Subscriber.email, normalizedEmail))
    .get();

  const now = new Date();
  const decision = decideSubscribe(
    existing,
    { email: normalizedEmail, firstName: sanitizedFirstName, lastName: sanitizedLastName },
    now,
    () => crypto.randomUUID()
  );

  switch (decision.kind) {
    case 'insert':
      await d1.insert(Subscriber).values(decision.values);
      break;
    case 'reactivate':
      await d1.update(Subscriber).set(decision.set).where(eq(Subscriber.email, normalizedEmail));
      break;
    case 'resend':
    case 'noop':
    case 'throttled':
      break;
  }

  if (decision.kind !== 'noop' && decision.kind !== 'throttled') {
    const { firstName, email: to, token } = decision.sendTo;
    await sendConfirmationEmail(firstName, to, token);
    // Stamp only after a successful send so a Resend failure (already surfaced
    // to the reader as an error) never locks them out for the window.
    await d1.update(Subscriber).set({ lastEmailedAt: now }).where(eq(Subscriber.email, normalizedEmail));
  }

  // The response is the same in every branch - it never reveals whether
  // an address was already on the list.
  return { message: 'Check your email to confirm your subscription.' };
}

export const server = {
  addComment: defineAction({
    accept: 'form',
    input: addCommentInput,
    handler: addCommentHandler,
  }),
  // ❤️ Add Love Reaction
  addLove: defineAction({
    accept: 'form',
    input: addLoveInput,
    handler: addLoveHandler,
  }),
  subscribeToUpdates: defineAction({
    accept: 'form',
    input: subscribeToUpdatesInput,
    handler: subscribeToUpdatesHandler,
  }),
};