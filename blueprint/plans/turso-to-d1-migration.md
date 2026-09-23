# Migrate Comment/Reaction from Turso to Cloudflare D1 (dual-write, zero downtime)

## Context

Two databases run today: Turso (libSQL) holds `Comment`/`Reaction`, Cloudflare D1
(`SUBSCRIBERS_DB`) holds `Subscriber`/`PostNotification`. The D1 side was built
second and is the intended long-term home for everything — `blueprint/build-plan.md`
item 15 already calls for retiring Turso. Running both means duplicated client
setup: two `createClient`/env-var reads (`db/client.ts`, `db/migrate.ts`), two
drizzle configs, two migration folders, two schema files, `@libsql/client` as a
prod dependency, and `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` as Worker secrets
that D1 doesn't need at all (D1 is injected as a binding, no URL/token).

This plan retires Turso for good: moves `Comment`/`Reaction` into the existing D1
database, using a **dual-write bake period** so the live comment/love-reaction
forms never go down and no write is ever at risk of being lost between the data
export and the code cutover. It ends with one unified `db/client.ts`/`schema.ts`/
`drizzle.config.ts`/migrations folder — the "dupe setup" collapses to one of
everything.

Data volume is trivial (a handful of rows via `db/seed.ts`), so the complexity
here is purely in service of the learning goal: this is the general pattern for
migrating a live datastore under traffic without a maintenance window.

## Why dual-write works here

Turso stays the **source of truth** for reads throughout the bake period; D1 only
receives a best-effort mirror of new writes. That ordering matters: if the D1
mirror write fails, the user-facing action must not fail, and no data is lost
because Turso already has it. A final reconciliation pass before the flip catches
any row that only made it to Turso because of a transient D1 hiccup. Only after
D1 is verified caught up does the code stop reading/writing Turso at all — the
one moment of real risk (switching the read path) is instant and covered by the
existing rollback lever (revert the deploy).

## Deploy 1 — provision D1 tables, backfill, start dual-write

**1. Add tables to the D1 side.**
Copy `Comment`/`Reaction` from `db/schema.ts` into `db/d1-schema.ts` verbatim
(same `sqliteTable`/`integer`/`text` calls — both are plain SQLite dialect, no
type changes needed). Run `npm run db:d1:generate` to get a new
`drizzle/d1/0002_*.sql` migration, then apply it to production:
`wrangler d1 execute francisroylilly --remote --file=drizzle/d1/0002_*.sql`.

**2. One-time backfill of existing rows.**
Write a throwaway script (reuse the existing Turso `createClient` call from
`db/client.ts`) that selects all `Comment`/`Reaction` rows and emits
`INSERT INTO Comment (...) VALUES (...)` / `INSERT INTO Reaction (...) VALUES (...)`
statements, preserving the existing autoincrement `id`s. Save as
`db/turso-backfill.sql` (mirrors the existing `db/d1-backfill-post-notifications.sql`
pattern) and apply once: `wrangler d1 execute francisroylilly --remote --file=db/turso-backfill.sql`.
Delete the throwaway export script afterward; the `.sql` file can stay as a
historical record like the existing backfill file, or be deleted once Turso is
gone.

**3. Add the D1 mirror write, keep Turso as the read/write source of truth.**
In `src/actions/index.ts`:
- `addCommentHandler`: after the existing Turso `db.insert(Comment)...returning()`
  succeeds, fire an equivalent `d1.insert(Comment).values(...)` using the same
  row data (including the id/createdAt that Turso generated, so both stores agree
  on the row). Wrap it in try/catch that only logs — a D1 failure here must never
  surface to the commenter, since Turso already has the authoritative row.
- `addLoveHandler`: same idea — after the Turso `update`/`insert` for `Reaction`,
  mirror the resulting state (`loves` count) into D1 with `insert ... on conflict
  do update` or a select-then-update/insert against D1, again swallowing errors.
- Reads (`src/pages/api/comments.ts`, `src/pages/api/reactions.ts`, and the
  rate-limit lookup inside `addCommentHandler`) are untouched — still Turso.

This is intentionally temporary scaffolding deleted in Deploy 2; don't over-build
it (no retry queue, no dead-letter table — proportional to a personal blog).

**4. Tests for the dual-write phase.**
Keep the existing Turso-backed tests in `src/actions/index.test.ts`,
`_comments.test.ts`, `_reactions.test.ts` unchanged (they still exercise the real
Turso path via the libSQL `:memory:` client in `src/test/setup.ts`). Add a
lightweight spy/mock on the D1 mirror call (`vi.mock('../../db/d1-client.js')`)
in `addCommentHandler`/`addLoveHandler` tests to assert the mirror was attempted
with the right values — no need for a second real database in tests for
throwaway scaffolding.

**Deploy 1, bake.** Watch production for a day or more. Spot-check parity with
`wrangler d1 execute francisroylilly --remote --command "select * from Comment
order by id desc limit 5"` against the equivalent Turso query.

## Deploy 2 — flip reads, remove Turso entirely

**5. Final reconciliation.** Re-run the backfill export/import (step 2) to catch
any row that landed only in Turso because of a transient D1 write failure during
the bake period. Diff row counts between Turso and D1 before proceeding.

