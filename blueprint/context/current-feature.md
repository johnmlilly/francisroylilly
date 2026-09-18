# Feature: Notify subscribers of new blog posts

**From build-plan:** feature 14
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/notify-subscribers-resend-d1`

## Goal

Replicate CaringBridge's "email followers when a new update posts". Readers
subscribe with name + email, confirm via a link (double opt-in), and get one
HTML email per newly published post with a one-click-to-page unsubscribe link.
Subscriber data lives in a new Cloudflare D1 database; sends go through Resend;
the trigger is a GitHub Actions workflow on push to `main`. Full design:
`blueprint/plans/notify-subscribers.md`.

## In scope

- D1 database `francisroylilly`, binding `SUBSCRIBERS_DB`, migration applied,
  Worker secrets `RESEND_API_KEY` + `NOTIFY_SECRET`, Resend domain verified.
- `subscribeToUpdates` action (exists) with unit tests covering all DOI branches.
- `SubscribeForm.astro` on a new `/subscribe` page, linked from the footer nav and a banner on `/blog`.
- `/api/confirm` and `/api/unsubscribe` (GET renders page with POST form; POST
  mutates), plus `/subscribed` and `/unsubscribed` static pages.
- `/api/notify` POST with shared-secret auth, new-post detection via
  `PostNotification`, per-recipient send, `?skipSend=true` backfill mode.
- One-time backfill of `PostNotification` for all currently published posts
  before merge.
- `.github/workflows/notify-subscribers.yml`, which waits for the pushed commit
  to be deployed (`/api/version`) before triggering sends.
- Site-wide subscribe popup after ~5s with persisted dismissal, not mounted on
  the subscription pages themselves.
- `/subscribed`, `/unsubscribed`, `/api/confirm`, `/api/unsubscribe` hidden from
  search engines (`noindex, nofollow` meta; sitemap excludes them and every `/api/` route).

## Out of scope

- Moving `Comment`/`Reaction` to D1 (feature 19).
- Retry queues, scheduled sends, admin UI, subscriber export.
- Hero images in email.
- Playwright coverage (feature 15).

## Build loop

`workflow.stepReview` is `feature`: one review packet after all steps.
`workflow.checkpointCommits` is `disabled`: no checkpoint commit prompts.
`/complete` makes the final feature commit. Steps that need remote Cloudflare,
Resend, or GitHub actions are performed by the user; the AI prepares exact
commands and verifies results read-only.

## Build steps

- [x] **Step 1 - Provision D1, binding, secrets** *(D1 created, binding `SUBSCRIBERS_DB`, typegen, migration applied remote + local, Resend domain verified, `.dev.vars` keys, Worker secrets `RESEND_API_KEY` + `NOTIFY_SECRET` verified via `wrangler secret list`)* - User runs `wrangler d1 create francisroylilly`; add `d1_databases` entry (`binding: SUBSCRIBERS_DB`) to `wrangler.jsonc`; `npm run cf-typegen` and commit `worker-configuration.d.ts`; apply `drizzle/d1/0000_strange_ronan.sql` with `wrangler d1 execute francisroylilly --remote --file=` and again with `--local`; `wrangler secret put RESEND_API_KEY` and `NOTIFY_SECRET`; verify `updates@mail.francisroylilly.com` domain in Resend; add `RESEND_API_KEY` and `NOTIFY_SECRET` to `.dev.vars`. *Done when:* `wrangler d1 execute francisroylilly --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` lists `Subscriber` and `PostNotification`; `env.SUBSCRIBERS_DB` is typed `D1Database`; `npm run build` passes.
- [x] **Step 2 - Test the subscribe action** - Extract the DOI branch decision from `subscribeToUpdatesHandler` into a pure function (`existing row | undefined`, sanitized input, `now`, token generator) returning the DB operation and whether to send; handler applies it. Add `describe('subscribeToUpdatesHandler')` in `src/actions/index.test.ts` with `vi.mock` on `db/d1-client.js` and `resend`: honeypot, timing, email normalization, new signup inserts + sends, unconfirmed resends same token, active sends nothing, unsubscribed gets new token + null timestamps + sends, response identical in all four. *Done when:* `npm run test` green including new cases; existing 17 still pass.
- [x] **Step 3 - Subscribe form** *(verified in dev: action inserts row, honeypot/timing rejects, `/subscribe` and `/blog` render the form, footer links to `/subscribe`)* - `src/components/SubscribeForm.astro` modeled on `CommentsForm.astro`: first name, last name, email, hidden `timestamp`, `sr-only` honeypot `website`, inline script calling `actions.subscribeToUpdates(formData)`, success/error swap, `variant` prop (`compact`, `prominent`). New `src/pages/subscribe.astro` hosts the form; `Footer.astro` nav links to `/subscribe`; `src/pages/blog/index.astro` shows a link banner to `/subscribe` above the listing. *Done when:* in `npm run dev`, submitting on `/subscribe` shows "Check your email to confirm your subscription.", a row appears in local D1 with `confirmedAt` null, honeypot-filled submit shows "Spam detected."; `npm run build` passes.
- [x] **Step 4 - Confirm flow** *(built as `src/pages/api/confirm.astro` using `BaseLayout`; logic + tests in `src/lib/subscriptions.ts`)* - `src/pages/api/confirm.ts` (`prerender = false`): GET with unknown/used token → 404 page (BaseLayout, plain message); GET with valid unconfirmed token → page with `<form method="POST">` carrying the token; POST sets `confirmedAt = now`, 303 redirect to `/subscribed`; POST with bad token → 404 page. `src/pages/subscribed.astro` static. Tests in `src/pages/api/_confirm.test.ts` with mocked `d1`: missing token 400, unknown 404, valid GET 200 with form, valid POST 303 + update called, already-confirmed POST 404. *Done when:* clicking the emailed link (dev: copy from Resend dashboard or log) renders confirm page, clicking confirm lands on `/subscribed`, D1 row has `confirmedAt` set; tests green.
- [x] **Step 5 - Unsubscribe flow** *(built as `src/pages/api/unsubscribe.astro`; same lib)* - `src/pages/api/unsubscribe.ts` same shape: GET renders confirmation page with POST form; POST sets `unsubscribedAt = now`, redirects to `/unsubscribed`; second POST is 200/redirect again (idempotent), unknown token 404. `src/pages/unsubscribed.astro` static. Tests `_unsubscribe.test.ts`. *Done when:* flow works in dev end-to-end; tests green.
- [x] **Step 6 - Notify route** - Pure `selectNewPosts(published, notifiedSlugs, now)` (sorted `pubDate` asc, excludes `pubDate > now`, excludes already-notified) with tests incl. draft never appears and future post excluded. `src/pages/api/notify.ts` POST only: `x-notify-secret` compared with `crypto.subtle.timingSafeEqual` to `NOTIFY_SECRET`, 401 otherwise, 405 for non-POST; for each new post load active subscribers, render `newPostNotificationEmail` per recipient with `${SITE_URL}/api/unsubscribe?token=`, send via Resend, insert `PostNotification`; `?skipSend=true` writes rows only; returns JSON `{ notified: [{ slug, sent, failed }], skipped: boolean }`. *Done when:* tests green; `curl -X POST localhost:4321/api/notify -H "x-notify-secret: <dev value>"` with `?skipSend=true` inserts rows for every published post; wrong secret → 401.
- [x] **Step 7 - Backfill production + workflow** *(remote `PostNotification` count 37 verified; workflow file written; GitHub `NOTIFY_SECRET` present)* - User runs one `wrangler d1 execute francisroylilly --remote` INSERT of every currently published slug into `PostNotification` (AI generates the SQL from `src/content/blog/`). Add `.github/workflows/notify-subscribers.yml` (push to `main`, `paths: ['src/content/blog/**']`, plus `workflow_dispatch`; single `curl -sf -X POST https://francisroylilly.com/api/notify -H "x-notify-secret: ${{ secrets.NOTIFY_SECRET }}"`). User adds `NOTIFY_SECRET` GitHub repo secret. *Done when:* remote `SELECT count(*) FROM PostNotification` equals published post count; workflow file lints (`actionlint` if available, else YAML parse); build passes.
- [x] **Step 8 - Subscribe popup** *(verified in Chrome: opens after delay, centered, Esc closes and persists, reload stays closed, dialog submit succeeds and auto-closes)* - Site-wide popup opening ~5s after load using a native `<dialog>` wrapping `SubscribeForm.astro` (no new dependency, see Open questions); closes on backdrop click, Esc, ×; sets `localStorage['frl-subscribe-modal-dismissed']` on close or success and never reopens when set; mounted in `BaseLayout.astro` and `src/pages/blog/index.astro`. *Done when:* dialog appears once after ~5s on `/` and `/blog`, reload does not reopen after dismissal, submitting works and closes; focus returns to trigger-less page body without trap; `npm run build` passes.

