# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P1] closed - Notify workflow fires before the new Worker is deployed, so normal new-post pushes send nothing

**File:** .github/workflows/notify-subscribers.yml:6-22 (see also src/pages/api/notify.ts:34)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The workflow runs `curl` the moment a push lands on `main`. Deploys happen separately through Cloudflare Workers Builds and take minutes (install, `astro build` with ~280 image transforms, deploy). `/api/notify` reads `getCollection('blog')` from the content bundled into the *currently deployed* Worker, so on a normal push it does not see the new post, returns `200 { notified: [], skipped: false }`, `curl -sf` exits 0, and the run is green. Nothing re-triggers later, so the feature's core behavior (one email per new post) silently never fires on the ordinary publishing path. The spec's note only covers the first push after merge and expects a visible curl failure, which will not happen once the route exists. A one-off manual `workflow_dispatch` after deploy passes, so the planned end-to-end check would mask this.
**Suggested fix:** Make the workflow wait for the new deploy before calling notify. Smallest repository-native option: add a step that polls, with a bounded timeout (for example 10 minutes, 20-second interval), until the deployed Worker reports the pushed commit, then POST. Expose the commit with a tiny prerendered `/api/version` (or similar) that emits a build-time constant fed from the build's git SHA, and compare it with `github.sha`. A cruder but workable variant is polling `https://francisroylilly.com/blog/<new-slug>/` for a 200 when the workflow can derive the slug from the changed files. Alternatively move the trigger inside the deployed Worker (a `triggers.crons` entry in `wrangler.jsonc` calling the same notify logic) so content and trigger can never disagree; the spec lists scheduled sends as out of scope, so that route needs an explicit user decision.
**Resolution:** Added GET /api/version exposing the build commit (vite.define __BUILD_SHA__ from WORKERS_CI_COMMIT_SHA); workflow polls it until it equals github.sha (40 x 15s) before POSTing notify. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). Re-examined src/pages/api/version.ts, astro.config.mjs vite.define, src/types/globals.d.ts, and .github/workflows/notify-subscribers.yml:25-37. The workflow now blocks on /api/version equalling github.sha (40 x 15s, hard failure on timeout) before POSTing, so the original silent no-op path is gone and a slow or failed deploy fails visibly. Local build inlines sha "local" as designed. Residual, unverifiable offline: the exact Workers Builds variable name WORKERS_CI_COMMIT_SHA; if wrong, every run times out visibly rather than sending nothing.

### F-02 [P2] closed - Confirmation email send ignores Resend's returned error

**File:** src/actions/index.ts:146-151
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The Resend SDK reports API failures as `{ data: null, error }` and does not throw (the notify route handles this at src/pages/api/notify.ts:75-76; the action does not). A 4xx from Resend (domain not verified, rate limit, validation) therefore returns `Check your email to confirm your subscription.` while no email was sent, with an unconfirmed row already persisted. Neither the reader nor the operator learns that delivery failed.
**Suggested fix:** Destructure `{ error }` from `resend.emails.send(...)` and throw a user-facing `Error('We could not send the confirmation email. Please try again.')` when it is set. Add a case to `src/actions/subscribe.test.ts` where `sendMock` resolves with an error and assert the handler rejects.
**Resolution:** sendConfirmationEmail now destructures { error } and throws a user-facing error; test added in src/actions/subscribe.test.ts. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). src/actions/index.ts:147-156 destructures { error } and throws a user-facing Error; src/actions/subscribe.test.ts:72-81 covers the rejection and confirms the row is kept for a retry. No new defect.

### F-03 [P2] closed - Timing check passes when `timestamp` is empty or non-numeric

**File:** src/actions/index.ts:169-175
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `parseInt('')` is `NaN`, `NaN < 3` is `false`, so the "too fast" gate is skipped entirely. The hidden input ships as `value=""` (src/components/SubscribeForm.astro:38) and is only populated by client script, so a bot that posts the raw form without running JS, the exact case the timing check is meant to catch, passes it. The honeypot remains, but `hidden` inputs are commonly skipped by form-fillers. The timestamp is client-supplied by design, so this is a soft gate either way, which keeps this at P2.
**Suggested fix:** Reject when `!Number.isFinite(formLoadTime)` alongside the `< 3` check, and add a test with `timestamp: ''`. Note this also rejects the no-JS `<form action>` fallback, which currently succeeds only because of the NaN path; if no-JS submissions should keep working, populate the timestamp server-side in the action instead. The same pattern exists in the pre-existing `addCommentHandler` (line 38), outside this delta.
**Resolution:** Timestamp must match /^\d+$/ and yield a finite diff, else rejected as too fast; it.each test for empty/non-numeric values. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). src/actions/index.ts:176-181 requires /^\d+$/ and a finite diff; oversized digit strings and future timestamps yield a negative diff and are rejected. src/actions/subscribe.test.ts:62-70 covers '', 'abc', '12ab', ' '. No new defect.

