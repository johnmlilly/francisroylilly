import { db, Comment, Reaction } from './client';

await db.insert(Comment).values([
  {
    postSlug: 'april-1-2025',
    name: 'John Lilly',
    email: 'jamie@turso.tech',
    message: 'Test',
    createdAt: new Date().toISOString(),
  },
  {
    postSlug: 'april-1-2025',
    name: 'Kara',
    email: 'jamie@turso.tech',
    message: 'Another test',
    createdAt: new Date().toISOString(),
  },
]);

await db.insert(Reaction).values([
  { postSlug: 'first-post', loves: 2 },
  { postSlug: 'second-post', loves: 5 },
]);

console.log('Seed complete.');
