import { db, Comment, Reaction } from 'astro:db';

export default async function () {
  await db.insert(Comment).values([
    {
      postSlug: 'april-1-2025',
      name: 'John Lilly',
      email: 'jamie@turso.tech',
      message: 'Test',
      createdAt: new Date(),
    },
    {
      postSlug: 'april-1-2025',
      name: 'Kara',
      email: 'jamie@turso.tech',
      message: 'Another test',
      createdAt: new Date(),
    },
  ]);
  await db.insert(Reaction).values([
    { postSlug: "first-post", loves: 2 },
    { postSlug: "second-post", loves: 5 },
  ]);
}
