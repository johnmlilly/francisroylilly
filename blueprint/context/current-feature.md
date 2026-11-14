# Feature: Migrate Turso to Cloudflare D1

**From build-plan:** feature 15
**Build attempt:** 1
**Branch:** feature/turso-to-d1-migration
**Status:** verified

## Goal

Move `Comment` and `Reaction` from Turso into the existing D1 database
(`SUBSCRIBERS_DB`) in one cutover, and collapse the two database setups into one
schema, one client, one drizzle config, and one migration history. Turso is
retired: no `TURSO_*` secrets, no Turso code path at runtime. Vitest keeps a
libSQL `:memory:` database so comment/reaction tests still run real SQL.

Detailed plan: `blueprint/plans/turso-to-d1-migration.md`.

## In scope

- Add `Comment`/`Reaction` tables to D1 (generated migration, applied to
  production by the user/with approval before merge).
- One-time backfill of existing Turso rows into D1, preserving ids.
- Unified `db/schema.ts`, `db/client.ts` (exports `db`), `drizzle.config.ts`,
  `drizzle/` migration folder.
- All comment, reaction, and subscriber code uses the single `db` export.
- Remove `db/migrate.ts`, replace `db/seed.ts` with `db/seed.sql`, repoint npm
  scripts.
- Drop `TURSO_*` from `.dev.vars` and `worker-configuration.d.ts`.
- Docs catch-up and check off build-plan item 15.
- Post-deploy reconciliation runbook (gap rows), and Turso secret deletion
  after it.

## Out of scope

- Dual-write / bake period (user chose single cutover).
- Renaming the `SUBSCRIBERS_DB` binding or the `francisroylilly` D1 database.
- Any change to comment/reaction behavior, validation, rate limits, or UI.
- Deleting the Turso database itself (user does this later, outside the repo).
- Playwright tests (feature 16).

## Build loop

`workflow.stepReview: "feature"`: build all steps, then one review packet.
`checkpointCommits: "disabled"`. `/complete` makes the final commit. Production
commands (`wrangler d1 execute --remote`, `wrangler secret delete`) are never
run without an explicit yes in chat for that command.

## Build steps

- [x] **1. Add Comment/Reaction to the D1 schema and generate the migration.**
  Copy both table definitions verbatim from `db/schema.ts` into
  `db/d1-schema.ts`. Run `npm run db:d1:generate`; expect a new
  `drizzle/d1/0002_*.sql` containing only `CREATE TABLE Comment` and
  `CREATE TABLE Reaction`. Review the SQL.
  Done when: `0002_*.sql` creates exactly those two tables; `npm run test` and
  `npm run build` still pass.
  **Production (ask first):** `wrangler d1 execute francisroylilly --remote
  --file=drizzle/d1/0002_<tag>.sql`. Additive; live code ignores these tables.
  Result: applied as `drizzle/0002_plain_korg.sql` (2026-11-13, user-approved);
  remote D1 lists `Comment` and `Reaction`.

- [x] **2. Backfill Turso rows into D1.**
  Result (2026-11-13): Turso credentials were gone, so the user exported the
  database from the Turso dashboard that day. The export carried both tables in
  the old Astro DB shape; only the current columns were copied (legacy
  `likes`/`prayers`/`supports` dropped, unused by the app). Generated
  `turso-backfill.sql` in the scratchpad with `sqlite3 quote()`, dry-ran it
  against a fresh DB built from `0002`, then applied it (user-approved). Remote
  D1: Comment 516 rows, max id 525; Reaction 37 rows, sum(loves) 805 - matches
  the export. Export snapshot for the post-merge gap check: max(Comment.id) 525,
  per-slug loves saved in the scratchpad.
  Throwaway script in the scratchpad (not the repo) using `@libsql/client` with
  the `.dev.vars` Turso credentials: select all `Comment` and `Reaction` rows,
  write `turso-backfill.sql` **in the scratchpad** (holds commenter emails;
  never committed) with one `INSERT INTO ... (id, ...) VALUES (...)`
  per row, SQL string literals with single quotes doubled. Header comment records
  export time, Turso `max(Comment.id)`, and per-slug `loves` (step 9 needs them).
  Done when: row counts in the file match Turso counts.
  **Production (ask first, as close to merge as practical):**
  `wrangler d1 execute francisroylilly --remote --file=<scratchpad>/turso-backfill.sql`,
  then `select count(*)` on both tables matches Turso.

