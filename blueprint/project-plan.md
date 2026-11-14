# Project Plan

Personal site for Francis Roy Lilly, documenting his journey and sharing updates
with family and friends. Replaces CaringBridge as the permanent home for the story.
Live at https://francisroylilly.com.

## 1. Problem - What problem are we solving?

Francis survived a severe brain injury (HIE) at birth. His family shared the
journey on CaringBridge, but wanted a dedicated, permanent, ad-free site they
control: the full story on one page, every past update migrated, photos kept,
and ongoing updates posted the same way. CaringBridge's one missing behavior on
the new site is emailing followers when a new update posts (see build plan).

## 2. Users - Who is this for?

- Family and friends following Francis's progress (readers, commenters, "love"
  reactors, future email subscribers)
- John and Kara Lilly (site owners; author posts via a git-based CMS;
  publishing triggers subscriber notification automatically)

Small, trusted audience. No accounts, no login.

## 3. Features - What does the MVP need?

Shipped:

- Homepage: hero photo flip rotator, full "Francis's Story" narrative, cards,
  React timeline of posts
- Updates blog (`/blog`): reverse-chronological list with client-side search and
  date-range filter; individual posts with photo gallery, comments, love button,
  share button
- Prayers page, Support page, RSS feed, sitemap, per-post OG/social preview meta
- Comments (spam-guarded: honeypot, timing check, spam filter, 30s email rate limit)
- Love reactions per post
- Git-based CMS (Pages CMS via `.pages.yml`) with `isPublished` gating
- Full CaringBridge content migration (37 posts, photos re-encoded to AVIF,
  historical comments/reactions imported into the DB)

Planned: see `blueprint/build-plan.md`. Notable: a prayer map on `/prayers`
where readers add a city-level pin with their name and an optional short message.

## 4. Data - What are we storing?

One Cloudflare D1 database via Drizzle (binding `SUBSCRIBERS_DB`), schema in
`db/schema.ts`, client `db/client.ts`. `Comment`/`Reaction` moved here from
Turso (build plan feature 15):

- `Comment` - id, postSlug, name, email, message, createdAt
- `Reaction` - id, postSlug, loves (count)
- `Subscriber` - id, email (unique), firstName, lastName, token (unique),
  createdAt, confirmedAt (nullable), unsubscribedAt (nullable); all timestamps
  `integer({ mode: 'timestamp' })`
- `PostNotification` - postSlug (PK), notifiedAt
- `PrayerPin` (planned) - name, optional message (max 140), city label,
  country, lat/lng rounded to city level, optional email, createdAt. Public
  except email. No user edit or delete; admin removes rows directly.

Blog posts are Markdown/MDX files in `src/content/blog/`, images in
`src/assets/blog/`. No user accounts.

## 5. Tech - What stack are we using?

| Category   | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Framework  | Astro 7, `output: 'static'` with on-demand routes via adapter |
| Language   | TypeScript (strict)                                        |
| UI         | Tailwind CSS v4 (CSS-first config) + React 19 islands      |
| Database   | Drizzle ORM against Cloudflare D1 via `drizzle-orm/d1`; in-memory libSQL under Vitest |
| Email      | Resend (planned), plain inline-styled HTML templates in `emails/` |
| Icons      | lucide-react (planned swap to astro-icon)                  |
| Maps       | Leaflet + leaflet.markercluster + leaflet-gesture-handling (planned); Carto raster tiles; Photon geocoding autocomplete |
| Testing    | Vitest (unit); GitHub Actions runs test + build on PRs     |
| Hosting    | Cloudflare Workers via `@astrojs/cloudflare`; DNS on Cloudflare |

Legacy template deps: keep `react-vertical-timeline-component` and the untyped
`src/components/Timeline.jsx` as-is. `react-image-gallery` and `prop-types` are
unused and will be removed (build plan).

## 6. Monetize - How will this make money?

It doesn't. Personal site. `/support` page exists for people who want to help
the family.

## 7. UI/UX - How should this look and feel?

Warm, calm, personal. Reads like a family journal, not a product. Story-first
homepage with the John 9:3 quote and pull quotes. Photo-heavy posts. Mobile
first (most readers arrive from shared links). Existing utilities: `.pull-quote`,
`.hero-quote` in `src/styles/global.css`.

## 8. Deployment - Where and how will this ship?

- Host: Cloudflare Workers, project `francisroylilly` (`wrangler.jsonc`,
  `nodejs_compat`, `compatibility_date` 2026-08-01)
- Deploys: automatic via Cloudflare Workers Builds on push to `main`;
  `npm run deploy` is the manual escape hatch
- Build: `npm run build` (Astro, `imageService: 'compile'`, `session: false`)
- Env / secrets: `RESEND_API_KEY`, `NOTIFY_SECRET`, `REPORT_SECRET`,
  `REPORT_EMAIL` (Worker secrets), D1 binding `SUBSCRIBERS_DB` in
  `wrangler.jsonc`, `NOTIFY_SECRET` also as a GitHub Actions repo secret
- Planned `.github/workflows/notify-subscribers.yml`: on push to `main`
  touching `src/content/blog/**`, POST `/api/notify` with the shared secret
- Custom domain: francisroylilly.com (Worker custom domain)

## 9. Usage model and constraints (optional)

- Scale: tens to low hundreds of readers; spikes when a post is shared
- Internet-facing, unauthenticated, trusted audience; only untrusted input is
  the comment and (planned) subscribe forms, which already carry anti-bot checks
- Single-tenant, no compliance requirements
- Non-requirements: accounts/auth, admin UI, external newsletter platform,
  queues/cron, retry infrastructure (failed sends rerun manually)
- Site owner writes content via git (Pages CMS), never through the app
