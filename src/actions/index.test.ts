import { describe, expect, it } from 'vitest';
import { db, Reaction, eq } from '../../db/client.js';
import { addCommentHandler, addLoveHandler } from './index.js';

const validComment = {
  postSlug: 'test-post',
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'So happy to see this update!',
  website: '',
  timestamp: String(Date.now() - 4000),
};

describe('addCommentHandler', () => {
  it('rejects when the honeypot field is filled', async () => {
    await expect(
      addCommentHandler({ ...validComment, website: 'http://spam.example' })
    ).rejects.toThrow('Spam detected.');
  });

  it('rejects submissions faster than 3 seconds', async () => {
    await expect(
      addCommentHandler({ ...validComment, timestamp: String(Date.now()) })
    ).rejects.toThrow('Submission too fast');
  });

  it.each(['viagra', 'CIALIS', 'poker', 'casino'])(
    'rejects messages containing spam word "%s"',
    async (word) => {
      await expect(
        addCommentHandler({ ...validComment, message: `check out this ${word} deal` })
      ).rejects.toThrow('prohibited content');
    }
  );

  it('rejects curse words like "damn" even in a sincere comment', async () => {
    await expect(
      addCommentHandler({
        ...validComment,
        message: "I'm so damn glad he's okay, praise God.",
      })
    ).rejects.toThrow('prohibited content');
  });

  it('inserts a valid comment and strips HTML tags', async () => {
    const result = await addCommentHandler({
      ...validComment,
      email: 'strip-html@example.com',
      name: '<b>Jane</b>',
      message: '<em>Great</em> news!',
    });

    expect(result.name).toBe('Jane');
    expect(result.message).toBe('Great news!');
    expect(result.email).toBe('strip-html@example.com');
  });

  it('rate-limits a second comment from the same email within 30 seconds', async () => {
    const email = 'rate-limited@example.com';
    await addCommentHandler({ ...validComment, email });

    await expect(addCommentHandler({ ...validComment, email })).rejects.toThrow(
      'wait before posting'
    );
  });
});

describe('addLoveHandler', () => {
  async function lovesFor(postSlug: string) {
    const rows = await db.select().from(Reaction).where(eq(Reaction.postSlug, postSlug));
    return rows;
  }

  it('creates a reaction row on the first love', async () => {
    const postSlug = 'love-test-first';
    const result = await addLoveHandler({ postSlug });

    expect(result.success).toBe(true);

    const rows = await lovesFor(postSlug);
    expect(rows).toHaveLength(1);
    expect(rows[0].loves).toBe(1);
  });

  it('increments an existing reaction on subsequent loves', async () => {
    const postSlug = 'love-test-increment';
    await addLoveHandler({ postSlug });
    const result = await addLoveHandler({ postSlug });

    expect(result.success).toBe(true);

    // Still one row - incremented, not duplicated.
    const rows = await lovesFor(postSlug);
    expect(rows).toHaveLength(1);
    expect(rows[0].loves).toBe(2);
  });
});
