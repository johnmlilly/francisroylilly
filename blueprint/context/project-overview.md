# Francis Roy Lilly - Project Overview

<!-- blueprint:source-hash 2d3664dbd284b6455bc50cd99478e504c4612df1fd62175afed52952fd542ee3 -->

> Personal site documenting Francis Roy Lilly's journey after a severe brain
> injury (HIE) at birth. Permanent, ad-free replacement for CaringBridge.
> Live at https://francisroylilly.com.

## Problem

Francis's family shared his story on CaringBridge but wanted a dedicated site
they control: the full narrative on one page, every past update migrated with
photos, and new updates posted the same way. The site is shipped and live. The
one CaringBridge behavior still missing is emailing followers when a new update
posts; that is the next roadmap item.

## Users

- **Readers** - family and friends following Francis's progress. Anonymous. They
  read posts, leave comments, tap "love", share links, and (planned) subscribe
  for email notifications.
- **Site owners** - John and Kara Lilly. Author posts through a git-based CMS
  (Pages CMS), never through the app. Run the (planned) notify script from a
  local shell.

Small, trusted audience. No accounts, no login, no admin UI.

## Usage model

- **Scale:** tens to low hundreds of readers; spikes when a post is shared.
- **Reachability:** internet-facing, unauthenticated. Only untrusted input is
  the comment form and the planned subscribe form; both carry anti-bot checks
  (honeypot, timing).
- **Tenancy:** single-tenant. No compliance requirements.
- **Non-requirements:** accounts/auth, admin UI, external newsletter platform,
  queues, cron.

## Features

Build-plan order. Items 1-13 are shipped (adopted from the existing codebase).
Items 14-20 are the roadmap.

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

### Roadmap

14. **Notify subscribers of new blog posts** (headline) - `Subscriber` table, single opt-in with token unsubscribe, subscribe form in `Footer` and on `/blog`, `npm run notify -- --slug=<slug>` CLI sending text-only email via Resend batch. Full design locked in `blueprint/plans/notify-subscribers.md`.
15. **Playwright E2E smoke tests** - comment submission, love button, `/blog` listing. Set up via `/tests browser`.
16. **Replace Lucide icons with astro-icon** - `src/components/Cards.astro`.
17. **Streamline SEO with astro-seo** - per-page title/description/OG props instead of duplicated meta tags.
18. **Loading animation for comments** - cue in `Comments.astro` during initial fetch and post-submit refresh; graceful failure fallback.
19. **Migrate Turso to Cloudflare D1** - `drizzle-orm/d1` binding; keep libsql `:memory:` for Vitest; `db/migrate.ts`/`db/seed.ts` become `wrangler d1` commands.
20. **Remove unused `react-image-gallery` and `prop-types` dependencies** - legacy template leftovers; no imports in `src/`.

## Data model

Turso (libSQL) via Drizzle. Schema lives in `db/schema.ts`; client and
re-exports in `db/client.ts`. Under Vitest the client uses in-memory SQLite.
Migrations under `./drizzle`, applied with `npm run db:migrate`.

### Comment

- `id` (integer, PK, autoincrement)
- `postSlug` (text, not null) - joins to a blog post by slug; no FK, posts are files
- `name` (text, not null)
- `email` (text, not null) - used for the 30s rate limit; never displayed
- `message` (text, not null)
- `createdAt` (text, not null) - ISO timestamp

### Reaction

- `id` (integer, PK, autoincrement)
- `postSlug` (text, not null) - one row per post
- `loves` (integer, not null, default 0) - running count

### Subscriber (planned, feature 14)

- `id` (integer, PK, autoincrement)
- `email` (text, not null, unique) - normalized lowercase/trimmed
- `unsubscribeToken` (text, not null, unique) - `crypto.randomUUID()`
- `isActive` (integer as boolean, not null, default true) - soft unsubscribe; re-subscribe flips it back and reuses the token
- `createdAt` (text, not null)

### Blog post (content collection, not DB)

Markdown/MDX files in `src/content/blog/`, images in `src/assets/blog/`.
Frontmatter schema (`src/content.config.ts`, mirrored in `.pages.yml`):

