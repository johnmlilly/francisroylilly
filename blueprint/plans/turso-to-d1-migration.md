# Migrate Comment/Reaction from Turso to Cloudflare D1 (single cutover)

## Context

Two databases run today: Turso (libSQL) holds `Comment`/`Reaction`, Cloudflare D1
(`SUBSCRIBERS_DB`) holds `Subscriber`/`PostNotification`. The D1 side was built
second and is the intended long-term home for everything — `blueprint/build-plan.md`
item 15 already calls for retiring Turso. Running both means duplicated client
setup: two `createClient`/env-var reads (`db/client.ts`, `db/migrate.ts`), two
drizzle configs, two migration folders, two schema files, `@libsql/client` as a
prod dependency, and `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` as Worker secrets
that D1 doesn't need at all (D1 is injected as a binding, no URL/token).

This plan retires Turso in **one deploy**: provision the D1 tables and backfill
the data, then ship a single change that points every read and write at D1 and
deletes Turso. It ends with one unified `db/client.ts`/`schema.ts`/
`drizzle.config.ts`/migrations folder.

Data volume and traffic are trivial (a handful of rows), so a dual-write bake
period isn't worth its scaffolding. The one real risk is the **cutover gap**:
a comment or love written to Turso after the backfill but before the new
deploy is live would not be in D1. Step 7 closes that gap.

## Ordering

Steps 1–2 change production D1 but are purely additive — the live code never
touches the new tables, so they're safe to run before the PR merges. Step 2
must run as close to the merge as practical to keep the gap small. Step 7 runs
right after Workers Builds finishes deploying `main`.

## Steps

**1. Add the tables to D1 (production, additive).**
Copy `Comment`/`Reaction` from `db/schema.ts` into `db/d1-schema.ts` verbatim
(both are plain SQLite dialect). Run `npm run db:d1:generate` to get
`drizzle/d1/0002_*.sql`, then apply it:
`wrangler d1 execute francisroylilly --remote --file=drizzle/d1/0002_*.sql`.
The new code can't deploy before this — without the tables, the forms would 500.

**2. Backfill existing rows (production, additive).**
Throwaway script using the existing Turso `createClient` call from
`db/client.ts`: select all `Comment`/`Reaction` rows, emit `INSERT INTO ...`
statements preserving `id`s, save to `db/turso-backfill.sql` (mirrors
`db/d1-backfill-post-notifications.sql`), apply with
`wrangler d1 execute francisroylilly --remote --file=db/turso-backfill.sql`.
Record Turso's `max(id)` from `Comment` and each `Reaction.loves` at export
time — step 7 needs them. Delete the export script afterward.

**3. Consolidate to one schema/client/config.**
- Rename `db/d1-schema.ts` → `db/schema.ts` (replacing the Turso-only file) and
  `db/d1-client.ts` → `db/client.ts`. Unified client keeps the lazy-Proxy
  pattern, exports `db`, and branches on `process.env.VITEST`: `:memory:` libSQL
  for tests (per build-plan item 15's "keep libsql `:memory:` for Vitest"),
  `env.SUBSCRIBERS_DB` otherwise. No `file:.data/local.db` fallback — `npm run
  dev` runs in workerd, so the binding exists locally too.
- Delete `drizzle.config.ts` (Turso-only), rename `drizzle.d1.config.ts` →
  `drizzle.config.ts`. Delete the old Turso-only migrations in `drizzle/` and
  move `drizzle/d1/` → `drizzle/` (or repoint `out` — whichever reads better).
- `src/test/setup.ts`: migrate the merged folder against `:memory:` so
  `Comment`/`Reaction` tests keep running real SQL.
- Delete `db/migrate.ts`. Convert `db/seed.ts` to `db/seed.sql`. Repoint or drop
  the `db:migrate`/`db:seed`/`db:d1:generate` npm scripts to `drizzle-kit
  generate` + `wrangler d1 execute`.

**4. Point the app at D1.**
Update `src/actions/index.ts` and the subscriber code to import from the
single `db/client.js`. Reads live in `src/components/CommentsList.astro` and
`src/components/ReactionsButton.astro`, which already import `db/client.js`. The
`d1` export name for Subscriber code becomes `db` too — one name for one
database.

**5. Remove Turso.**
`npm uninstall @libsql/client` **only if** tests no longer need it — they do
(`:memory:` client), so move it to `devDependencies` instead. Delete
`TURSO_*` from `.dev.vars`, run `npm run cf-typegen`. (Secret deletion in
production waits until step 7 confirms D1 is complete.)

**6. Docs.** `README.md` ("Two databases today"), `AGENTS.md` ("Data access is
Drizzle ORM + `@libsql/client` against Turso" and the `DB:` command line),
`blueprint/context/project-overview.md` (data model + secrets),
`blueprint/context/coding-standards.md`, check off build-plan item 15.

**7. Post-deploy reconciliation (production).**
Once `main` is live, query Turso one last time:
- `Comment` rows with `id >` the step-2 `max(id)` → insert into D1 **without**
  the `id` (D1 may already have issued those ids to new comments), keeping
  `postSlug/name/email/message/createdAt`.
- Any `Reaction.loves` that grew since step 2 → add the delta to the D1 row.
Likely zero rows. Then `wrangler secret delete TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN`, and delete `db/turso-backfill.sql` (or keep it as a dated
record). Turso database itself can be deleted after a few quiet days.

Rollback: revert the merge. Old code reads Turso, which still holds everything
written before cutover; anything written to D1 after cutover would need a
reverse copy — acceptable at this traffic.

## Verification

- `npm run verify` passes (typecheck, tests against merged migrations on
  `:memory:`, build).
- After deploy: post a comment and a love on the live site, refresh, confirm
  both persist; `wrangler d1 execute francisroylilly --remote --command "select
  count(*) from Comment"` reflects it.
- `grep -ri turso` hits only intentionally kept historical files.

## Notable files

- `db/client.ts`, `db/d1-client.ts` → one `db/client.ts`
- `db/schema.ts`, `db/d1-schema.ts` → one `db/schema.ts`
- `drizzle.config.ts`, `drizzle.d1.config.ts` → one config
- `drizzle/`, `drizzle/d1/` → one migration history
- `db/migrate.ts`, `db/seed.ts` → `wrangler d1 execute` + `db/seed.sql`
- `src/actions/index.ts`, `src/components/CommentsList.astro`, `src/components/ReactionsButton.astro` → single D1 path
- `src/test/setup.ts` → merged folder on `:memory:`
- `.dev.vars`, Worker secrets, `worker-configuration.d.ts` → drop `TURSO_*`
- `README.md`, `AGENTS.md`, `blueprint/context/*`, `blueprint/build-plan.md` → docs