### F-04 [P2] closed - Serial per-recipient sends may exceed Resend's default rate limit and drop recipients permanently

**File:** src/pages/api/notify.ts:65-86
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** Each active subscriber gets one awaited `emails.send` call. Resend's documented default limit is 2 requests per second; a Worker-to-Resend round trip is typically well under 500 ms, so with more than a handful of subscribers the loop can outrun the limit. The installed SDK (resend 6.28.1) has no retry or backoff, so a 429 is counted as `failed`, the `PostNotification` row is still inserted, and those readers never receive that post and are never retried. Unverified: needs a real send to more than two active subscribers, or confirmation of the account's actual limit.
**Suggested fix:** Use `resend.batch.send` (up to 100 messages per call, one request per chunk), which the SDK already exposes, and keep the per-recipient HTML. If staying with single sends, add a small delay between calls. Either way the response's `failed` count still surfaces problems.
**Resolution:** Notify now uses resend.batch.send in chunks of 100 (lib chunk() with test); 150-recipient test asserts two batch calls. Fixed by /implement 2026-09-18; real multi-recipient send still pending manual verification. Closed by independent review 2026-09-18 (claude-fable-5-1). src/pages/api/notify.ts:78-86 uses resend.batch.send over chunk(emails, 100) with per-chunk error and throw accounting; src/lib/notify.test.ts covers chunk, src/pages/api/_notify.test.ts:103-114 asserts 100 + 50 split. Residual, not a code defect: a batch is all-or-nothing at Resend, so one address Resend rejects fails its whole chunk of up to 100 and is reported as failed. Real multi-recipient send still pending manual verification.

### F-05 [P3] closed - Post title reaches the email preview text unescaped, contrary to the spec's escaping contract

**File:** emails/layout.ts:36 (caller emails/newPostNotification.ts:18,30)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The spec requires every interpolated user or frontmatter value to pass through `escapeHtml`. `subject` is built from the raw post `title` and then injected as `previewText` into the hidden preview span. Titles are author-controlled, so this is not a trust-boundary issue, but a title containing `&` or `<` produces malformed markup in the preview.
**Suggested fix:** Escape once inside `renderEmail` (`${escapeHtml(previewText)}`) so every template gets it for free.
**Resolution:** renderEmail escapes previewText; covered by emails/layout.test.ts. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). emails/layout.ts:36 escapes previewText; emails/layout.test.ts:17-27 asserts '&' and '<script>' are escaped. No new defect.

### F-06 [P3] closed - Concurrent workflow runs can double-send and then fail on the primary-key insert

**File:** .github/workflows/notify-subscribers.yml:15-17 (see also src/pages/api/notify.ts:85)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** Two pushes to `main` in quick succession start two runs. Both read an empty `PostNotification` set, both send to every subscriber, and the second `insert` hits the `postSlug` primary key and throws after the emails already went out, returning 500. Low probability for a personal blog, cheap to prevent.
**Suggested fix:** Add `concurrency: { group: notify-subscribers, cancel-in-progress: false }` to the workflow and use `.onConflictDoNothing()` on the `PostNotification` insert.
**Resolution:** Workflow has concurrency group notify-subscribers (cancel-in-progress false); PostNotification insert uses onConflictDoNothing(). Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). .github/workflows/notify-subscribers.yml:18-20 declares the concurrency group with cancel-in-progress false; src/pages/api/notify.ts:91-94 uses onConflictDoNothing(). A manual curl overlapping a run can still double-send (insert is after send), which is the accepted design of the suggested fix.

### F-07 [P3] closed - Subscribe popup mounts on pages where it contradicts the reader's action

**File:** src/layouts/BaseLayout.astro:28
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `BaseLayout` renders `SubscribeDialog` everywhere, so `/subscribe`, `/subscribed`, `/unsubscribed`, `/api/confirm`, and `/api/unsubscribe` all open a "Follow Francis's journey" modal after five seconds unless the reader previously dismissed it. Someone who just unsubscribed or is mid-confirmation gets asked to subscribe. The spec's done-when names only `/` and `/blog`.
**Suggested fix:** Add a `subscribeDialog?: boolean` prop to `BaseLayout` (default `true`) and pass `false` from those five pages.
**Resolution:** BaseLayout gained subscribeDialog prop (default true); /subscribe, /subscribed, /unsubscribed, /api/confirm, /api/unsubscribe pass false. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). BaseLayout subscribeDialog prop defaults true; /subscribe, /subscribed, /unsubscribed, /api/confirm, /api/unsubscribe pass false. Build output confirms id="subscribe-dialog" present on /, /blog, /prayers and absent on /subscribe and /subscribed.

