# Francis Roy Lilly

This is a personal site for my son, Francis Lilly, documenting his journey, sharing updates along the way, and transitioning past content from Caring Bridge to a dedicated site.

## Context Files

Read the following to get the full context of the project:

- @context/project-overview.md
- @context/coding-standards.md
- @context/ai-interaction.md
- @context/current-feature.md

## Commands

- **Dev server**: `npm run dev` (runs on http://localhost:4321)
    - `build` uses `astro build --remote` — it connects to the remote Astro DB (Turso). Local dev uses a local SQLite DB automatically.
 
- **Build**: `npm run build` (production build (requires --remote for Astro DB)
- **Production server**: `npm run start`
- **Lint**: `npm run lint`

**IMPORTANT:** Do not add Claude to any commit messages