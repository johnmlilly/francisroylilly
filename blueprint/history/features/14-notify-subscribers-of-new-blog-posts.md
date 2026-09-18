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


<!-- blueprint:completion {"schemaVersion":1,"specBytes":14900,"specSha256":"4425da0c48e09ab0a4d429de9edd53c1c8f6ebdb72a891ed4ba64a9e0213279a","branch":"refs/heads/feature/notify-subscribers-resend-d1","head":"06750a35f8bad5eb6e86df5a6eb885607c177019","baseRef":"refs/heads/main","baseCommit":"f865e19f604239293f1cea598a245270c0197774","sourceTree":"3441217c3115110c471bfe64d55e96fdefff0e2d","absentOptional":[]} -->

## Findings

### 14/F-01 [P1] closed - Notify workflow fires before the new Worker is deployed, so normal new-post pushes send nothing

**File:** .github/workflows/notify-subscribers.yml:6-22 (see also src/pages/api/notify.ts:34)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The workflow runs `curl` the moment a push lands on `main`. Deploys happen separately through Cloudflare Workers Builds and take minutes (install, `astro build` with ~280 image transforms, deploy). `/api/notify` reads `getCollection('blog')` from the content bundled into the *currently deployed* Worker, so on a normal push it does not see the new post, returns `200 { notified: [], skipped: false }`, `curl -sf` exits 0, and the run is green. Nothing re-triggers later, so the feature's core behavior (one email per new post) silently never fires on the ordinary publishing path. The spec's note only covers the first push after merge and expects a visible curl failure, which will not happen once the route exists. A one-off manual `workflow_dispatch` after deploy passes, so the planned end-to-end check would mask this.
**Suggested fix:** Make the workflow wait for the new deploy before calling notify. Smallest repository-native option: add a step that polls, with a bounded timeout (for example 10 minutes, 20-second interval), until the deployed Worker reports the pushed commit, then POST. Expose the commit with a tiny prerendered `/api/version` (or similar) that emits a build-time constant fed from the build's git SHA, and compare it with `github.sha`. A cruder but workable variant is polling `https://francisroylilly.com/blog/<new-slug>/` for a 200 when the workflow can derive the slug from the changed files. Alternatively move the trigger inside the deployed Worker (a `triggers.crons` entry in `wrangler.jsonc` calling the same notify logic) so content and trigger can never disagree; the spec lists scheduled sends as out of scope, so that route needs an explicit user decision.
**Resolution:** Added GET /api/version exposing the build commit (vite.define __BUILD_SHA__ from WORKERS_CI_COMMIT_SHA); workflow polls it until it equals github.sha (40 x 15s) before POSTing notify. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). Re-examined src/pages/api/version.ts, astro.config.mjs vite.define, src/types/globals.d.ts, and .github/workflows/notify-subscribers.yml:25-37. The workflow now blocks on /api/version equalling github.sha (40 x 15s, hard failure on timeout) before POSTing, so the original silent no-op path is gone and a slow or failed deploy fails visibly. Local build inlines sha "local" as designed. Residual, unverifiable offline: the exact Workers Builds variable name WORKERS_CI_COMMIT_SHA; if wrong, every run times out visibly rather than sending nothing.

### 14/F-02 [P2] closed - Confirmation email send ignores Resend's returned error

**File:** src/actions/index.ts:146-151
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The Resend SDK reports API failures as `{ data: null, error }` and does not throw (the notify route handles this at src/pages/api/notify.ts:75-76; the action does not). A 4xx from Resend (domain not verified, rate limit, validation) therefore returns `Check your email to confirm your subscription.` while no email was sent, with an unconfirmed row already persisted. Neither the reader nor the operator learns that delivery failed.
**Suggested fix:** Destructure `{ error }` from `resend.emails.send(...)` and throw a user-facing `Error('We could not send the confirmation email. Please try again.')` when it is set. Add a case to `src/actions/subscribe.test.ts` where `sendMock` resolves with an error and assert the handler rejects.
**Resolution:** sendConfirmationEmail now destructures { error } and throws a user-facing error; test added in src/actions/subscribe.test.ts. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). src/actions/index.ts:147-156 destructures { error } and throws a user-facing Error; src/actions/subscribe.test.ts:72-81 covers the rejection and confirms the row is kept for a retry. No new defect.

### 14/F-03 [P2] closed - Timing check passes when `timestamp` is empty or non-numeric

