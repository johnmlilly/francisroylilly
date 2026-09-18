# Notify Subscribers of New Blog Posts

## Context

CaringBridge automatically emailed followers when a new update posted. That behavior doesn't exist on the new site yet — content has been fully migrated, but the notification piece hasn't been rebuilt. This plan replicates it: visitors can subscribe with just an email address, and after publishing a post the site owner manually triggers a notification email to all subscribers.

Scale is small (family/friends), so the design favors minimal new infrastructure over a full newsletter platform: no external subscriber-list vendor (Buttondown/Listmonk considered and rejected — see below), no queue/cron, no admin auth system. Everything reuses patterns already in the codebase (Drizzle table alongside `Comment`/`Reaction`, Astro Action alongside `addComment`/`addLove`, one-off `tsx` script alongside `db/seed.ts`/`db/migrate.ts`).

**Decisions locked in with the user:**
- **Email provider: Resend.** Domain already on Cloudflare DNS, so SPF/DKIM verification in the Resend dashboard is a few TXT record adds. Free tier (3k/mo, 100/day) comfortably covers this audience.
- **Subscriber storage: new `Subscriber` table in Cloudflare D1** — not an external platform. Rejected Buttondown (subscriber list lives outside the site, free tier ~100 subscribers) and self-hosted Listmonk (needs its own Postgres + long-running server, doesn't run on Cloudflare Workers — real ops burden for a personal site).
- **Opt-in: double opt-in.** Subscribing writes the row after confirming sub; every email carries a token-based one-click unsubscribe link. Need confirmation-email step.
- **Send trigger: auto based on CI/CD manual one-off CLI script** (`npm run notify -- --slug=<post-slug>`), run by the user after publishing — mirrors `db/seed.ts`. Not a web admin page (no auth system exists).
- **Send mechanism: Resend batch send** — up to 100 distinct `to` addresses per call (individual emails, not BCC), chunked if needed.
- **Form placement: both** — `Footer.astro` (sitewide) and the `/blog` listing page (more prominent CTA where people are actively reading updates). Same underlying component/Action.
- **Email content: text-only** (title, description, link). No hero image — Astro's build-time image pipeline (`imageService: 'compile'`) has no stable pre-build URL for `src/assets/` images from a standalone script, and adding a `public/` copy step was declined.

## Implementation

### 1. Schema — `db/schema.ts`

Add, following the exact conventions of `Comment`/`Reaction`:

```ts
export const Subscriber = sqliteTable('Subscriber', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  unsubscribeToken: text('unsubscribeToken').notNull().unique(),
  isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('createdAt').notNull(),
});
```

**Soft-unsubscribe (`isActive` flag), not row deletion** — re-subscribing just flips the flag back on and reuses the token, and a clicked unsubscribe link stays valid (idempotent) if clicked twice. `email` is DB-level `unique()` as defense-in-depth against duplicate-subscribe races.

Add `Subscriber` to `db/client.ts`'s re-export line alongside `Comment`/`Reaction`.

No `db:generate` script currently exists in `package.json` (only `db:migrate`, which applies migrations, not generates them) — add `"db:generate": "drizzle-kit generate"`. Workflow: edit schema → `npm run db:generate` → review generated SQL under `./drizzle` → `npm run db:migrate`.

### 2. Subscribe UI + Action

New `src/components/SubscribeForm.astro`, modeled on `src/components/CommentsForm.astro` (honeypot field + hidden timestamp + inline `<script>` calling `actions.subscribe(formData)`, same success/error swap pattern) but with a single email field. Accept a prop for a compact (footer) vs. more prominent (blog listing) style variant so one component serves both placements. Embed in `src/components/Footer.astro` and near the top of `src/pages/blog/index.astro`.

New Action in `src/actions/index.ts`:

```ts
const subscribeInput = z.object({
  email: z.string().email('Valid email is required'),
  website: z.string().optional(), // honeypot
  timestamp: z.string(),          // anti-bot timing
});
```

`subscribeHandler` reuses the honeypot + ≥3s timing check from `addCommentHandler` verbatim. Normalizes email (`toLowerCase().trim()`). Upsert semantics: no existing row → insert with `unsubscribeToken: crypto.randomUUID()` (native in both Workers and Node ≥19, no import needed); existing inactive row → flip `isActive` true, reuse token; existing active row → throw `Error('This email is already subscribed.')`. Register as `subscribe: defineAction({ accept: 'form', input: subscribeInput, handler: subscribeHandler })`.

### 3. Unsubscribe route — `src/pages/api/unsubscribe.ts`

New `GET` `APIRoute` (modeled on `src/pages/api/comments.ts`'s shape, but returns HTML per the "prioritize static HTML" standard, not JSON — this is hit directly from an emailed link, not called from site JS):
- No `token` param → 400.
- Unknown token → 404 with a small static HTML message.
- Valid token → set `isActive: false` (no-op if already inactive, so a second click is not an error), return 200 with a small static HTML confirmation.

### 4. Notify CLI script — `db/notify.ts`

Placed in `db/` alongside `seed.ts`/`migrate.ts` (same one-off `tsx` script convention, same direct use of `db/client.ts`).

- Takes `--slug=<post-slug>` from `process.argv`.
- Reads `src/content/blog/<slug>.md` (or `.mdx`) directly off disk with `node:fs` — `astro:content`/`getCollection()` only resolves inside Astro's Vite context, unavailable to a bare `tsx` process. Splits on the `---` frontmatter delimiters and parses the YAML block with `js-yaml` (already a transitive dependency via Astro's toolchain; promote to an explicit `devDependency`) rather than a regex, since `description` is freeform prose that can contain colons/quotes.
- Extracts `title`, `description`, `isPublished`. Aborts with a clear error if the file isn't found or `isPublished` is `false` — never notify about a draft.
- Post URL built from a hardcoded production origin, matching `astro.config.mjs`'s `site: 'https://francisroylilly.com/'` — check `src/consts.ts` (currently holds `SITE_TITLE`/`SITE_DESCRIPTION`/`SITE_LOGO`) and add a `SITE_URL` export there for both `astro.config.mjs` and `db/notify.ts` to share, avoiding duplicating the origin string.
- Queries `db.select().from(Subscriber).where(eq(Subscriber.isActive, true))`; aborts early if none.
- Builds one plain-HTML email body (title + description + "Read the full update" link); the unsubscribe link (`${SITE_URL}api/unsubscribe?token=<subscriber.unsubscribeToken>`) is generated per-recipient inside the batch-building loop.
- Chunks subscribers into groups of 100, calls the Resend `batch.send()` API per chunk with distinct `{ from, to: [subscriber.email], subject, html }` entries (never BCC). Sender/subject: use something like `from: 'Francis Roy Lilly Updates <updates@francisroylilly.com>'` and `subject: `New update: ${title}`` as a starting default — easy to tweak later.
- Logs per-chunk success/failure counts and a final `Sent N of M emails for "<slug>".` summary. No retry logic — a failed send can just be rerun manually.

New `package.json` script: `"notify": "tsx db/notify.ts"`. New dependency: `resend` (runtime, `dependencies`); `js-yaml` (`devDependencies`).

### 5. Secrets/config

Confirmed by reading `db/migrate.ts`: there's no dotenv loader anywhere in this repo — `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are read straight from `process.env`, falling back to a local sqlite file (`file:.data/local.db`) when unset, and `.dev.vars` (gitignored) is the wrangler-only convention, not auto-loaded by plain `tsx`. `RESEND_API_KEY` follows the exact same pattern as the Turso vars for consistency — read via `process.env.RESEND_API_KEY` in `db/notify.ts`, supplied locally the same way the user already gets `TURSO_*` into their shell before running `db:migrate`/`db:seed` against real Turso. No new env-loading mechanism introduced.

Production: only needed as a Worker secret (`wrangler secret put RESEND_API_KEY`) if something inside the deployed app ever calls Resend — the CLI-only design in this plan runs entirely from the developer's machine, so this is not required for the plan as scoped, just noted for completeness.

### 6. Testing (Vitest)

Extend `src/actions/index.test.ts` with a `describe('subscribeHandler', ...)` block: honeypot rejection, timing rejection, valid new subscribe (row inserted, active, token present), duplicate-active-email rejection, re-subscribe of an inactive email (flips flag, reuses token, no duplicate row), email case-normalization.

New `src/pages/api/unsubscribe.test.ts` (modeled on `src/pages/api/comments.test.ts`, using the existing `apiContext()` test helper): missing token → 400; unknown token → 404; valid active token → 200 + `isActive` becomes `false`; already-inactive token clicked again → 200 (idempotent), not an error.

`db/notify.ts` itself is out of scope for Vitest, matching `db/seed.ts` (also untested) — it's a one-off script, not app logic.

## Critical Files

- `db/schema.ts` — add `Subscriber` table
- `db/client.ts` — re-export `Subscriber`
- `db/notify.ts` — new, the CLI send script
- `src/actions/index.ts` — add `subscribeHandler`/`subscribe` action
- `src/pages/api/unsubscribe.ts` — new
- `src/components/SubscribeForm.astro` — new
- `src/components/Footer.astro` — embed form
- `src/pages/blog/index.astro` — embed form
- `src/consts.ts` — add `SITE_URL`
- `package.json` — add `db:generate`, `notify` scripts; add `resend`, `js-yaml` deps

## Verification

1. `npm run db:generate` then `npm run db:migrate` (against local file DB by default) — confirm `Subscriber` table created.
2. `npm run dev`, submit the footer and `/blog` subscribe forms — confirm success message, row inserted, duplicate-email rejection, honeypot/timing rejection (matches existing `Comments` manual-test approach).
3. Visit `/api/unsubscribe?token=<a real token from step 2>` — confirm 200 + `isActive` flips false in DB; click again — confirm still 200, not an error. Visit with a bogus token — confirm 404.
4. Set `RESEND_API_KEY` (and real `TURSO_*` if testing against Turso) in the shell, run `npm run notify -- --slug=<a real published post slug>` — confirm terminal log shows correct subscriber count and success, and check the inbox of a real test subscriber for the email (title/description/link/unsubscribe link all correct).
5. `npm run test` — new Vitest cases pass alongside existing suite.
6. `npm run build` — confirm no type/build errors from the new files.
