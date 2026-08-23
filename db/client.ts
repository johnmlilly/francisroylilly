import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

// Test runs always get a throwaway in-memory DB, even when Turso credentials are
// present in the environment - a test must never write to the real database.
const client = createClient(
  process.env.VITEST
    ? { url: ':memory:' }
    : url
      ? { url, authToken }
      : { url: 'file:.data/local.db' }
);

export const db = drizzle(client, { schema });
export { Comment, Reaction } from './schema.js';
export { eq, desc } from 'drizzle-orm';