**File:** src/actions/index.ts:169-175
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `parseInt('')` is `NaN`, `NaN < 3` is `false`, so the "too fast" gate is skipped entirely. The hidden input ships as `value=""` (src/components/SubscribeForm.astro:38) and is only populated by client script, so a bot that posts the raw form without running JS, the exact case the timing check is meant to catch, passes it. The honeypot remains, but `hidden` inputs are commonly skipped by form-fillers. The timestamp is client-supplied by design, so this is a soft gate either way, which keeps this at P2.
**Suggested fix:** Reject when `!Number.isFinite(formLoadTime)` alongside the `< 3` check, and add a test with `timestamp: ''`. Note this also rejects the no-JS `<form action>` fallback, which currently succeeds only because of the NaN path; if no-JS submissions should keep working, populate the timestamp server-side in the action instead. The same pattern exists in the pre-existing `addCommentHandler` (line 38), outside this delta.
**Resolution:** Timestamp must match /^\d+$/ and yield a finite diff, else rejected as too fast; it.each test for empty/non-numeric values. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). src/actions/index.ts:176-181 requires /^\d+$/ and a finite diff; oversized digit strings and future timestamps yield a negative diff and are rejected. src/actions/subscribe.test.ts:62-70 covers '', 'abc', '12ab', ' '. No new defect.

### 14/F-04 [P2] closed - Serial per-recipient sends may exceed Resend's default rate limit and drop recipients permanently

**File:** src/pages/api/notify.ts:65-86
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** Each active subscriber gets one awaited `emails.send` call. Resend's documented default limit is 2 requests per second; a Worker-to-Resend round trip is typically well under 500 ms, so with more than a handful of subscribers the loop can outrun the limit. The installed SDK (resend 6.28.1) has no retry or backoff, so a 429 is counted as `failed`, the `PostNotification` row is still inserted, and those readers never receive that post and are never retried. Unverified: needs a real send to more than two active subscribers, or confirmation of the account's actual limit.
**Suggested fix:** Use `resend.batch.send` (up to 100 messages per call, one request per chunk), which the SDK already exposes, and keep the per-recipient HTML. If staying with single sends, add a small delay between calls. Either way the response's `failed` count still surfaces problems.
**Resolution:** Notify now uses resend.batch.send in chunks of 100 (lib chunk() with test); 150-recipient test asserts two batch calls. Fixed by /implement 2026-09-18; real multi-recipient send still pending manual verification. Closed by independent review 2026-09-18 (claude-fable-5-1). src/pages/api/notify.ts:78-86 uses resend.batch.send over chunk(emails, 100) with per-chunk error and throw accounting; src/lib/notify.test.ts covers chunk, src/pages/api/_notify.test.ts:103-114 asserts 100 + 50 split. Residual, not a code defect: a batch is all-or-nothing at Resend, so one address Resend rejects fails its whole chunk of up to 100 and is reported as failed. Real multi-recipient send still pending manual verification.

### 14/F-05 [P3] closed - Post title reaches the email preview text unescaped, contrary to the spec's escaping contract

**File:** emails/layout.ts:36 (caller emails/newPostNotification.ts:18,30)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The spec requires every interpolated user or frontmatter value to pass through `escapeHtml`. `subject` is built from the raw post `title` and then injected as `previewText` into the hidden preview span. Titles are author-controlled, so this is not a trust-boundary issue, but a title containing `&` or `<` produces malformed markup in the preview.
**Suggested fix:** Escape once inside `renderEmail` (`${escapeHtml(previewText)}`) so every template gets it for free.
**Resolution:** renderEmail escapes previewText; covered by emails/layout.test.ts. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). emails/layout.ts:36 escapes previewText; emails/layout.test.ts:17-27 asserts '&' and '<script>' are escaped. No new defect.

### 14/F-06 [P3] closed - Concurrent workflow runs can double-send and then fail on the primary-key insert

**File:** .github/workflows/notify-subscribers.yml:15-17 (see also src/pages/api/notify.ts:85)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** Two pushes to `main` in quick succession start two runs. Both read an empty `PostNotification` set, both send to every subscriber, and the second `insert` hits the `postSlug` primary key and throws after the emails already went out, returning 500. Low probability for a personal blog, cheap to prevent.
**Suggested fix:** Add `concurrency: { group: notify-subscribers, cancel-in-progress: false }` to the workflow and use `.onConflictDoNothing()` on the `PostNotification` insert.
**Resolution:** Workflow has concurrency group notify-subscribers (cancel-in-progress false); PostNotification insert uses onConflictDoNothing(). Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). .github/workflows/notify-subscribers.yml:18-20 declares the concurrency group with cancel-in-progress false; src/pages/api/notify.ts:91-94 uses onConflictDoNothing(). A manual curl overlapping a run can still double-send (insert is after send), which is the accepted design of the suggested fix.

