import { createClient } from '@libsql/client';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { env } from 'cloudflare:workers';
import * as schema from './schema.js';

type Db = ReturnType<typeof drizzleD1<typeof schema>>;

let instance: Db | undefined;

// Cloudflare Workers only populates bindings inside a request, so the client
// has to be created on first use rather than at module scope.
function getDb(): Db {
  if (!instance) {
    // Test runs get a throwaway in-memory SQLite DB with the same query API, so
    // tests run real SQL and can never reach the production database.
    instance = process.env.VITEST
      ? (drizzleLibsql(createClient({ url: ':memory:' }), { schema }) as unknown as Db)
      : drizzleD1(env.SUBSCRIBERS_DB, { schema });
  }

  return instance;
}

export const db = new Proxy({} as Db, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { Comment, Reaction, Subscriber, PostNotification } from './schema.js';
export { eq, desc, isNull, and, isNotNull } from 'drizzle-orm';