- `title` (string, required)
- `description` (string, required) - excerpt on timeline and in emails
- `pubDate` (date, required)
- `author` (string, required; CMS restricts to "John Lilly" / "Kara Lilly")
- `heroImage` (image, optional)
- `galleryPhotos` (image[], optional; CMS max 6)
- `isPublished` (boolean, default false) - drafts are hidden everywhere

> `postSlug` on `Comment`/`Reaction` is the file-derived slug. Renaming a post
> file orphans its comments and loves. Later features (14, 18) depend on the
> `Comment`, `Reaction`, and `Subscriber` shapes above; treat them as locked.

## Tech stack

- **Astro 7** - framework; `output: 'static'` with on-demand routes via adapter; `site` is `https://francisroylilly.com/`
- **TypeScript (strict)** - app code; `Timeline.jsx` is the untyped legacy exception
- **Tailwind CSS v4** - CSS-first config via `@tailwindcss/vite`; utilities `.pull-quote`, `.hero-quote` in `src/styles/global.css`
- **React 19** - islands only (timeline via `react-vertical-timeline-component` in `Timeline.jsx`, kept as-is)
- **Drizzle ORM + `@libsql/client`** - data access against Turso
- **Astro Actions** - form handling (`addComment`, `addLove`; planned `subscribe`) in `src/actions/index.ts`
- **lucide-react** - icons (planned swap to astro-icon, feature 16)
- **Vitest** - unit tests; GitHub Actions runs test + build on PRs
- **@astrojs/cloudflare** - Workers adapter; `imageService: 'compile'`, `session: false`
- **Pages CMS** - git-based authoring via `.pages.yml`
- **Resend** (planned, feature 14) - transactional email, batch send, free tier

## Monetization

None. Personal site. `/support` page exists for people who want to help the
family.

## UI/UX

Warm, calm, personal. Reads like a family journal, not a product. Story-first
homepage with the John 9:3 quote and pull quotes. Photo-heavy posts. Mobile
first; most readers arrive from shared links.

Routes:

- `/` - hero flip rotator, "Francis's Story", cards, React timeline of posts
- `/blog` - updates listing with search and date-range filter; planned subscribe CTA
- `/blog/[slug]` - post with hero, photo gallery, comments, love button, share button, per-post OG meta
- `/prayers` - prayers page
- `/support` - support page
- `/rss.xml` - RSS feed
- `/sitemap-index.xml` - sitemap (prerendered blog posts included)
- `/api/comments` - GET comments for a post
- `/api/reactions` - GET love count for a post
- `/api/unsubscribe?token=` (planned) - GET, HTML response, flips `isActive` false

Site-wide `Footer` will host the compact subscribe form (planned).

## Deployment

- **Host:** Cloudflare Workers, project `francisroylilly` (`wrangler.jsonc`; `nodejs_compat`; `compatibility_date` 2026-08-01; observability on)
- **Domain:** francisroylilly.com as Worker custom domain; DNS on Cloudflare
- **Deploys:** automatic via Cloudflare Workers Builds on push to `main`. `npm run deploy` is a manual escape hatch only.
- **Build:** `npm run build` (Astro). Dev server `npm run dev` on http://localhost:4321 (workerd via Cloudflare Vite plugin). `npm run preview` serves the built worker.
- **Secrets:** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` as Worker secrets. Locally read from `process.env`, falling back to `file:.data/local.db`. `RESEND_API_KEY` (planned) is local-shell only for the notify CLI; not a Worker secret unless the deployed app ever sends email.
- **DB ops:** `npm run db:migrate`, `npm run db:seed` (`tsx` scripts in `db/`). Planned: `db:generate`, `notify`.
- **CI:** `.github/workflows/test.yml` runs tests and build on PRs.
- **Future:** feature 19 may move Turso to Cloudflare D1.

## Open questions

- **Feature 15 note references `/tests browser`:** that is a setup skill, not a
  feature step. `/feature 15` should start by running `/tests browser` rather
  than implementing Playwright by hand.
