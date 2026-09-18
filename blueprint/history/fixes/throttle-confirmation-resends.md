# Fix: Throttle confirmation email resends

**Type:** Fix
**Status:** verified
**Branch:** `fix/throttle-confirmation-resends`
**Fixes:** F-11
**Base:** `feature/notify-subscribers-resend-d1` (PR #26 unmerged; this fix's PR targets that branch)

## The problem

`subscribeToUpdatesHandler` sends a confirmation email on every submission for
an address that is unconfirmed (`resend`) or previously unsubscribed
(`reactivate`). The only gates are the honeypot and the client-supplied
`timestamp`, both trivially satisfied by a script. Anyone can point the public
action at a third party's address and trigger an unbounded stream of "Confirm
your subscription" mail from `updates@mail.francisroylilly.com`: unsolicited
mail to the victim, sender-reputation damage, and Resend quota exhaustion that
would then block real confirmations and the next post notification.

Decision (user, 2026-09-18): repository-native throttle with a `lastEmailedAt`
column and a 10 minute window, not a Cloudflare WAF rule.

## The fix

- `db/d1-schema.ts`: add nullable `lastEmailedAt` (`integer`, `timestamp` mode)
  to `Subscriber`. Generate `drizzle/d1/0001_hard_major_mapleleaf.sql` with `npm run db:d1:generate`.
- `src/lib/subscribeDecision.ts`: new `CONFIRMATION_RESEND_WINDOW_MS` (10 min).
  In the `resend` and `reactivate` branches, return `{ kind: 'throttled' }` when
  `existing.lastEmailedAt` is set and `now - lastEmailedAt < window`. A `null`
  `lastEmailedAt` (rows created before this migration) never throttles. `insert`
  and `noop` are unchanged.
- `src/actions/index.ts`: treat `throttled` like `noop` for DB writes and
  sending. After a successful `sendConfirmationEmail`, update the row's
  `lastEmailedAt = now` by email. Stamp only after the send succeeds so a Resend
  failure (which already surfaces an error to the reader) does not lock them out
  for 10 minutes. The response stays `Check your email to confirm your
  subscription.` in every branch, so nothing reveals list membership.
- No change to confirm, unsubscribe, notify, templates, or the form.

Must not break: existing four opt-in branches, honeypot and timing rejections,
the Resend error path, email normalization, and the identical-response contract.

## Build steps

- [x] **Step 1 - Column, throttle, stamp, tests** *(74 tests green incl. 8 new; build passes; migration `drizzle/d1/0001_hard_major_mapleleaf.sql` is one ALTER TABLE)* - schema column + generated
  migration; `throttled` branch in `decideSubscribe`; handler stamps
  `lastEmailedAt` after a successful send and skips everything on `throttled`;
  tests in `src/lib/subscribeDecision.test.ts` (resend and reactivate throttled
  inside the window, allowed at exactly the window and beyond, allowed when
  `lastEmailedAt` is null) and `src/actions/subscribe.test.ts` (throttled
  submission writes nothing and sends nothing but returns the normal message;
  successful send records `lastEmailedAt`). *Done when:* `npm run test` green
  with the new cases; `npm run build` passes; `drizzle/d1/0001_hard_major_mapleleaf.sql` contains
  exactly one `ALTER TABLE \`Subscriber\` ADD \`lastEmailedAt\` integer`.

## Deployment note

After merge, before the next post: user applies the migration once to
production and once locally:

    wrangler d1 execute francisroylilly --remote --file=drizzle/d1/0001_hard_major_mapleleaf.sql
    wrangler d1 execute francisroylilly --local  --file=drizzle/d1/0001_hard_major_mapleleaf.sql

Until the remote migration runs, the deployed action will fail on the unknown
column, so apply it before merging PR #26 to `main` (or immediately after).

## Verify

1. `npm run test`: new throttle cases pass alongside the existing 66.
2. `npm run build` passes.
3. Dev (`.dev.vars` with real Resend key, local D1 migrated): submit `/subscribe`
   for a fresh address, get one email; submit again within 10 minutes, see the
   same success message but no second email and unchanged `lastEmailedAt` in
   `wrangler d1 execute francisroylilly --local --command "SELECT email, lastEmailedAt FROM Subscriber"`.


<!-- blueprint:completion {"schemaVersion":1,"specBytes":4066,"specSha256":"37c73e92a898e92e05cab9ef972c8c8f91acd421cc5546b536347971fd8475db","branch":"refs/heads/fix/throttle-confirmation-resends","head":"69e35f217f30a21d7c3db239430760e48cf607ac","baseRef":"refs/heads/main","baseCommit":"f865e19f604239293f1cea598a245270c0197774","sourceTree":"6b0d32009318174e3f31ae44428b01c1ad24e369","absentOptional":[]} -->

## Findings

### throttle-confirmation-resends/F-11 [P2] closed - Subscribe action re-sends a confirmation email on every submission for an unconfirmed or unsubscribed address, with no throttle

**File:** src/lib/subscribeDecision.ts:50-56, 63-75 (caller src/actions/index.ts:213-216)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The `resend` and `reactivate` branches send a fresh confirmation email each time the form is posted for that address. The only gates are the honeypot and the client-supplied `timestamp`, both trivially satisfied by a script that posts `timestamp = now - 4000`. Anyone can therefore point the public action at a third party's address and trigger an unbounded stream of "Confirm your subscription" emails from `updates@mail.francisroylilly.com`: unsolicited mail to a victim, sender-reputation damage, and exhaustion of the Resend quota, which would then block real confirmations and the next post notification. Impact is bounded by the Resend plan limits, and the spec accepted these soft gates, so this stays at P2 rather than P1.
**Suggested fix:** Smallest repository-native option: skip the send in `decideSubscribe` when the row was emailed recently (for example within 10 minutes), which needs one nullable `lastEmailedAt` column on `Subscriber` (D1 migration) set on every send, and a test for the throttled branch; the response stays identical so nothing is revealed. Platform-native alternative with no code: one Cloudflare rate-limiting rule on `POST /_actions/*` per client IP. Either changes shipped behavior slightly (a genuine "I didn't get it" resend within the window is suppressed), so it needs the user's decision on the window or the WAF path. No current requirement is lost.
**Resolution:** User chose the lastEmailedAt column with a 10 minute window (2026-09-18). decideSubscribe returns `throttled` for resend/reactivate when lastEmailedAt is inside CONFIRMATION_RESEND_WINDOW_MS; the handler stamps lastEmailedAt only after a successful send; response unchanged. Migration drizzle/d1/0001_*.sql. Fixed by /implement 2026-09-18. Closed by independent /audit 2026-09-18 at 69e35f2: `emailedRecently` (src/lib/subscribeDecision.ts:31-36) throttles only when `lastEmailedAt` is non-null and `now - lastEmailedAt < 600000` ms, so exactly-at-window and pre-migration null rows still send; both `resend` (line 64) and `reactivate` (line 77) branches are guarded, `insert` and `noop` are untouched; the handler (src/actions/index.ts:194-221) passes the same `now` to the decision and the stamp, writes `lastEmailedAt` only after `sendConfirmationEmail` returns (a Resend error throws first), and does no D1 write or send on `throttled` while returning the identical message; migration 0001 is one nullable `ALTER TABLE ... ADD`, snapshot `prevId` chains to 0000; 8 new tests cover inside/at/beyond window, null column, active-subscriber noop, throttled no-op, and failed-send no-stamp; 74 tests and build pass. Residual burst window tracked separately as F-14.

## Independent review

**Status:** passed
**Target commit:** 69e35f217f30a21d7c3db239430760e48cf607ac
**Base commit:** f865e19f604239293f1cea598a245270c0197774
**Base ref:** main
**Spec hash:** 37c73e92a898e92e05cab9ef972c8c8f91acd421cc5546b536347971fd8475db
**Prepared by:** claude
**Builder model:** claude-fable-5-1
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-18T13:55:14Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-fable-5-1
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-18T13:57:48Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `f865e19f604239293f1cea598a245270c0197774..69e35f217f30a21d7c3db239430760e48cf607ac` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`, `git merge-base main HEAD`, `shasum -a 256 blueprint/context/current-feature.md`, `git status --porcelain`: pass (target, base, and spec hash match; only review.md dirty)
- `git show 69e35f2` and `git diff --stat f865e19..69e35f2`, `git diff --stat 06750a3..69e35f2`: pass (fix delta and post-receipt delta enumerated)
- `npm run test`: pass (10 files, 74 tests)
- `npm run build`: pass
- typecheck (`astro check` / `tsc`): unavailable (no script declared, `@astrojs/check` not installed)

### Evidence

- Fix commit 69e35f2 reviewed fresh across all four lenses: db/d1-schema.ts, drizzle/d1/0001_hard_major_mapleleaf.sql, drizzle/d1/meta/0001_snapshot.json and _journal.json, src/lib/subscribeDecision.ts, src/actions/index.ts, src/lib/subscribeDecision.test.ts, src/actions/subscribe.test.ts, and the Fix spec
- Throttle boundary is strict `<` against `CONFIRMATION_RESEND_WINDOW_MS` (600000 ms); tests assert throttled at window-1 ms and allowed at exactly the window and beyond; a null `lastEmailedAt` short-circuits to no throttle for both resend and reactivate
- Handler builds one `now`, passes it to `decideSubscribe`, and stamps `lastEmailedAt = now` only after `sendConfirmationEmail` returns; a Resend error throws before the stamp (test: no update recorded); `throttled` performs no insert, update, or send and returns the same message as every other branch
- `insert` branch and its values are byte-identical to the prior checkpoint; `noop` unchanged
- Migration 0001 is a single nullable `ALTER TABLE ADD` (existing rows read NULL); snapshot `prevId` equals the 0000 snapshot id and the journal gains idx 1
- Post-receipt delta 06750a3..69e35f2 outside the fix: 330a687 touches only .claude/skills/complete/SKILL.md and AGENTS.md; ffa7613 changes copy in SubscribeForm.astro and subscribe.astro only (Hero `subtitle` is optional); no product regression
- Remaining f865e19..06750a3 delta re-examined for regressions against the archived feature 14 receipt (blueprint/history/features/14-notify-subscribers-of-new-blog-posts.md): files unchanged since that pass; no new defect found
- No `.skip`/`.only`/`.todo` in tests; no U+2014 in the fix delta; `.dev.vars` ignored and untracked; no secret values in the delta

### Findings

- F-11 [P2] closed: repair verified complete and correct at 69e35f2
- F-13 [P3] open: unchanged, user-deferred
- F-14 [P3] open (new): throttle is check-then-act, concurrent submissions can each send before the first stamp lands
- F-15 [P3] open (new): every `Subscriber` select depends on the new column, so deploying before the remote migration breaks confirm, unsubscribe, and notify as well as subscribe

### Remaining risk

- No typecheck signal: `astro check` and `tsc` are not installed or declared, so type errors that Vite's transform tolerates would not be caught locally
- F-15: production D1 must receive migration 0001 before this code is live; the spec's deployment note understates which routes depend on it
- F-14: a parallel burst inside one send round-trip still sends multiple confirmations to one address per 10 minute window
- F-13: a fully failed notification batch is visible only in the Actions step log
- Real Resend delivery and the live D1 column change are not verifiable offline; Check was not required