- [x] **3. Unify schema, client, config, and migrations.**
  - `db/d1-schema.ts` → `db/schema.ts` (replaces the Turso-only file).
  - `db/d1-client.ts` → `db/client.ts` (replaces the Turso-only file). Keep the
    lazy-Proxy; export `db`. `getDb()` branches on `process.env.VITEST`:
    `drizzle-orm/libsql` over `createClient({ url: ':memory:' })`, otherwise
    `drizzle-orm/d1` over `env.SUBSCRIBERS_DB`. Type the export as the D1
    database type; the libSQL instance is cast (both are async SQLite drizzle
    databases with the same query API). No `file:.data/local.db` fallback.
    Re-export all four tables plus `eq`, `desc`, `isNull`, `and`, `isNotNull`.
  - Delete old `drizzle.config.ts`; rename `drizzle.d1.config.ts` →
    `drizzle.config.ts` with `schema: './db/schema.ts'`, `out: './drizzle'`.
  - Delete Turso migrations `drizzle/0000_natural_monster_badoon.sql` and
    `drizzle/meta/*`; move `drizzle/d1/*` up to `drizzle/`. D1's
    `d1_migrations`/applied state is unaffected (migrations are applied by file,
    not tracked by drizzle).
  - `src/test/setup.ts` migrates `./drizzle` (now includes all four tables)
    against the `:memory:` client.
  - `src/lib/subscribeDecision.ts` type import → `db/schema.js`.
  Done when: no file imports `d1-client` or `d1-schema`; build and tests pass
  (after step 4).

- [x] **4. Point all callers at the single `db`.**
  Replace `d1` with `db` imports from `db/client.js` in `src/actions/index.ts`,
  `src/lib/subscriptions.ts`, `src/pages/api/notify.ts`,
  `src/pages/api/subscriber-report.ts`. Comment/reaction readers
  `src/components/CommentsList.astro` and `src/components/ReactionsButton.astro`
  already import `db/client.js`; they now hit D1 with no code change.
  Update `vi.mock('.../db/d1-client.js')` in `src/actions/subscribe.test.ts`,
  `src/lib/subscriptions.test.ts`, `src/pages/api/_notify.test.ts`,
  `src/pages/api/_subscriber-report.test.ts` to mock `db/client.js`, replacing
  only `db` with the fake; update `src/test/fake-d1.ts` and
  `src/test/cloudflare-workers-stub.ts` comments.
  Check: `src/actions/index.test.ts` uses the real `db` for comments, while
  `subscribe.test.ts` mocks the same module — confirm setup.ts's migration still
  runs against the real `:memory:` db when a test file mocks `db/client.js`. If
  the mock collides, the subscriber tests use the real `:memory:` db instead of
  the fake.
  Done when: `npm run test` passes with the same 87 tests (or more), and
  `npm run build` passes.