- [x] **Step 9 - Repair independent-review findings F-01 to F-10** - F-01: `GET /api/version` returns the build commit (`__BUILD_SHA__` from `WORKERS_CI_COMMIT_SHA` via `vite.define`); workflow polls it up to 6 min (24 × 15s) until it equals `github.sha`, then POSTs notify. F-02: confirm send throws on Resend `error`. F-03: timestamp must be all digits, else rejected. F-04: notify uses `resend.batch.send` in chunks of 100. F-05: preview text escaped. F-06: workflow `concurrency` group + `onConflictDoNothing` on `PostNotification` insert. F-07: `BaseLayout` `subscribeDialog` prop, off on subscription pages. F-08: `compact` variant removed. F-09: comment punctuation. F-10: `emails/layout.test.ts`, `emails/templates.test.ts`. *Done when:* `npm run test` green with new cases (66); `npm run build` passes; `/api/version` returns `{"sha":...}`; workflow YAML has the wait step.
- [x] **Step 10 - Hide confirmation pages from crawlers** - `noindex` prop on `BaseLayout`/`BaseHead` emits `noindex, nofollow` and suppresses the default `index, follow`; used by `/subscribed`, `/unsubscribed`, `/api/confirm`, `/api/unsubscribe`. Sitemap filter drops `/subscribed/` and `/unsubscribed/`. *Done when:* built pages carry exactly one robots meta; sitemap has no `subscribed` entries; build passes.

