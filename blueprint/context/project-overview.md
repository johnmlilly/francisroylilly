# Francis Roy Lilly - Project Overview

<!-- blueprint:source-hash 9ab13aab74bff66a9ba32c3113adf8f93262bdf2c9ba0abf14c5f9a8216dbd32 -->

> Personal site documenting Francis Roy Lilly's journey after a severe brain
> injury (HIE) at birth. Permanent, ad-free replacement for CaringBridge.
> Live at https://francisroylilly.com.

## Problem

Francis's family shared his story on CaringBridge but wanted a dedicated site
they control: the full narrative on one page, every past update migrated with
photos, and new updates posted the same way. The site is shipped and live,
including email notifications to subscribers when a new update posts.

## Users

- **Readers** - family and friends following Francis's progress. Anonymous. They
  read posts, leave comments, tap "love", share links, subscribe
  for email notifications with double opt-in, and (planned) add a pin to the
  prayer map.
- **Site owners** - John and Kara Lilly. Author posts through a git-based CMS
  (Pages CMS), never through the app. Publishing a post triggers subscriber
  notification automatically.

Small, trusted audience. No accounts, no login, no admin UI.

## Usage model

- **Scale:** tens to low hundreds of readers; spikes when a post is shared.
- **Reachability:** internet-facing, unauthenticated. Untrusted input is the
  comment and subscribe forms and the planned prayer-map form; all carry
  honeypot + timing checks. `/api/notify` is protected by a shared secret header.
- **Tenancy:** single-tenant. No compliance requirements.
- **Non-requirements:** accounts/auth, admin UI, external newsletter platform,
  queues, cron, retry infrastructure (failed sends rerun manually).

## Features

Build-plan order. Items 1-14 are shipped (1-13 adopted from the existing
codebase). The roadmap is listed in priority order; IDs are stable, so item 21
is built second.

### Shipped

1. **Site scaffold and base layout** - Astro 7, Tailwind v4, `BaseLayout`/`BaseHead`, `Header` (desktop nav + mobile hamburger), `Footer`.
2. **Homepage** - hero photo flip rotator, full "Francis's Story" narrative, `Cards`, React timeline island of posts.
3. **Blog content collection** - `src/content/blog/` md/mdx with `heroImage` + `galleryPhotos` schema; photo grid in `BlogPost.astro`.
4. **Updates listing** - `/blog`, reverse-chronological, client-side search and date-range filter.
5. **Comments** - Astro Action `addComment` with honeypot, timing check, spam filter, 30s per-email rate limit; `/api/comments` read route.
6. **Love reactions** - Astro Action `addLove`; `/api/reactions` read route.
7. **Prayers and Support pages, RSS feed, sitemap.**
8. **Drizzle ORM on Turso** - replaced Astro DB.
9. **Cloudflare Workers hosting** - replaced Netlify; Workers Builds deploys on push to `main`.
10. **Vitest unit tests + GitHub Actions** - 17 tests over actions and API routes; `.github/workflows/test.yml` runs test + build on PRs.
11. **CaringBridge migration** - 37 posts, photos re-encoded to AVIF, 237 historical comments and reactions imported into the DB.
12. **Git-based CMS** - Pages CMS via `.pages.yml`; `isPublished` gating everywhere.
13. **Per-post social preview meta** - OG/social tags per post; prerendered blog posts included in sitemap.
14. **Notify subscribers of new blog posts** - `Subscriber` + `PostNotification` tables in a new Cloudflare D1 database; double opt-in with token confirm/unsubscribe (POST-only mutations); subscribe form on `/subscribe` (linked from footer and `/blog`) plus a site-wide native `<dialog>` popup; `/api/notify` triggered by a GitHub Actions workflow on push to `main`; HTML email via Resend. Design: `blueprint/plans/notify-subscribers.md`.

### Roadmap

15. **Migrate Turso to Cloudflare D1** - `drizzle-orm/d1` binding; `Comment`/`Reaction` fold into the D1 database created by feature 14; keep libsql `:memory:` for Vitest; `db/migrate.ts`/`db/seed.ts` become `wrangler d1` commands.
21. **Prayer map on `/prayers`** - readers add a city-level pin with name and optional message; Leaflet island, Photon autocomplete, clustered pins plus a "X people praying from Y countries" counter; stored in D1 `PrayerPin`. Depends on 15.
16. **Playwright E2E smoke tests** - comment submission, love button, `/blog` listing. Set up via `/tests browser`.
17. **Replace Lucide icons with astro-icon** - `src/components/Cards.astro`.
18. **Streamline SEO with astro-seo** - per-page title/description/OG props instead of duplicated meta tags.
19. **Loading animation for comments** - cue in `Comments.astro` during initial fetch and post-submit refresh; graceful failure fallback.
20. **Remove unused `react-image-gallery` and `prop-types` dependencies** - legacy template leftovers; no imports in `src/`.

