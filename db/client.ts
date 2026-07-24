import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(
  url
    ? { url, authToken }
    : { url: 'file:.data/local.db' }
);

export const db = drizzle(client, { schema });
export { Comment, Reaction } from './schema.js';
export { eq, desc } from 'drizzle-orm';
