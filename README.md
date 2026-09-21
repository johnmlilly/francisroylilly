# Francis Roy Lilly

Personal site for Francis Lilly, documenting his journey after a severe brain
injury (HIE) at birth. Permanent, ad-free replacement for CaringBridge: the
full story, past updates migrated with photos, and new updates posted the
same way.

Live at [francisroylilly.com](https://francisroylilly.com).

## What it does

- **Homepage** - hero photo rotator, Francis's story, a React timeline of posts
- **Updates** (`/blog`) - reverse-chronological list with search and date filter; each post has a photo gallery, comments, a love button, and a share button
- **Subscriptions** - double opt-in email notifications for new posts, with token confirm/unsubscribe links (see [`blueprint/references/subscription-flow.md`](blueprint/references/subscription-flow.md) for the full flow)
- **Prayers and Support pages, RSS feed, sitemap**
- Content is authored through a git-based CMS ([Pages CMS](https://pagescms.org/)) against `src/content/blog/`, not through the app

## Tech stack

| Category | Choice |
| --- | --- |
| Framework | [Astro 7](https://astro.build) - `output: 'static'` with on-demand API routes |
| Language | TypeScript (strict) |
| UI | Tailwind CSS v4 (CSS-first config) + React 19 islands |
| Database | Drizzle ORM against Turso (libSQL) and Cloudflare D1 |
| Email | [Resend](https://resend.com) |
| Testing | Vitest; GitHub Actions runs tests + build on PRs |
| Hosting | Cloudflare Workers (`@astrojs/cloudflare`); DNS on Cloudflare |

Two databases today: Turso holds `Comment`/`Reaction`, and a Cloudflare D1
database holds `Subscriber`/`PostNotification`. Migrating everything onto D1
is a planned follow-up.

## Project structure

```text
├── db/                  # Drizzle schemas and clients (Turso + D1)
├── drizzle/              # generated SQL migrations
├── emails/                # Resend email templates
├── src/
│   ├── actions/            # Astro Actions (comments, reactions, subscribe)
│   ├── components/
│   ├── content/blog/       # blog posts (md/mdx)
│   ├── layouts/
│   ├── lib/                 # pure logic behind the API routes
│   └── pages/
│       └── api/              # on-demand routes (comments, notify, confirm, ...)
├── blueprint/              # project plans, standards, and history (AI Blueprint workflow)
├── astro.config.mjs
└── wrangler.jsonc
```

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Local dev server at `localhost:4321` (workerd via the Cloudflare Vite plugin) |
| `npm run build` | Production build |
| `npm run preview` | Preview the built worker locally |
| `npm run test` | Run the Vitest suite |
| `npm run db:migrate` / `npm run db:seed` | Turso migrations and seed data |
| `npm run db:d1:generate` | Generate a D1 migration from `db/d1-schema.ts` |
| `npm run deploy` | Manual deploy escape hatch |

Normal deploys run automatically via Cloudflare Workers Builds on push to
`main`.

## Contributing

Work here follows the [AI Blueprint](https://ai-blueprint.dev) workflow: plans
and standards live under `blueprint/`, and `AGENTS.md` is the entry point for
project conventions and commands.