### 14/F-07 [P3] closed - Subscribe popup mounts on pages where it contradicts the reader's action

**File:** src/layouts/BaseLayout.astro:28
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `BaseLayout` renders `SubscribeDialog` everywhere, so `/subscribe`, `/subscribed`, `/unsubscribed`, `/api/confirm`, and `/api/unsubscribe` all open a "Follow Francis's journey" modal after five seconds unless the reader previously dismissed it. Someone who just unsubscribed or is mid-confirmation gets asked to subscribe. The spec's done-when names only `/` and `/blog`.
**Suggested fix:** Add a `subscribeDialog?: boolean` prop to `BaseLayout` (default `true`) and pass `false` from those five pages.
**Resolution:** BaseLayout gained subscribeDialog prop (default true); /subscribe, /subscribed, /unsubscribed, /api/confirm, /api/unsubscribe pass false. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). BaseLayout subscribeDialog prop defaults true; /subscribe, /subscribed, /unsubscribed, /api/confirm, /api/unsubscribe pass false. Build output confirms id="subscribe-dialog" present on /, /blog, /prayers and absent on /subscribe and /subscribed.

### 14/F-08 [P3] closed - Unused `compact` form variant

**File:** src/components/SubscribeForm.astro:5, 197-218
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** No caller passes `variant="compact"`; the footer links to `/subscribe` instead of embedding the form. About twenty lines of styles and a prop union member are dead code, which the coding standards ask to avoid.
**Suggested fix:** Delete the `.subscribe-form--compact` rules and narrow or remove the `variant` prop. No current requirement is lost.
**Resolution:** variant prop and compact CSS removed from SubscribeForm; card styles are now the base. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). No variant or compact reference remains in src/components/SubscribeForm.astro; Props is heading and headingId only.

### 14/F-09 [P3] closed - Em dash in a code comment

**File:** emails/layout.ts:23
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The Writing standard bans U+2014 in comments and generated content. This is the only occurrence in the product delta.
**Suggested fix:** Replace the em dash with a hyphen or colon.
**Resolution:** Comment rewritten without the em dash. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). No U+2014 in any file of the product delta; the only remaining occurrences (src/pages/api/comments.ts, reactions.ts, src/layouts/BlogPost.astro) predate this feature.

### 14/F-10 [P3] closed - `escapeHtml` and the email templates have no direct tests

**File:** emails/layout.ts:8-15
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `escapeHtml` is a formatter, which the Testing scope rule puts in-scope while a test runner is configured. It is only exercised indirectly through `toContain` assertions on URLs, so dropping one replacement (for example `&`) would not fail the suite.
**Suggested fix:** Add `emails/layout.test.ts` covering the five escaped characters and one template assertion that a `<b>` in `firstName` is escaped in the output.
**Resolution:** Added emails/layout.test.ts (escapeHtml, renderEmail, button) and emails/templates.test.ts. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). emails/layout.test.ts covers all five escaped characters, renderEmail, and button; emails/templates.test.ts asserts firstName, title, and description escaping plus both links.

### 14/F-12 [P3] closed - Sitemap still lists the token routes `/api/confirm/` and `/api/unsubscribe/`

