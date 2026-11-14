import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import * as schema from './schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

// Cloudflare Workers only populates bindings inside a request, so the client
// has to be created on first use rather than at module scope.
// Under Vitest this module is aliased to src/test/db-client.ts (in-memory libSQL).
function getDb(): Db {
  if (!instance) {
    instance = drizzle(env.DB, { schema });
  }

  return instance;
}

export const db = new Proxy({} as Db, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { Comment, Reaction, Subscriber, PostNotification } from './schema.js';
export { eq, desc, isNull, and, isNotNull } from 'drizzle-orm';
