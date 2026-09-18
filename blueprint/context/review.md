# Independent Review

**Status:** changes-requested
**Target commit:** de215ab8e744450af37658b7abd44cb0780b7cc9
**Base commit:** f493ae4b13eb28c9eb12a037f86ec4b4d9682667
**Base ref:** main
**Spec hash:** 9809d5057ea53e18965babe45a8e05cc7cb1b942caf8704f7b20f123233fa169
**Prepared by:** claude
**Builder model:** claude-fable-5-1
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-18T03:02:23Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-fable-5-1
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-18T03:08:24Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** changes-requested
**Check result:** not-required

## Handoff

Review the active spec and the complete `f493ae4b13eb28c9eb12a037f86ec4b4d9682667..de215ab8e744450af37658b7abd44cb0780b7cc9` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `git rev-parse HEAD`: pass (equals Target commit)
- `git merge-base main HEAD`: pass (equals Base commit)
- `shasum -a 256 blueprint/context/current-feature.md`: pass (equals Spec hash)
- `git status --porcelain`: pass (only `blueprint/context/review.md` modified)
- `npm run test`: pass (8 files, 52 tests)
- `npm run build`: pass (static + server build complete)
- `npm run dev`: not run (reviewer boundary; Check not required)

## Evidence

- Full delta reviewed via `git diff f493ae4b..de215ab8` across all four lenses; Blueprint scaffolding (`.claude/`, `blueprint/`, `AGENTS.md`, `CLAUDE.md`), generated `worker-configuration.d.ts` (confirmed `SUBSCRIBERS_DB: D1Database`), and `package-lock.json` (adds `resend`) covered as low-risk replay; substantive product code read in full.
- Shared-secret auth: `secretsMatch` is a constant-time XOR compare, missing header or unset secret never matches, `ALL` returns 405 for non-POST; covered by `src/lib/notify.test.ts` and `src/pages/api/_notify.test.ts`.
- GET on `/api/confirm` and `/api/unsubscribe` performs lookups only; POST mutates once (confirm) or idempotently (unsubscribe); Astro escapes `token` and `firstName` in the rendered pages.
- Double-opt-in branches in `src/lib/subscribeDecision.ts` match the spec (insert, resend same token, noop, reactivate with new token and null timestamps) and are covered directly and through the handler.
- `selectNewPosts` excludes drafts and future `pubDate`, sorts ascending, skips notified slugs; `PostNotification` inserted after the send loop regardless of partial failures.
- Secrets read from `process.env`, never logged or returned; `.dev.vars` gitignored and untracked; D1 `database_id` in `wrangler.jsonc` is a non-secret identifier.
- Backfill SQL lists 37 slugs; `src/content/blog` holds 37 posts, all `isPublished`.
- Resend SDK 6.28.1 inspected locally: no retry or 429 handling; `batch.send` available.
- Design plan and spec never address that the GitHub Actions trigger runs before Cloudflare Workers Builds deploys the content the Worker reads (F-01).

## Findings

- F-01 [P1] open - workflow fires before deploy, normal new-post pushes send nothing
- F-02 [P2] open - confirmation send ignores Resend error
- F-03 [P2] open - timing check passes on empty or non-numeric timestamp
- F-04 [P2] unverified - serial sends may exceed Resend rate limit and drop recipients
- F-05 [P3] open - preview text unescaped
- F-06 [P3] open - concurrent runs can double-send then 500
- F-07 [P3] open - popup mounts on subscribe, confirm, and unsubscribe pages
- F-08 [P3] open - unused compact variant
- F-09 [P3] open - em dash in comment
- F-10 [P3] open - escapeHtml and templates untested

## Remaining risk

- Blocking: F-01 must be repaired and a new checkpoint reviewed before `/complete`.
- No Verify or typecheck command is declared, so `astro check` was not run; type safety rests on the Vite build only.
- Real Resend delivery, D1 writes, the GitHub Actions run, and browser behavior of the dialog and form were not exercised (Check not required; no Browser tests command).
- Posts with a future `pubDate` only go out on the next push or manual `workflow_dispatch`; there is no scheduled trigger, per the spec's out-of-scope list.
- Independence and model identity are declared metadata, not cryptographic proof.
