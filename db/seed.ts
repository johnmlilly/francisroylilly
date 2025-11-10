import { db, Comment, Reaction } from 'astro:db';

export default async function () {
  await db.insert(Comment).values([
    {
      postSlug: 'first-post',
      name: 'Jamie',
      email: 'jamie@turso.tech',
      message: 'Great post!',
      createdAt: new Date(),
    },
    {
      postSlug: 'second-post',
      name: 'Jamie',
      email: 'jamie@turso.tech',
      message: 'Another great post!',
      createdAt: new Date(),
    },
  ]);
  await db.insert(Reaction).values([
    { postSlug: "first-post", loves: 2 },
    { postSlug: "second-post", loves: 5 },
  ]);
}
