import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { db } from '../../db/client.js';

// Under Vitest `db` is libSQL `:memory:` (see db/client.ts), typed as D1.
await migrate(db as unknown as LibSQLDatabase, { migrationsFolder: './drizzle' });