- [x] **5. Replace migrate/seed scripts.**
  Delete `db/migrate.ts`. Convert `db/seed.ts` to `db/seed.sql` (same four rows,
  fixed ISO timestamps) and delete `db/seed.ts`. `package.json` scripts:
  `db:generate` = `drizzle-kit generate`; `db:seed` = `wrangler d1 execute
  francisroylilly --local --file=db/seed.sql`; remove `db:migrate` and
  `db:d1:generate`. Keep `@libsql/client` in `dependencies` (imported by
  `db/client.ts`'s Vitest branch). Done when: `npm run db:generate` reports no
  schema changes; tests and build pass.

- [x] **6. Remove Turso config.**
  Status: done. User removed `TURSO_*` from `.dev.vars` and ran `npm run cf-typegen`;
  `worker-configuration.d.ts` has no `TURSO_*`.
  Remove `TURSO_*` lines and the `turso db` comments from `.dev.vars` (ask
  before editing; git-ignored, holds live secrets). Run `npm run cf-typegen`;
  confirm `worker-configuration.d.ts` no longer lists `TURSO_*`. Update the
  `.fallowrc.json` `ignoreExports` comment (one client now). Done when:
  `grep -rni turso` outside `blueprint/history/` and `blueprint/plans/`
  returns nothing in code/config; build passes.

- [x] **7. Docs.** `README.md` (two-databases section), `AGENTS.md` (Data
  access paragraph and `DB:` command line), `blueprint/context/project-overview.md`
  (data model: one D1 database; tech stack line; secrets), 
  `blueprint/context/coding-standards.md` (any Turso/two-client guidance),
  `blueprint/plans/turso-to-d1-migration.md` (correct the read-path file names
  to `CommentsList.astro`/`ReactionsButton.astro`). Build-plan item 15 is
  checked off by `/complete`. Done when: docs describe one D1 database and the
  new `db:*` scripts.

- [x] **8. Final verify.** `npm run test`, `npm run build`, `npx astro check`
  if available, and the fallow gate. Done when all pass.
  Result: tests 87/87, build pass, fallow `warn` (only `test-only-branch` on the
  spec-required `VITEST` branch in `db/client.ts`). `astro check` not installed
  (`@astrojs/check` missing) - skipped, not run.

- [x] **9. Repair F-27: keep libSQL out of the production Worker.** (User
  decision 2026-11-14, revises step 3's client shape.) `db/client.ts` becomes
  D1-only. New `src/test/db-client.ts` builds the libSQL `:memory:` drizzle DB,
  migrates `./drizzle`, and re-exports the same names; `vitest.config.ts`
  aliases any `db/client.js` import to it (alongside the existing
  `cloudflare:workers` alias), so app code and `vi.mock` paths stay unchanged.
  `src/test/setup.ts` no longer needs its own migrate. Move `@libsql/client` to
  `devDependencies`. Done when: tests 87/87, build passes, the built
  `dist/server` chunks contain no `@libsql/client` code, fallow has no
  `test-only-branch` warning; F-27 marked `fixed`.

## Post-merge runbook

Not a build step: it can only run after Workers Builds deploys `main`, so it
follows `/complete`. Each production command is asked first.

- Gap check: export Turso again from the dashboard; `Comment` rows with
  `id > 525` go into D1 **without** `id`. Compare `Reaction.loves` with the
  step-2 snapshot; add any delta to the D1 row (`insert` if the slug is new).
- Live check: post a comment and a love; refresh; confirm both persist and
  `select count(*) from Comment` on D1 grew.
- `wrangler secret delete TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- Delete the scratchpad export and backfill files.

## Files / areas

- `db/schema.ts`, `db/d1-schema.ts` → one `db/schema.ts`
- `db/client.ts`, `db/d1-client.ts` → one `db/client.ts`
- `db/migrate.ts` (delete), `db/seed.ts` → `db/seed.sql`
- `drizzle.config.ts`, `drizzle.d1.config.ts` → one config; `drizzle/`, `drizzle/d1/` → `drizzle/`
- `src/actions/index.ts`, `src/lib/subscriptions.ts`, `src/lib/subscribeDecision.ts`,
  `src/pages/api/notify.ts`, `src/pages/api/subscriber-report.ts`
- Readers (no change expected): `src/components/CommentsList.astro`, `src/components/ReactionsButton.astro`
- Tests: `src/test/setup.ts`, `src/test/fake-d1.ts`, `src/test/cloudflare-workers-stub.ts`,
  `src/actions/subscribe.test.ts`, `src/lib/subscriptions.test.ts`,
  `src/pages/api/_notify.test.ts`, `src/pages/api/_subscriber-report.test.ts`
- `package.json`, `.dev.vars`, `worker-configuration.d.ts`, `.fallowrc.json`
- Docs: `README.md`, `AGENTS.md`, `blueprint/context/project-overview.md`,
  `blueprint/context/coding-standards.md`, `blueprint/plans/turso-to-d1-migration.md`

## Data / contracts

- `Comment` and `Reaction` shapes are locked (project overview): same columns,
  types, nullability, defaults, autoincrement ids. `createdAt` stays ISO text.
  Backfill preserves ids so existing rows keep identity.
- Gap rows (step 9) get new D1 ids — no external reference to comment ids
  exists, so this is safe.
- Commenter `email` is still never selected into rendered output
  (`CommentsList.astro` named-column select is unchanged).
- The backfill SQL contains commenter names and emails, unlike the
  slugs-only `db/d1-backfill-post-notifications.sql` precedent. It lives in the
  scratchpad, is never committed, and the PR records only row counts and max id.
- Binding stays `SUBSCRIBERS_DB`; database stays `francisroylilly`.

## Testing

- Existing `src/actions/index.test.ts` comment/reaction tests run unchanged
  against the merged migrations on `:memory:` — covers ordering, rate limit,
  love upsert, `returning()`.
- Subscriber tests keep their fake (or real `:memory:` db per step 4 check).
- No new tests: behavior is unchanged; the change is wiring.
- Baseline observed: `npm run test` 10 files / 87 tests pass; `npm run build`
  passes. `npm run verify` does not exist in `package.json` despite AGENTS.md
  listing it.
- Live D1 behavior is verified only in step 9 after deploy; nothing in this
  spec claims it beforehand.

## Notes for the AI

- Never run `--remote` wrangler commands or `wrangler secret` without an
  explicit yes for that command.
- Ask before deleting files (project rule): old `drizzle.config.ts`, Turso
  migrations, `db/migrate.ts`, `db/seed.ts`, `db/d1-*.ts` after rename.
- The detailed plan named `src/pages/api/comments.ts`/`reactions.ts`; those
  files don't exist. Readers are the two Astro components.
- Cutover gap is accepted by the user; step 9 closes it.
