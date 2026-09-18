import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const Subscriber = sqliteTable('Subscriber', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  firstName: text('firstName').notNull(),
  lastName: text('lastName').notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  confirmedAt: integer('confirmedAt', { mode: 'timestamp' }),
  unsubscribedAt: integer('unsubscribedAt', { mode: 'timestamp' }),
  // Last time a confirmation email went to this address; throttles resends.
  lastEmailedAt: integer('lastEmailedAt', { mode: 'timestamp' }),
});

export const PostNotification = sqliteTable('PostNotification', {
  postSlug: text('postSlug').primaryKey(),
  notifiedAt: integer('notifiedAt', { mode: 'timestamp' }).notNull(),
});
