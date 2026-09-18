// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';
import { SITE_URL } from './src/consts.ts';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  integrations: [
    mdx(),
    sitemap({
      // Post-action confirmation pages carry no content worth indexing.
      filter: (page) => !page.endsWith('/subscribed/') && !page.endsWith('/unsubscribed/'),
    }),
    react(),
  ],
  output: 'static',
  // The Cloudflare Vite plugin conflicts with Vitest's Node environment, so
  // unit tests run without the adapter.
  adapter: process.env.VITEST
    ? undefined
    : cloudflare({
        // Workers has no sharp; optimize every image at build time instead.
        imageService: 'compile',
      }),
  session: false,

  vite: {
    plugins: [tailwindcss()],
    define: {
      // Commit the deployed Worker was built from. Workers Builds sets
      // WORKERS_CI_COMMIT_SHA; /api/version exposes it so the notify workflow
      // can wait for its own commit to be live before triggering sends.
      __BUILD_SHA__: JSON.stringify(process.env.WORKERS_CI_COMMIT_SHA ?? 'local'),
    },
  },
});
