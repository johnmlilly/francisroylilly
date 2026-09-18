# Notify Subscribers of New Blog Posts (Resend + Cloudflare D1)

Build-plan item 14. Supersedes the earlier Turso / single-opt-in / CLI design.

## Context

Replicate CaringBridge's "email followers when a new update posts" behavior.
Sent via **Resend**, subscriber data in a **Cloudflare D1 database** owned by the
site (not Resend Audiences, not Buttondown/Listmonk). Full control of the list
and unsubscribe logic, no recurring third-party fee, no vendor lock-in, at the
cost of a small amount of plumbing: schema, signup form, confirm/unsubscribe
routes, send trigger.

The site already runs on Cloudflare Workers, so D1 is a native binding. No
external client or REST workaround.

**Decisions locked:**

- **Double opt-in (DOI).** Signup queues a confirmation email; only a real click
  activates the subscriber. Honeypot + timing stop scripted bots; DOI stops
  someone entering a stranger's address and is best practice for bulk mail.
- **No mutation on GET** for confirm and unsubscribe links. Email-security
  scanners prefetch every link; a GET that mutated would fire before the
  recipient opened the message. GET renders a page with a `<form method="POST">`.
- **Automatic trigger.** A GitHub Actions workflow on push to `main` touching
  `src/content/blog/**` POSTs to `/api/notify` with a shared secret. The Worker
  decides which published posts are new via a `PostNotification` table.