## Files / areas

- `wrangler.jsonc` (binding), `worker-configuration.d.ts` (new, generated), `.dev.vars` (local, gitignored)
- `db/d1-schema.ts`, `db/d1-client.ts`, `drizzle.d1.config.ts`, `drizzle/d1/*` (exist)
- `src/actions/index.ts` (exists; extract decision fn), `src/actions/index.test.ts`
- `src/components/SubscribeForm.astro`, `src/pages/subscribe.astro` (new), `Footer.astro` (nav link), `src/pages/blog/index.astro`, `src/layouts/BaseLayout.astro`
- `src/pages/api/confirm.ts`, `_confirm.test.ts`, `src/pages/subscribed.astro` (new)
- `src/pages/api/unsubscribe.ts`, `_unsubscribe.test.ts`, `src/pages/unsubscribed.astro` (new)
- `src/pages/api/notify.ts`, `_notify.test.ts` (new); pure helper beside it
- `emails/layout.ts`, `emails/confirmSubscription.ts`, `emails/newPostNotification.ts` (exist)
- `.github/workflows/notify-subscribers.yml` (new)
- `src/test/cloudflare-workers-stub.ts`, `vitest.config.ts` (exist), `src/test/helpers.ts` (extend `apiContext` to accept a `Request`)

## Data / contracts

