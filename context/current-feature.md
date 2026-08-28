# Current Feature

## Finish CaringBridge post migration

## Status

In Progress

## Goals

- Port the remaining CaringBridge posts into `src/content/blog/` as `.md`/`.mdx`
- Write a title and description for each, assign the author, set `pubDate`
- Import each post's images into `src/assets/blog/` and wire up `heroImage` /
  `galleryPhotos`
- Migrate existing CaringBridge comments and reactions into the Turso
  `Comment` / `Reaction` tables, keyed by the new `postSlug`

## Notes

- Content work, not a code change - the frontmatter schema in
  `src/content.config.ts` already covers everything these posts need.
- `BlogPost` auto-renders a 1/2/3-column grid from `galleryPhotos.length`.
- Comment rows need `postSlug` to match the new filename-derived slug exactly,
  or the comments will not show up on the post.

## Upcoming Features (Queue)

1. **Add E2E test coverage with Playwright** — follow-up to the Vitest unit tests; smoke tests for comment submission, love button, and `/blog` listing
2. **Fix social preview / OG meta for blog posts** — each update post uses the site-wide default OG image instead of a per-post one; add proper per-post social preview + metadata
3. **Replace Lucide icons with Astro Icon** — swap the Lucide icon package for the native [astro-icon](https://github.com/natemoo-re/astro-icon#readme) integration (used in `src/components/Cards.astro`)
4. **Streamline SEO with astro-seo** — adopt [astro-seo](https://github.com/jonasmerlin/astro-seo#readme), passing per-page props for title/description/OG data across main pages instead of duplicated meta tags
5. **Add a git-based CMS** — likely [Pages CMS](https://pagescms.org/), for editing blog content without touching markdown directly
6. **Loading animation for comments** — visual cue in `src/components/Comments.astro` while comments fetch from Turso; covers initial load and the refresh after submit, with a graceful fallback if the fetch fails
7. **Prerender blog posts for image optimization** — `src/pages/blog/[...slug].astro` is SSR, so `<Image>` emits `/_image?...` URLs that the Workers runtime cannot serve under `imageService: 'compile'`; full-size originals ship instead. Needs `prerender = true` plus `getStaticPaths()`


## Chores

- **Remove the Netlify form attributes from `src/pages/prayers.astro`** -
  `data-netlify`, `netlify-honeypot`, and the `form-name` hidden input are all
  dead now that the site runs on Workers. Note that stripping them alone leaves
  a form that submits nowhere; the prayer request form needs an Astro Action
  (like `addComment` in `src/actions/index.ts`) or the form should come out
  entirely. Also fixes the truncated sentence on line 25: "We prayed to many
  different saints, some of whom w".

## Archived — Features Already Implemented

<!-- Keep this updated. Earliest to latest -->
- **Desktop Navigation** — Added inline nav links on desktop (≥768px); hamburger retained for mobile. `src/components/Header.astro`
- **Hero Restyle** — Replaced full-bleed background image with side-by-side layout (text left, photo right); warm gradient background; stacks on mobile. `src/pages/index.astro`
- **Cards Redesign** — Replaced images with Lucide icons, added "Walk With Us" heading, gold CTA buttons, re-enabled on homepage. `src/components/Cards.astro`
- **Footer Redesign** — Added site name, tagline, nav links, copyright. Slate blue background. `src/components/Footer.astro`
- **About Section** — Added dedicated About section between hero and timeline, prose narrowed to 720px, "But God had other plans." styled as bold pull quote, hero slimmed to greeting + CTA. PR #3. `src/pages/index.astro`
- **Pull Quote Utility** — Added `.pull-quote` utility class to `global.css` for reuse across pages. PR #6. `src/styles/global.css`
- **Drizzle ORM Migration** — Replaced `@astrojs/db` with Drizzle ORM + `@libsql/client` against the same Turso database (astro:db is removed in Astro v7). PR #7. `db/`, `src/actions/index.ts`, `src/pages/api/{comments,reactions}.ts`
- **Astro 7 Upgrade** — Bumped `astro` to 7.1.3 plus `@astrojs/netlify`/`react`/`mdx`/`sitemap`/`@tailwindcss/vite` to Astro-7-compatible majors. Fixed a gallery image bug surfaced by stricter `<Image>` validation: `BlogPost.astro` was passing `photo.src` (raw string) instead of the resolved `ImageMetadata` object. `astro.config.mjs`, `package.json`, `src/layouts/BlogPost.astro`
- **Unit Tests with Vitest** — Configured Vitest via `getViteConfig()`; `db/client.ts` uses an in-memory SQLite DB under test so runs never touch Turso or the local file. 17 tests covering `addComment` (honeypot, timing check, spam patterns, 30s email rate limit, HTML sanitization), `addLove` (create + increment), and the `comments`/`reactions` API routes (400 on missing `postSlug`, response shape on valid slug). Added a GitHub Actions workflow running Vitest + build on PRs. `vitest.config.ts`, `src/test/`, `src/actions/index.test.ts`, `src/pages/api/{comments,reactions}.test.ts`, `.github/workflows/test.yml`
- **Search & Filter on Updates Page** — Added client-side search and a date-range filter to `/blog`. All controls sit inside one pill-shaped search bar: inline search icon, borderless input, icon-only date toggle, and an icon-only clear button that appears only when a filter is active. The date range is a compact popover that closes on outside click or Escape; a "no updates match" message shows when nothing matches. `src/pages/blog/index.astro`
- **Cloudflare Workers Migration** — Replaced `@astrojs/netlify` with `@astrojs/cloudflare` (`imageService: 'compile'`, `session: false`), added a root `wrangler.jsonc` with `nodejs_compat`, and made `db/client.ts` build the libsql client lazily since Workers only populates `process.env` inside a request. The adapter is skipped when `VITEST` is set, because the Cloudflare Vite plugin cannot load in Vitest's Node environment. DNS cut over from the stale Netlify A/AAAA records to a Worker custom domain; `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are now Worker secrets and deploys run through Workers Builds. PR #14. `astro.config.mjs`, `wrangler.jsonc`, `db/client.ts`, `package.json`
