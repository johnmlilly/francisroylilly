/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  resolve: {
    alias: {
      // `cloudflare:workers` is a workerd virtual module; Node can't resolve it.
      'cloudflare:workers': fileURLToPath(
        new URL('./src/test/cloudflare-workers-stub.ts', import.meta.url)
      ),
    },
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
});