## Data model

Two databases until feature 15 merges them.

**Turso (libSQL)** via Drizzle. Schema `db/schema.ts`, client `db/client.ts`.
Under Vitest the client uses in-memory SQLite. Migrations under `./drizzle`,
applied with `npm run db:migrate`.

**Cloudflare D1** (feature 14) via `drizzle-orm/d1`. Schema
`db/d1-schema.ts`, client `db/d1-client.ts` reading `env.SUBSCRIBERS_DB` from
`cloudflare:workers`. Migrations generated with `npm run db:d1:generate` under
`./drizzle/d1`, applied manually with `wrangler d1 execute --remote --file=`.
Vitest aliases `cloudflare:workers` to `src/test/cloudflare-workers-stub.ts`;
tests that reach D1 must `vi.mock` the client.

### Comment (Turso)

- `id` (integer, PK, autoincrement)
- `postSlug` (text, not null) - joins to a blog post by slug; no FK, posts are files
- `name` (text, not null)
- `email` (text, not null) - used for the 30s rate limit; never displayed
- `message` (text, not null)
- `createdAt` (text, not null) - ISO timestamp

### Reaction (Turso)

- `id` (integer, PK, autoincrement)
- `postSlug` (text, not null) - one row per post
- `loves` (integer, not null, default 0) - running count

### Subscriber (D1)

- `id` (integer, PK, autoincrement)
- `email` (text, not null, unique) - normalized lowercase/trimmed
- `firstName`, `lastName` (text, not null) - HTML tags stripped on input
- `token` (text, not null, unique) - `crypto.randomUUID()`; used for confirm link, then unsubscribe link
- `createdAt` (integer timestamp, not null)
- `confirmedAt` (integer timestamp, nullable) - null until double opt-in completes
- `unsubscribedAt` (integer timestamp, nullable)

Active subscriber = `confirmedAt IS NOT NULL AND unsubscribedAt IS NULL`.
Re-subscribing after unsubscribe issues a new token and repeats double opt-in.

### PostNotification (D1)

- `postSlug` (text, PK) - matches the post id used by `rss.xml.js` and `/blog`
- `notifiedAt` (integer timestamp, not null)

Presence of a row means subscribers were notified (or backfilled via `skipSend`).

### PrayerPin (D1, planned, feature 21)

- `id` (integer, PK, autoincrement)
- `name` (text, not null) - displayed; rendered as text, never HTML
- `message` (text, nullable) - max 140 chars; displayed as text
- `city` (text, not null) - label from the chosen autocomplete result
- `country` (text, not null) - feeds the country counter
- `lat`, `lng` (real, not null) - rounded to city level (~1km) before storing
- `email` (text, nullable) - never displayed; optional subscribe offer
- `createdAt` (integer timestamp, not null)

No user edit or delete. Admin removes rows directly in D1.

### Blog post (content collection, not DB)

Markdown/MDX files in `src/content/blog/`, images in `src/assets/blog/`.
Frontmatter schema (`src/content.config.ts`, mirrored in `.pages.yml`):

- `title` (string, required)
- `description` (string, required) - excerpt on timeline and in emails
- `pubDate` (date, required) - notify ignores posts dated in the future
- `author` (string, required; CMS restricts to "John Lilly" / "Kara Lilly")
- `heroImage` (image, optional)
- `galleryPhotos` (image[], optional; CMS max 6)
- `isPublished` (boolean, default false) - drafts hidden everywhere, never notified

> `postSlug` on `Comment`/`Reaction`/`PostNotification` is the file-derived
> slug. Renaming a post file orphans its comments, loves, and notification
> record. Later features (15, 21) depend on these shapes; treat them as locked.

## Tech stack

