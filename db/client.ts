import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

// Cloudflare Workers only populates `process.env` inside a request, so the
// client has to be created on first use rather than at module scope.
function getDb(): Db {
  if (!instance) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    // Test runs always get a throwaway in-memory DB, even when Turso credentials
    // are present in the environment - a test must never write to the real database.
    const client = createClient(
      process.env.VITEST
        ? { url: ':memory:' }
        : url
          ? { url, authToken }
          : { url: 'file:.data/local.db' }
    );

    instance = drizzle(client, { schema });
  }

  return instance;
}

export const db = new Proxy({} as Db, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { Comment, Reaction } from './schema.js';
export { eq, desc } from 'drizzle-orm';