**6. Consolidate to one schema/client/config** (this is the actual "dupe setup"
cleanup):
- Merge `Comment`/`Reaction` out of `db/schema.ts` into `db/d1-schema.ts`, then
  rename `db/d1-schema.ts` → `db/schema.ts` (replacing the old Turso-only file)
  and `db/d1-client.ts` → `db/client.ts` (replacing the old Turso-only file).
  The unified `db/client.ts` keeps the existing lazy-Proxy pattern from
  `db/d1-client.ts`, but branches on `process.env.VITEST` exactly like the old
  `db/client.ts` did — `:memory:` libSQL for tests (per `blueprint/build-plan.md`
  item 15's own intent to "keep libsql `:memory:` for Vitest"), `env.SUBSCRIBERS_DB`
  D1 binding otherwise. No more `file:.data/local.db` fallback branch — local
  `npm run dev` already runs under the Cloudflare Vite plugin/workerd, so
  `env.SUBSCRIBERS_DB` is populated there the same as in production.
- Delete `drizzle.config.ts` (Turso-only) and rename `drizzle.d1.config.ts` →
  `drizzle.config.ts`, `drizzle/d1/` → `drizzle/` (or just repoint `out` — either
  is fine, keep whichever reads more naturally). Delete the old `drizzle/`
  Turso-only migration folder (superseded; D1 is provisioned from the merged
  migration history).
- Update `src/test/setup.ts` to migrate the merged migration folder against the
  `:memory:` libSQL client, so `Comment`/`Reaction` tests keep running against
  real SQL (real `orderBy`, real autoincrement, real `returning()`) exactly as
  today — this is why the dual-write scaffolding in step 4 didn't need a second
  real test database.
- Update imports in `src/pages/api/comments.ts`, `src/pages/api/reactions.ts`,
  and `src/actions/index.ts` to the single `db/client.js`, and switch the read
  paths (GET handlers, rate-limit lookup, existing-reaction lookup) from the old
  Turso `db` to the new unified `db` (which is now D1-backed in prod).
- Remove the Deploy-1 dual-write mirror code from `addCommentHandler`/
  `addLoveHandler` — there's only one write path again.
- Delete `db/migrate.ts` (D1 migrations apply via `wrangler d1 execute`, not a
  drizzle-orm/libsql migrator against a URL). Convert `db/seed.ts` into a
  `db/seed.sql` file applied the same way as `db/d1-backfill-post-notifications.sql`
  (a live `tsx` script can't hold a D1 binding outside a Worker/Miniflare
  context). Drop the `db:migrate`/`db:seed` npm scripts or repoint them to the
  `wrangler d1 execute` invocations.

**7. Remove Turso entirely:**
- `npm uninstall @libsql/client`.
- Delete `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` from `.dev.vars`, then
  `wrangler secret delete TURSO_DATABASE_URL` / `... TURSO_AUTH_TOKEN` in
  production, then `npm run cf-typegen` to regenerate `worker-configuration.d.ts`
  without them.
- Delete `db/turso-backfill.sql` (or keep as a dated historical record).

**8. Update docs** to match reality: `README.md` ("Two databases today" section),
`AGENTS.md` ("Data access is Drizzle ORM + `@libsql/client` against Turso"),
`blueprint/context/project-overview.md` (data model + secrets list),
`blueprint/context/coding-standards.md`, check off `blueprint/build-plan.md`
item 15.

## Verification

- `npm run test` passes with the merged migrations applied to the `:memory:`
  client — confirms `Comment`/`Reaction` queries (`orderBy`, `limit`, `returning`,
  the rate-limit lookup, the love-increment upsert) behave identically under the
  unified client.
- `npm run build` passes.
- Manually exercise the live site after Deploy 2: post a comment, react with a
  love, refresh, confirm both persist and reads reflect them — then confirm via
  `wrangler d1 execute francisroylilly --remote --command "select count(*) from
  Comment"` that the row landed in D1, not Turso.
- Confirm no remaining references: `grep -ri turso` across the repo should only
  hit historical files you intentionally kept (e.g. a dated backfill SQL file),
  not live code, secrets, or docs.

## Notable files

- `db/client.ts`, `db/d1-client.ts` → unified into one
- `db/schema.ts`, `db/d1-schema.ts` → unified into one
- `drizzle.config.ts`, `drizzle.d1.config.ts` → unified into one
- `drizzle/`, `drizzle/d1/` → unified into one migration history
- `db/migrate.ts`, `db/seed.ts` → replaced by `wrangler d1 execute` + a `.sql` seed file
- `src/actions/index.ts`, `src/pages/api/comments.ts`, `src/pages/api/reactions.ts` → dual-write in Deploy 1, single D1 path in Deploy 2
- `src/test/setup.ts` → migrates the merged folder against `:memory:`
- `.dev.vars`, `wrangler` secrets, `worker-configuration.d.ts` → drop `TURSO_*`
- `README.md`, `AGENTS.md`, `blueprint/context/project-overview.md`, `blueprint/context/coding-standards.md`, `blueprint/build-plan.md` → docs catch-up