- **D1 `Subscriber`:** `email` unique, lowercased + trimmed; `token` `crypto.randomUUID()`, unique, reused for confirm then unsubscribe, regenerated on re-subscribe after unsubscribe; timestamps `integer({ mode: 'timestamp' })`; active = `confirmedAt IS NOT NULL AND unsubscribedAt IS NULL`. Unconfirmed rows never receive post emails.
- **D1 `PostNotification`:** `postSlug` PK = content collection `post.id`; row presence = notified or backfilled. Insert after send attempt regardless of partial failures (failures reported in response, rerun sends nothing twice).
- **Action response:** always `{ message: 'Check your email to confirm your subscription.' }` on success; errors thrown as `Error(message)` (`Spam detected.`, `Submission too fast. Please try again.`).
- **Routes:** `/api/confirm`, `/api/unsubscribe` GET never mutate; POST body field `token`; success 303 to `/subscribed` or `/unsubscribed`; unknown token 404 HTML; missing token 400. `/api/notify` POST only; 401 on secret mismatch; auth compare timing-safe; `?skipSend=true` writes `PostNotification` only.
- **Email:** `from: EMAIL_FROM` (`Francis Roy Lilly <updates@mail.francisroylilly.com>` in `src/consts.ts`); subjects `Confirm your subscription`, `New update: <title>`; every interpolated user or frontmatter value through `escapeHtml`. Post URL `${SITE_URL}/blog/<slug>/`.
- **Secrets:** `RESEND_API_KEY`, `NOTIFY_SECRET` read from `process.env` (nodejs_compat populates from Worker secrets); never logged or returned.
- **Client storage:** `localStorage` key `frl-subscribe-modal-dismissed` = `'1'`.
- **`GET /api/version`:** `{ "sha": "<commit>" }`, `Cache-Control: no-store`; `"local"` outside Workers Builds. The workflow compares it to `github.sha` before notifying.
- **Robots:** normal pages `index, follow`; subscription result and token pages `noindex, nofollow`; never both.

## Testing

Vitest is the configured gate (`npm run test`). Logic-bearing steps ship tests
in the same diff: step 2 (action + decision fn), steps 4-5 (route handlers),
step 6 (`selectNewPosts`, auth, skipSend). D1 and Resend are mocked via
`vi.mock('../../db/d1-client.js')` and `vi.mock('resend')`; the
`cloudflare:workers` alias already exists. Steps 3, 7, 8 are UI/integration:
verify in `npm run dev` per done-when plus `npm run build`. No Browser tests
command exists; do not add Playwright here. Real Resend delivery and one
end-to-end Actions run are manual, once, before `/complete`.

## Notes for the AI

- Work already on the branch: `db/d1-schema.ts`, `db/d1-client.ts`,
  `drizzle.d1.config.ts`, generated migration, all three `emails/*` files,
  `subscribeToUpdates` action, `SITE_URL` shared by `astro.config.mjs`, Vitest
  stub for `cloudflare:workers`, `escapeHtml`. Build on it; do not rewrite.
- Branch name predates Blueprint. Keep `feature/notify-subscribers-resend-d1`;
  `/complete` reads the `**Branch:**` line above.
- New on-demand routes need `export const prerender = false` (site is
  `output: 'static'`). Test files for routes use the `_name.test.ts` prefix.
- `getCollection` is unavailable outside Astro's Vite context; `/api/notify`
  runs inside the Worker so it can use it. Keep `selectNewPosts` pure so tests
  pass plain objects.
- Workers Builds deploys minutes after a push, and `/api/notify` reads posts
  from the deployed bundle. The workflow therefore polls `/api/version` until
  the live commit equals the pushed commit (6 min cap, 24 × 15s) before notifying. If
  the deploy takes longer, the run fails visibly and `workflow_dispatch` reruns it.
- Do not create Cloudflare or Resend resources, set secrets, or push. Prepare
  commands, the user runs them.
- No AI attribution in commits.

## Open questions

- **Popup implementation.** Plan says `react-modal` + a second React form
  (`SubscribeFormReact.jsx`). Spec proposes native `<dialog>` reusing
  `SubscribeForm.astro`: no new dependency, one form implementation, same
  behavior (5s delay, Esc/backdrop/× close, persisted dismissal). Say
  `react-modal` to keep the original plan; step 8 changes accordingly.