- **Email content text-only** with brand colors, no hero image (Astro's
  build-time image hashing isn't resolvable from this path).
- **Plain HTML string templates**, not `@react-email/*`. Two templates don't
  justify JSX rendering risk inside a Worker.
- **Site-wide subscribe popup** (native `<dialog>` reusing `SubscribeForm.astro`)
  opening ~5s after load, dismissal or success persisted in `localStorage` so it
  never reappears.

## Data model (D1, `db/d1-schema.ts`)

Separate schema and client from `db/schema.ts` / `db/client.ts` (Turso). When
build-plan item 19 (Turso to D1) happens, `Comment`/`Reaction` fold into this
same D1 database and `db/client.ts` goes away.

```ts
Subscriber {
  id: integer PK autoincrement
  email: text not null unique
  firstName: text not null
  lastName: text not null
  token: text not null unique        // randomUUID at signup; confirm link, then unsubscribe link
  createdAt: integer timestamp not null
  confirmedAt: integer timestamp nullable    // active = confirmedAt set AND unsubscribedAt null
  unsubscribedAt: integer timestamp nullable
}

PostNotification {
  postSlug: text PK                  // matches post.id used by rss.xml.js / blog/index.astro
  notifiedAt: integer timestamp not null
}
```

All timestamps use `integer({ mode: 'timestamp' })` (real `Date` on read/write).

## Cloudflare infra (manual, one-time)

1. `wrangler d1 create francisroylilly`. Account currently has zero D1 databases.
2. Add binding to `wrangler.jsonc`:
   ```jsonc
   "d1_databases": [
     { "binding": "SUBSCRIBERS_DB", "database_name": "francisroylilly", "database_id": "<from step 1>" }
   ]
   ```
3. `npm run cf-typegen` to generate `worker-configuration.d.ts` (types `env.SUBSCRIBERS_DB`).
4. `wrangler secret put RESEND_API_KEY` and `wrangler secret put NOTIFY_SECRET`.
5. Verify sending domain in Resend (`updates@mail.francisroylilly.com`).
6. Add `NOTIFY_SECRET` as a GitHub Actions repo secret.
7. Local dev: add `RESEND_API_KEY` to `.dev.vars`.

## D1 client (`db/d1-client.ts`)

Mirrors `db/client.ts`'s lazy Proxy shape but reads `env.SUBSCRIBERS_DB` from
`cloudflare:workers`. Vitest aliases `cloudflare:workers` to
`src/test/cloudflare-workers-stub.ts`; tests that reach D1 must `vi.mock` the
client module.

## Migrations

D1 has no Node driver. `npm run db:d1:generate` (drizzle-kit, schema diff only)
writes SQL under `drizzle/d1/`; apply with
`wrangler d1 execute francisroylilly --remote --file=drizzle/d1/<file>.sql`.

## Subscribe flow (`subscribeToUpdates` action)

Input: `email`, `firstName`, `lastName`, honeypot `website`, `timestamp`.
Honeypot + 3s timing check copied from `addCommentHandler`. Strip tags from
names, lowercase/trim email. Lookup by email:

- **No row** → insert (`token = randomUUID`, `confirmedAt = null`), send confirm email.
- **Unconfirmed row** → resend confirm email with same token.
- **Active row** → no email.
- **Unsubscribed row** → new token, clear `confirmedAt`/`unsubscribedAt`, send confirm email (DOI again).

Every branch returns the same generic "check your email" message.

`src/components/SubscribeForm.astro` (modeled on `CommentsForm.astro`) on a
dedicated `src/pages/subscribe.astro` page linked from the `Footer.astro` nav,
with a link banner on `src/pages/blog/index.astro`.

## Confirm flow (`src/pages/api/confirm.ts`, `prerender = false`)

- `GET ?token=` → lookup; if found and unconfirmed, render page with POST form.
- `POST` → set `confirmedAt = now`, redirect to `src/pages/subscribed.astro`.
  Invalid/used token shows an error state.

## Unsubscribe flow (`src/pages/api/unsubscribe.ts`, `prerender = false`)

- `GET ?token=` → lookup, render confirmation page (Header/Footer) with POST form.
- `POST` → set `unsubscribedAt = now`, redirect to `src/pages/unsubscribed.astro`.

## Notification trigger (`src/pages/api/notify.ts`, POST only)

1. Auth: `x-notify-secret` header vs `NOTIFY_SECRET`; 401 on mismatch.
2. `getCollection('blog', isPublished)`, sorted `pubDate` asc, filtered
   `pubDate <= now`. Drafts never enter the list, so editing a draft sends nothing.
3. Diff against `PostNotification` slugs → new posts (normally 0 or 1).
4. Per new post: active subscribers (`confirmedAt IS NOT NULL AND unsubscribedAt IS NULL`),
   build per-recipient HTML with their unsubscribe link, send via Resend, insert
   `PostNotification` row. `?skipSend=true` (still authed) writes rows only. Used for backfill.
5. Return JSON summary. No retry queue; rerun via `workflow_dispatch`.

`.github/workflows/notify-subscribers.yml`: `on: push` to `main` with
`paths: ['src/content/blog/**']` plus `workflow_dispatch`, one `concurrency`
group so overlapping pushes never double-send. Workers Builds deploys minutes
after the push and `/api/notify` reads posts from the deployed bundle, so the
first step polls `GET /api/version` (build commit from `WORKERS_CI_COMMIT_SHA`)
until it equals `github.sha`, up to 10 minutes, then a `curl -sf -X POST` with
the secret header. No checkout, no Node. Sends go through `resend.batch.send`
in chunks of 100 from `EMAIL_FROM` (`updates@mail.francisroylilly.com`).

## Email templates (`emails/`)

- `layout.ts`: `renderEmail({ previewText, bodyHtml, footerHtml })`, `button()`,
  `escapeHtml()`. Inline styles, brand tokens (`#B8A86F` gold CTA, `#4C6085`
  headings), system font stack.
- `confirmSubscription.ts`: `{ firstName, confirmUrl }`.
- `newPostNotification.ts`: `{ firstName, title, description, postUrl, unsubscribeUrl }`.

All interpolated user/frontmatter values pass through `escapeHtml`.

## Site-wide subscribe popup

`SubscribeDialog.astro`: native `<dialog>` wrapping `SubscribeForm.astro`, opens
~5s after load, closes on backdrop/Esc/×, persists dismissal or success in
`localStorage` (`frl-subscribe-modal-dismissed`). Mounted in `BaseLayout.astro`
and `blog/index.astro`. No extra dependency, one form implementation.

## Backfill (before merge)

Run `db/d1-backfill-post-notifications.sql` against the remote DB with
`wrangler d1 execute francisroylilly --remote --file=` so every post published
before the feature shipped is already marked notified. Because this happens
before merge, the workflow file can ship with the feature. Reuse
`/api/notify?skipSend=true` for any later bulk import.

## Testing (Vitest)

- `subscribeToUpdatesHandler`: honeypot, timing, all four DOI branches. `vi.mock('db/d1-client.js')`.
- Confirm and unsubscribe GET/POST handlers, incl. invalid and already-used token.
- Notify "which posts are new" comparison extracted as a pure function; case proving a draft never appears.
- Manual only: real D1 writes, real Resend delivery, one end-to-end Actions run.

## Sequencing

1. Infra (D1 create, binding, typegen, secrets, Resend domain, GH secret).
2. Schema, `drizzle.d1.config.ts`, generate + apply migration.
3. `db/d1-client.ts`.
4. Backfill via `skipSend=true`.
5. `emails/layout.ts`, `emails/confirmSubscription.ts`.
6. `subscribeToUpdates` action + `SubscribeForm.astro` in Footer and `/blog`.
7. `api/confirm.ts` + `subscribed.astro`.
8. `api/unsubscribe.ts` + `unsubscribed.astro`.
9. `emails/newPostNotification.ts`, `api/notify.ts`.
10. Workflow file (last).
11. `SubscribeFormReact.jsx` + `SubscribeModal.jsx`.
12. Vitest coverage.

## Built so far (branch `feature/notify-subscribers-resend-d1`)

Done: steps 2 (schema, config, SQL generated, not applied), 3, 5,
`emails/newPostNotification.ts`, the `subscribeToUpdates` action, `SITE_URL` in
`src/consts.ts` shared with `astro.config.mjs`, Vitest alias for
`cloudflare:workers`, `escapeHtml` in templates, `resend` dep,
`db:d1:generate` and `cf-typegen` scripts.

Not done: step 1 infra (no D1 database, no binding, no typegen, no secrets),
migration not applied, backfill, `SubscribeForm.astro`, confirm/unsubscribe
routes and pages, `api/notify.ts`, workflow, modal, subscribe tests.
