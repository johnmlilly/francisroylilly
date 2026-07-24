import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const Comment = sqliteTable('Comment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postSlug: text('postSlug').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  createdAt: text('createdAt').notNull(),
});

export const Reaction = sqliteTable('Reaction', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postSlug: text('postSlug').notNull(),
  loves: integer('loves').notNull().default(0),
});