### F-08 [P3] closed - Unused `compact` form variant

**File:** src/components/SubscribeForm.astro:5, 197-218
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** No caller passes `variant="compact"`; the footer links to `/subscribe` instead of embedding the form. About twenty lines of styles and a prop union member are dead code, which the coding standards ask to avoid.
**Suggested fix:** Delete the `.subscribe-form--compact` rules and narrow or remove the `variant` prop. No current requirement is lost.
**Resolution:** variant prop and compact CSS removed from SubscribeForm; card styles are now the base. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). No variant or compact reference remains in src/components/SubscribeForm.astro; Props is heading and headingId only.

### F-09 [P3] closed - Em dash in a code comment

**File:** emails/layout.ts:23
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The Writing standard bans U+2014 in comments and generated content. This is the only occurrence in the product delta.
**Suggested fix:** Replace the em dash with a hyphen or colon.
**Resolution:** Comment rewritten without the em dash. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). No U+2014 in any file of the product delta; the only remaining occurrences (src/pages/api/comments.ts, reactions.ts, src/layouts/BlogPost.astro) predate this feature.

### F-10 [P3] closed - `escapeHtml` and the email templates have no direct tests

**File:** emails/layout.ts:8-15
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `escapeHtml` is a formatter, which the Testing scope rule puts in-scope while a test runner is configured. It is only exercised indirectly through `toContain` assertions on URLs, so dropping one replacement (for example `&`) would not fail the suite.
**Suggested fix:** Add `emails/layout.test.ts` covering the five escaped characters and one template assertion that a `<b>` in `firstName` is escaped in the output.
**Resolution:** Added emails/layout.test.ts (escapeHtml, renderEmail, button) and emails/templates.test.ts. Fixed by /implement 2026-09-18. Closed by independent review 2026-09-18 (claude-fable-5-1). emails/layout.test.ts covers all five escaped characters, renderEmail, and button; emails/templates.test.ts asserts firstName, title, and description escaping plus both links.

### F-11 [P2] open - Subscribe action re-sends a confirmation email on every submission for an unconfirmed or unsubscribed address, with no throttle

**File:** src/lib/subscribeDecision.ts:50-56, 63-75 (caller src/actions/index.ts:213-216)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The `resend` and `reactivate` branches send a fresh confirmation email each time the form is posted for that address. The only gates are the honeypot and the client-supplied `timestamp`, both trivially satisfied by a script that posts `timestamp = now - 4000`. Anyone can therefore point the public action at a third party's address and trigger an unbounded stream of "Confirm your subscription" emails from `updates@mail.francisroylilly.com`: unsolicited mail to a victim, sender-reputation damage, and exhaustion of the Resend quota, which would then block real confirmations and the next post notification. Impact is bounded by the Resend plan limits, and the spec accepted these soft gates, so this stays at P2 rather than P1.
**Suggested fix:** Smallest repository-native option: skip the send in `decideSubscribe` when the row was emailed recently (for example within 10 minutes), which needs one nullable `lastEmailedAt` column on `Subscriber` (D1 migration) set on every send, and a test for the throttled branch; the response stays identical so nothing is revealed. Platform-native alternative with no code: one Cloudflare rate-limiting rule on `POST /_actions/*` per client IP. Either changes shipped behavior slightly (a genuine "I didn't get it" resend within the window is suppressed), so it needs the user's decision on the window or the WAF path. No current requirement is lost.
**Resolution:**

### F-12 [P3] fixed - Sitemap still lists the token routes `/api/confirm/` and `/api/unsubscribe/`

**File:** astro.config.mjs:19-20
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The spec's in-scope list and the Robots contract say `/api/confirm` and `/api/unsubscribe` are hidden from search engines by both the `noindex` meta and sitemap exclusion. The filter only drops `/subscribed/` and `/unsubscribed/`; `@astrojs/sitemap` includes parameterless on-demand routes, so the built `dist/client/sitemap-0.xml` contains `https://francisroylilly.com/api/confirm/` and `https://francisroylilly.com/api/unsubscribe/`. Crawlers fetching them get a 400 "missing link" page. The `noindex` meta already prevents indexing, so this is a spec-drift and Search Console hygiene issue, not an exposure. Step 10's done-when only checked for `subscribed` entries, which is why it passed.
**Suggested fix:** Extend the filter to also drop `/api/` (for example `!page.includes('/api/')`), then confirm the built sitemap has no `/api/` entries. This would also drop the pre-existing `/api/comments/` and `/api/reactions/` if they appear; check the user is fine with that or scope the filter to `/api/confirm/` and `/api/unsubscribe/` only.
**Resolution:** Sitemap filter now also drops every page containing /api/; built sitemap has no /api/ entries. Fixed by /implement 2026-09-18.
