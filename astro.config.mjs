// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://francisroylilly.com/',
  integrations: [mdx(), sitemap(), react()],
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
  },
});
