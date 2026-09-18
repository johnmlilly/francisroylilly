# Independent Review

**Status:** passed
**Target commit:** 764be67aa7f4b57641429886f5c6f2d2573041ef
**Base commit:** f493ae4b13eb28c9eb12a037f86ec4b4d9682667
**Base ref:** main
**Spec hash:** 635cfd3876e9c4517b5d404b1c44e0a3a6ff7eee617abe755cf465abc918a358
**Prepared by:** claude
**Builder model:** claude-fable-5-1
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-18T03:22:45Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-fable-5-1
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-18T03:28:20Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `f493ae4b13eb28c9eb12a037f86ec4b4d9682667..764be67aa7f4b57641429886f5c6f2d2573041ef` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `git rev-parse HEAD` = 764be67aa7f4b57641429886f5c6f2d2573041ef: pass
- `git merge-base main HEAD` = f493ae4b13eb28c9eb12a037f86ec4b4d9682667: pass
- `shasum -a 256 blueprint/context/current-feature.md` = 635cfd38...18a358: pass
- `git status --porcelain` (only `blueprint/context/review.md` modified): pass
- `npm run test` (Vitest 4.1.10, 10 files, 66 tests): pass
- `npm run build` (astro build + Cloudflare adapter, sitemap generated): pass

## Evidence

- Full delta reviewed via `git diff f493ae4b..764be67a`: product code under `src/`, `db/`, `emails/`, `drizzle/`, `.github/workflows/`, `astro.config.mjs`, `vitest.config.ts`, `wrangler.jsonc`, all `*.test.ts`; plus replayed Blueprint scaffolding (`.claude/`, `blueprint/`, `AGENTS.md`, `CLAUDE.md`), generated `worker-configuration.d.ts` (binding `SUBSCRIBERS_DB: D1Database`), and `package-lock.json` (adds `resend@6.28.1` and its four transitive deps only).
- Deploy timing: `/api/version` is on-demand with `Cache-Control: no-store`; `vite.define` inlines `__BUILD_SHA__` (build output chunk `version_*.mjs` carries `sha: "local"` locally); workflow polls 40 x 15s for equality with `github.sha` and fails hard on timeout before the notify POST; `concurrency` group `notify-subscribers` with `cancel-in-progress: false`; `permissions: contents: read`.
- Notify route: `secretsMatch` constant-time compare rejects missing header or unset secret before touching content; `resend.batch.send` per chunk of 100 with per-chunk error and throw accounting; `PostNotification` insert uses `onConflictDoNothing()` after the send attempt; `skipSend=true` never constructs Resend or sends; `ALL` export answers 405.
- Subscribe action: `timestamp` must match `/^\d+$/` and yield a finite diff of at least 3s; Resend `{ error }` surfaces as a user-facing throw; response identical across insert, resend, noop, reactivate; `EMAIL_FROM` and `SITE_URL` constants used by both send paths.
- Email HTML: `escapeHtml` applied to firstName, title, description, and `previewText` inside `renderEmail`; URLs are built only from `SITE_URL`, UUID tokens, and content ids.
- Confirm and unsubscribe `.astro` routes: GET only reads via `lookup*`; POST mutates via `confirmSubscription` (once per token) and `unsubscribe` (idempotent, no second write); 303 to `/subscribed` or `/unsubscribed`; 400 missing, 404 unknown; both pass `noindex` and `subscribeDialog={false}`.
- Built HTML carries exactly one robots meta per page: `index, follow` on `/`, `/subscribe`, `/blog`; `noindex, nofollow` on `/subscribed`, `/unsubscribed`. Dialog markup present on `/`, `/blog`, `/prayers`, absent on `/subscribe`, `/subscribed`.
- Built sitemap has no `/subscribed/` or `/unsubscribed/` entries but does list `/api/confirm/` and `/api/unsubscribe/` (F-12).
- No `console.*` in delta product code; no `.dev.vars` or `.env` in the delta; the only secret-shaped match in the delta is the test fixture `SECRET = 'test-notify-secret'`; no `.only`/`.skip` tests; no U+2014 in delta files.
- Tests: `beforeEach` resets the fake D1 and mocks; `process.env.NOTIFY_SECRET` restored per test; 150-recipient split, failed batch, skipSend, 401, 405, DOI branches, token flows, escaping, and timestamp edge cases all asserted.

## Findings

- F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10: re-examined against the repaired code and moved from `fixed` to `closed`
- F-11 [P2] open: subscribe action re-sends a confirmation email on every submission for an unconfirmed or unsubscribed address, with no throttle (src/lib/subscribeDecision.ts:50-56, 63-75)
- F-12 [P3] open: sitemap still lists `/api/confirm/` and `/api/unsubscribe/` despite the spec's sitemap-exclusion contract (astro.config.mjs:19-20)

## Remaining risk

- `WORKERS_CI_COMMIT_SHA` as the Workers Builds variable feeding `__BUILD_SHA__` cannot be verified offline; if the name is wrong, `/api/version` reports `local` in production and every workflow run fails visibly on the 10-minute timeout rather than sending nothing.
- Real Resend delivery (single and multi-recipient batch) and one end-to-end Actions run remain manual per the spec; no live Resend, D1, or GitHub Actions evidence was inspected. Resend batch calls are all-or-nothing, so one rejected address fails its whole chunk of up to 100.
- Route-level status codes for `/api/confirm` and `/api/unsubscribe` (`.astro` pages) are verified by reading, not by unit tests; the spec moved that coverage to `src/lib/subscriptions.test.ts`.
- No lint, typecheck (`astro check`), or Verify command is declared for this project, so none was run.
- Check was not required and was not run; no browser evidence from this review. `SubscribeDialog` is not mounted on blog post pages (`src/pages/blog/[...slug].astro` uses `BlogPost` layout), consistent with the spec's done-when (`/` and `/blog`) but narrower than "site-wide".
