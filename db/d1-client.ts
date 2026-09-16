import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import * as schema from './d1-schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | undefined;

// Cloudflare Workers only populates bindings inside a request, so the client
// has to be created on first use rather than at module scope.
function getDb(): Db {
  if (!instance) {
    instance = drizzle(env.SUBSCRIBERS_DB, { schema });
  }

  return instance;
}

export const d1 = new Proxy({} as Db, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { Subscriber, PostNotification } from './d1-schema.js';
export { eq, desc, isNull, and, isNotNull } from 'drizzle-orm';
