# Francis Roy Lilly

This is a personal site for my son, Francis Lilly, documenting his journey, sharing updates along the way, and transitioning past content from Caring Bridge to a dedicated site.

## Context Files

Read the following to get the full context of the project:

- @context/project-overview.md
- @context/coding-standards.md
- @context/ai-interaction.md
- @context/current-feature.md

## Commands

- **Dev server**: `npm run dev` (runs on http://localhost:4321, in workerd via the Cloudflare Vite plugin)
    - Data access is via Drizzle ORM + `@libsql/client` (see `db/client.ts`), pointed at Turso through env vars — no `--remote` build flag needed (that was an Astro DB requirement, removed with the Drizzle migration).

- **Build**: `npm run build` (production build)
- **Preview**: `npm run preview` (serves the built worker locally through workerd)
- **Test**: `npm run test` (Vitest; `npm run test:watch` to watch)
- **Deploy**: `npm run deploy` — manual escape hatch only. Normal deploys run
  automatically via Cloudflare Workers Builds on push to `main`.

**IMPORTANT:** Do not add Claude to any commit messages