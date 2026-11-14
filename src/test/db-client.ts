// fallow-ignore-file unused-export
// (Every export is consumed through the vitest.config.ts alias, which static
// analysis resolves to db/client.ts instead.)
// Vitest stand-in for db/client.ts (wired by the alias in vitest.config.ts).
// Same exports, backed by a throwaway in-memory libSQL DB migrated from
// ./drizzle, so tests run real SQL and can never reach the production D1.
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../../db/schema.js';

export const db = drizzle(createClient({ url: ':memory:' }), { schema });

await migrate(db, { migrationsFolder: './drizzle' });

export { Comment, Reaction, Subscriber, PostNotification } from '../../db/schema.js';
export { eq, desc, isNull, and, isNotNull } from 'drizzle-orm';