- **Astro 7** - framework; `output: 'static'` with on-demand routes via adapter; `site` comes from `SITE_URL` in `src/consts.ts`
- **TypeScript (strict)** - app code; `Timeline.jsx` is the untyped legacy exception
- **Tailwind CSS v4** - CSS-first config via `@tailwindcss/vite`; utilities `.pull-quote`, `.hero-quote` in `src/styles/global.css`
- **React 19** - islands only (timeline via `react-vertical-timeline-component`)
- **Drizzle ORM** - `@libsql/client` against Turso; `drizzle-orm/d1` against D1
- **Astro Actions** - form handling (`addComment`, `addLove`, `subscribeToUpdates`) in `src/actions/index.ts`
- **Resend** - transactional email; plain inline-styled HTML templates in `emails/` with `escapeHtml`
- **lucide-react** - icons (planned swap to astro-icon, feature 17)
- **Leaflet** (planned, feature 21) - client-only map island with `leaflet.markercluster` and `leaflet-gesture-handling`; Carto light raster tiles (attribution shown); Photon for city autocomplete
- **Vitest** - unit tests; GitHub Actions runs test + build on PRs
- **@astrojs/cloudflare** - Workers adapter; `imageService: 'compile'`, `session: false`
- **Pages CMS** - git-based authoring via `.pages.yml`

## Monetization

None. Personal site. `/support` page exists for people who want to help the
family.

## UI/UX

Warm, calm, personal. Reads like a family journal, not a product. Story-first
homepage with the John 9:3 quote and pull quotes. Photo-heavy posts. Mobile
first; most readers arrive from shared links. Emails reuse brand tokens
(`#B8A86F` gold CTA, `#4C6085` headings) with a system font stack.

Routes:

- `/` - hero flip rotator, "Francis's Story", cards, React timeline of posts
- `/blog` - updates listing with search and date-range filter; link banner to `/subscribe`
- `/blog/[slug]` - post with hero, photo gallery, comments, love button, share button, per-post OG meta
- `/prayers` - static page; planned prayer map section (feature 21)
- `/support` - static page
- `/subscribe` - subscribe form page, linked from footer nav
- `/rss.xml`, `/sitemap-index.xml` - feed and sitemap
- `/api/comments`, `/api/reactions` - GET, on-demand
- `/api/confirm?token=` - GET renders confirm page; POST sets `confirmedAt`, redirects to `/subscribed`
- `/api/unsubscribe?token=` - GET renders confirm page; POST sets `unsubscribedAt`, redirects to `/unsubscribed`
- `/api/notify` - POST only, `x-notify-secret` header; `?skipSend=true` backfills
- `/subscribed`, `/unsubscribed` - static confirmation pages

Site-wide subscribe modal opens ~5s after load, dismissal persisted in
`localStorage` (`frl-subscribe-modal-dismissed`).

## Deployment

- **Host:** Cloudflare Workers, project `francisroylilly` (`wrangler.jsonc`; `nodejs_compat`; `compatibility_date` 2026-08-01; observability on)
- **Domain:** francisroylilly.com as Worker custom domain; DNS on Cloudflare
- **Deploys:** automatic via Cloudflare Workers Builds on push to `main`. `npm run deploy` is a manual escape hatch only.
- **Build:** `npm run build`. Dev server `npm run dev` on http://localhost:4321 (workerd via Cloudflare Vite plugin). `npm run preview` serves the built worker.
- **Secrets (Worker):** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`; `RESEND_API_KEY`, `NOTIFY_SECRET`. Locally via `.dev.vars` (gitignored) or `process.env`, Turso falling back to `file:.data/local.db`.
- **Bindings:** `d1_databases` entry `SUBSCRIBERS_DB` in `wrangler.jsonc`; `npm run cf-typegen` generates `worker-configuration.d.ts`.
- **DB ops:** `npm run db:migrate`, `npm run db:seed` (Turso, `tsx`). `npm run db:d1:generate` then `wrangler d1 execute francisroylilly --remote --file=` (D1).
- **CI:** `.github/workflows/test.yml` runs tests and build on PRs. `notify-subscribers.yml`: on push to `main` touching `src/content/blog/**`, one `curl` POST to `/api/notify` with `NOTIFY_SECRET` (also a GitHub repo secret). Merge it last, after backfill.
- **Resend:** sending domain `updates@mail.francisroylilly.com` must be verified (SPF/DKIM TXT records on Cloudflare DNS).

## Open questions

- **Feature 16 note references `/tests browser`:** that is a setup skill, not a
  feature step. `/feature 16` should start by running `/tests browser` rather
  than implementing Playwright by hand.
- **Feature 21 geocoding/tiles:** Photon and Carto are free public services
  with usage policies; confirm acceptable at this traffic during `/feature 21`.
