// Load the aliased test DB (src/test/db-client.ts) up front so its migrations
// finish before any test runs.
import '../../db/client.js';
