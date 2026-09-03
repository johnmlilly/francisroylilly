// @ts-check

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// `blog/[...slug].astro` is SSR (not prerendered — see context/current-feature.md
// "Prerender blog posts for image optimization"), so Astro's build never sees a
// fixed list of blog post routes and @astrojs/sitemap can't discover them on its
// own. Read the published post slugs straight off the content files instead and
// pass them in as customPages.
const blogContentDir = fileURLToPath(new URL('./src/content/blog', import.meta.url));

function getPublishedBlogSlugs() {
  return fs
    .readdirSync(blogContentDir)
    .filter((file) => /\.mdx?$/.test(file))
    .filter((file) => {
      const contents = fs.readFileSync(`${blogContentDir}/${file}`, 'utf-8');
      return /^isPublished:\s*true\s*$/m.test(contents);
    })
    .map((file) => file.replace(/\.mdx?$/, ''));
}

const blogPostPages = getPublishedBlogSlugs().map(
  (slug) => `https://francisroylilly.com/blog/${slug}/`
);

// https://astro.build/config
export default defineConfig({
  site: 'https://francisroylilly.com/',
  integrations: [mdx(), sitemap({ customPages: blogPostPages }), react()],
  output: 'server',
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
