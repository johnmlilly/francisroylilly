import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from '../../db/client.js';

await migrate(db, { migrationsFolder: './drizzle' });
