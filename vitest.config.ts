/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { getViteConfig } from 'astro/config';

const testDbClient = fileURLToPath(new URL('./src/test/db-client.ts', import.meta.url));

export default getViteConfig({
  resolve: {
    alias: {
      // `cloudflare:workers` is a workerd virtual module; Node can't resolve it.
      'cloudflare:workers': fileURLToPath(
        new URL('./src/test/cloudflare-workers-stub.ts', import.meta.url)
      ),
      // Swap the D1 client for an in-memory libSQL one so tests run real SQL.
      // One key per relative depth that imports it (src/*/ and src/*/*/).
      '../../db/client.js': testDbClient,
      '../../../db/client.js': testDbClient,
    },
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
});
