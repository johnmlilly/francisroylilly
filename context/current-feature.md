# Current Feature

<!-- Feature Name -->
## Loading animation for comments

## Status

Not Started

## Goals

- Show a visual cue in `src/components/Comments.astro` while comments fetch from Turso
- Cover the initial load and the refresh after a comment is submitted
- Fall back gracefully if the fetch fails

## Upcoming Features (Queue)

1. **Add E2E test coverage with Playwright** — follow-up to the Vitest work above; smoke tests for comment submission, love button, and `/blog` listing
2. **Finish CaringBridge post migration** (priority — content) — port remaining CaringBridge posts to `src/content/blog/`: write titles, assign authors, import images into `src/assets/blog/`; migrate existing CaringBridge comments and reactions into the Turso `Comment`/`Reaction` tables
3. **Fix social preview / OG meta for blog posts** — each update post uses the site-wide default OG image instead of a per-post one; add proper per-post social preview + metadata
4. **Migrate hosting from Netlify to Cloudflare** — domain now hosted on Cloudflare; swap `@astrojs/netlify` adapter for Cloudflare's, update integrations/config in `astro.config.mjs` accordingly
5. **Replace Lucide icons with Astro Icon** — swap the Lucide icon package for the native [astro-icon](https://github.com/natemoo-re/astro-icon#readme) integration (used in `src/components/Cards.astro`)
6. **Streamline SEO with astro-seo** — adopt [astro-seo](https://github.com/jonasmerlin/astro-seo#readme), passing per-page props for title/description/OG data across main pages instead of duplicated meta tags
7. **Add a git-based CMS** — likely [Pages CMS](https://pagescms.org/), for editing blog content without touching markdown directly
=======
## Add unit test coverage with Vitest

## Status

In Progress

## Goals

- Install and configure Vitest (`vitest.config.ts` via `getViteConfig()` per Astro's testing guide)
- Point `db/client.ts` at an in-memory SQLite database (`:memory:`) during test runs instead of the local file/Turso, so tests exercise real Drizzle queries against a throwaway DB
- Unit test `addComment` (`src/actions/index.ts`): honeypot rejection, <3s timing rejection, each spam-pattern match, 30s per-email rate limit, HTML sanitization
- Unit test `addLove` (`src/actions/index.ts`): first reaction creates a row, second increments it
- Unit test `src/pages/api/comments.ts` and `src/pages/api/reactions.ts`: missing `postSlug` → 400, valid slug → correct response shape
- Playwright (E2E) is a separate follow-up feature, not part of this pass

## Upcoming Features (Queue)

1. **Search & filter on the updates page** — add search/filter for blog post markdown files on `/blog`
2. **Add E2E test coverage with Playwright** — follow-up to the Vitest work above; smoke tests for comment submission, love button, and `/blog` listing
3. **Finish CaringBridge post migration** (priority — content) — port remaining CaringBridge posts to `src/content/blog/`: write titles, assign authors, import images into `src/assets/blog/`; migrate existing CaringBridge comments and reactions into the Turso `Comment`/`Reaction` tables
4. **Loading animation for comments** — visual cue while comments fetch from Turso in `src/components/Comments.astro`
5. **Fix social preview / OG meta for blog posts** — each update post uses the site-wide default OG image instead of a per-post one; add proper per-post social preview + metadata
6. **Migrate hosting from Netlify to Cloudflare** — domain now hosted on Cloudflare; swap `@astrojs/netlify` adapter for Cloudflare's, update integrations/config in `astro.config.mjs` accordingly
7. **Replace Lucide icons with Astro Icon** — swap the Lucide icon package for the native [astro-icon](https://github.com/natemoo-re/astro-icon#readme) integration (used in `src/components/Cards.astro`)
8. **Streamline SEO with astro-seo** — adopt [astro-seo](https://github.com/jonasmerlin/astro-seo#readme), passing per-page props for title/description/OG data across main pages instead of duplicated meta tags
9. **Add a git-based CMS** — likely [Pages CMS](https://pagescms.org/), for editing blog content without touching markdown directly

---

## Hero Restyle

## Status

Completed

## Goals

- Keep "Hi there! I'm Francis" text
- Remove frosted glass / backdrop-blur box
- Replace with cleaner treatment: semi-transparent white pill OR text-shadow only
- Add subtle gradient overlay at bottom of hero image for depth (`transparent → rgba(0,0,0,0.3)`)
- File: `src/pages/index.astro`

## Notes

Current hero overlay uses `backdrop-filter: blur(6px)` + `rgba(255,255,255,0.5)` background. Feels generic. Goal is something warmer and cleaner that lets the photo breathe.

### Archived — Features Already Implemented

2. Hero restyle — remove frosted glass blur, keep "Hi there! I'm Francis", cleaner overlay treatment
3. About section — narrow prose to 720px, style "But God had other plans." as pull quote
4. Cards redesign + re-enable — uncomment `<Cards />`, gold buttons, better image treatment, "Walk With Us" heading
5. Footer redesign — purpose tagline, nav links, copyright
6. Pull quote utility — add `.pull-quote` to `global.css`
7. Hero entrance animation — keyframe fade-in on the hero section, prose, and card sections for better first-load UX


## History

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
