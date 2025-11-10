// src/actions/index.ts
import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { db, Comment, eq, desc, } from 'astro:db';
import { Reaction } from "astro:db";


export const server = {
  addComment: defineAction({
    accept: 'form',
    input: z.object({
      postSlug: z.string(),
      name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
      email: z.string().email('Valid email is required'),
      message: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment too long'),
      // Honeypot field - bots will fill this, humans won't see it
      website: z.string().optional(),
      // Timestamp to check submission speed
      timestamp: z.string(),
    }),
    handler: async ({ postSlug, name, email, message, website, timestamp }) => {
      // 1. HONEYPOT CHECK - if website field is filled, it's a bot
      if (website && website.length > 0) {
        throw new Error('Spam detected');
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
      ];

      const hasSpam = spamPatterns.some(pattern => 
        pattern.test(message) || pattern.test(name)
      );

      if (hasSpam) {
        throw new Error('Comment contains prohibited content');
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
          throw new Error('Please wait before posting another comment');
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
          createdAt: new Date(),
        })
        .returning();

      return comment[0];
    },
  }),
   // ❤️ Add Love Reaction
  addLove: defineAction({
    accept: "form",
    input: z.object({
      postSlug: z.string(),
    }),
    handler: async ({ postSlug }) => {
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
    },
  }),
};