**File:** astro.config.mjs:19-20
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The spec's in-scope list and the Robots contract say `/api/confirm` and `/api/unsubscribe` are hidden from search engines by both the `noindex` meta and sitemap exclusion. The filter only drops `/subscribed/` and `/unsubscribed/`; `@astrojs/sitemap` includes parameterless on-demand routes, so the built `dist/client/sitemap-0.xml` contains `https://francisroylilly.com/api/confirm/` and `https://francisroylilly.com/api/unsubscribe/`. Crawlers fetching them get a 400 "missing link" page. The `noindex` meta already prevents indexing, so this is a spec-drift and Search Console hygiene issue, not an exposure. Step 10's done-when only checked for `subscribed` entries, which is why it passed.
**Suggested fix:** Extend the filter to also drop `/api/` (for example `!page.includes('/api/')`), then confirm the built sitemap has no `/api/` entries. This would also drop the pre-existing `/api/comments/` and `/api/reactions/` if they appear; check the user is fine with that or scope the filter to `/api/confirm/` and `/api/unsubscribe/` only.
**Resolution:** Sitemap filter now also drops every page containing /api/; built sitemap has no /api/ entries. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). astro.config.mjs:22-25 filter now also rejects any page containing /api/. After `npm run build` at 0b4bf4a, dist/client/sitemap-0.xml holds 42 <loc> entries: no /api/, /subscribed/, or /unsubscribed/ URL, while /subscribe/ and every published post remain. The filter is a pure predicate so it introduces no new defect; the pre-existing /api/comments/ and /api/reactions/ routes are excluded too, which the user chose in commit 0b4bf4a.

## Independent review

**Status:** passed
**Target commit:** 06750a35f8bad5eb6e86df5a6eb885607c177019
**Base commit:** f865e19f604239293f1cea598a245270c0197774
**Base ref:** main
**Spec hash:** 4425da0c48e09ab0a4d429de9edd53c1c8f6ebdb72a891ed4ba64a9e0213279a
**Prepared by:** claude
**Builder model:** claude-fable-5-1
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-18T03:56:53Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-fable-5-1
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-18T03:59:33Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `f865e19f604239293f1cea598a245270c0197774..06750a35f8bad5eb6e86df5a6eb885607c177019` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`, `git merge-base main HEAD`, `shasum -a 256 blueprint/context/current-feature.md`, `git status --porcelain`: pass (target, base, spec hash match; only review.md and findings.md dirty)
- `git diff 0b4bf4ab2aac85bad1e4c294f3a31ec6956f1d66 06750a35f8bad5eb6e86df5a6eb885607c177019 --stat`: pass (empty; target tree identical to the prior checkpoint)
- `npm run test`: pass (10 files, 66 tests)
- `npm run build`: pass

### Evidence

- Full `f865e19..06750a3` delta reviewed (53 files) across all four lenses: src/, db/, emails/, drizzle/, .github/workflows/notify-subscribers.yml, astro.config.mjs, vitest.config.ts, wrangler.jsonc, package.json and lockfile, all *.test.ts, blueprint docs; worker-configuration.d.ts checked only for the `SUBSCRIBERS_DB: D1Database` binding (generated by `wrangler types`)
- Built `dist/client/sitemap-0.xml`: 42 entries, none under /api/, /subscribed/, or /unsubscribed/; /subscribe/ present
- Built pages: `index, follow` on /, /subscribe, /blog; `noindex, nofollow` on /subscribed and /unsubscribed; exactly one robots meta per page
- `id="subscribe-dialog"` present on / and /blog, absent on /subscribe and /subscribed
- `/api/notify` auth: constant-time `secretsMatch`, 401 on missing header or unset secret before any content or D1 read; 405 via `ALL`
- Confirm and unsubscribe GET never write; POST mutates once, 303 to the static result page; tokens are `crypto.randomUUID()`; Astro escapes `firstName` and the hidden `token` value
- Email templates escape every interpolated value including preview text; hrefs are built from `SITE_URL` plus a UUID token only
- No `.skip`/`.only`/`.todo` in delta tests; no U+2014 in the delta; no secret-like values in the delta; `.dev.vars` ignored and untracked
- Deleted `.claude/commands/feature.md` is the pre-Blueprint legacy command superseded by `.claude/skills/feature/SKILL.md`

### Findings

- F-13 [P3] open (new): workflow stays green when every batch send fails
- F-11 [P2] open (unchanged, user-deferred)
- F-01 to F-10, F-12 closed: re-examined files show no regression

### Remaining risk

- F-13: a fully failed send is visible only in the Actions step log; recovery is manual because the `PostNotification` row is already recorded
- F-11: unthrottled confirmation resends for an unconfirmed or unsubscribed address (user deferred)
- Real Resend delivery, the live `/api/version` value of `WORKERS_CI_COMMIT_SHA`, and one end-to-end Actions run are not verifiable offline; a wrong variable name times out visibly (6 min) rather than sending nothing
- A Resend batch is all-or-nothing, so one rejected address fails its chunk of up to 100 recipients
- No Browser tests command is declared; popup and form behavior rest on the spec's recorded dev verification plus build output
