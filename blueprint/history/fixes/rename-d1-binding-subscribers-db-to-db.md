# Fix: Rename D1 binding SUBSCRIBERS_DB to DB

**Type:** Fix
**Status:** verified
**Branch:** fix/rename-d1-binding-subscribers-db-to-db

## The problem

Since feature 15 moved `Comment`/`Reaction` into D1, the one D1 database
(`francisroylilly`) holds every table, but the Worker still reaches it through
the binding `SUBSCRIBERS_DB`, a name left over from feature 14 when it only held
subscribers. The name now misdescribes what it is.

## The fix

Rename the binding to `DB` (the common single-database Worker convention, read
as `env.DB`). Only the binding name changes: same `database_name`
(`francisroylilly`) and `database_id`, so no data, migration, or remote command
is involved. The next deploy swaps the name atomically.

- `wrangler.jsonc`: `"binding": "SUBSCRIBERS_DB"` -> `"binding": "DB"`.
- `db/client.ts`: `env.SUBSCRIBERS_DB` -> `env.DB`.
- `worker-configuration.d.ts`: regenerate with `npm run cf-typegen`.
- Active docs: `README.md`, `AGENTS.md`, `blueprint/project-plan.md`,
  `blueprint/context/project-overview.md`, `blueprint/context/coding-standards.md`.
- Leave `blueprint/history/` and `blueprint/plans/` unchanged (historical records).

Must not break: any D1 read/write path (comments, reactions, subscribe, confirm,
unsubscribe, notify, subscriber report), tests, or local dev.

## Build steps

- [x] **1. Rename the binding and update docs.** Apply the changes above, then
  regenerate types. Done when: no `SUBSCRIBERS_DB` remains outside
  `blueprint/history/` and `blueprint/plans/`; `worker-configuration.d.ts`
  declares `DB: D1Database`; `npm run verify` passes.
  Result: `npm run verify` pass (astro check 0 errors, Vitest 87/87, build);
  built `dist/server/wrangler.json` binds `"DB"`; fallow pass. Regenerated
  `worker-configuration.d.ts` also picks up newer workerd runtime types from
  the wrangler bump already on `main`.

## Verify

- `npm run verify` (astro check, Vitest, build).
- After merge and deploy: post a comment or love on the live site and confirm it
  persists (proves the Worker reaches D1 through `DB`).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":2066,"specSha256":"d224e8f08104186feb3c73fc7f282d1f97ceac212b6bacb9019f89eca823aff4","branch":"refs/heads/fix/rename-d1-binding-subscribers-db-to-db","head":"3eb3f5ae7c8ce25fa65b0f9567f7cc2e4b9027b7","baseRef":"refs/heads/main","baseCommit":"3eb3f5ae7c8ce25fa65b0f9567f7cc2e4b9027b7","sourceTree":"5782d057039442865a11a00ee2799931aa54ac09","absentOptional":[]} -->
