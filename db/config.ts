import { defineDb, defineTable, column } from 'astro:db';

export const Comment = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    postSlug: column.text(),
    name: column.text(),
    email: column.text(),
    message: column.text(),
    createdAt: column.date({ default: new Date() }),
  },
});

export const Reaction = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    postSlug: column.text(),
    loves: column.number({ default: 0 }),
  },
});

export default defineDb({
  tables: { Comment, Reaction },
});