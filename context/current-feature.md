# Current Feature

<!-- Feature Name -->
## Astro 7 Upgrade

## Status

Up Next

## Context

Branch 2 of 2 (after Drizzle ORM migration — merged, see History). App now runs on Drizzle + `@libsql/client` instead of `astro:db`, so the DB layer is no longer a blocker for this bump.

## Goals / Steps

1. Bump `astro` to `^7`, plus `@astrojs/netlify`, `@astrojs/react`, `@astrojs/mdx`, `@astrojs/sitemap`, `@tailwindcss/vite` to Astro-7-compatible majors
2. Rust compiler now mandatory + strict HTML validation — build will fail on unclosed/invalid tags, fix any newly-surfaced markup errors
3. `compressHTML` default changed `true` → `'jsx'` — check spacing around inline elements (nav links, footer, pull-quote), may need `{" "}` fixes
4. Vite 8 — confirm `@tailwindcss/vite` plugin version supports it before bumping
5. Sätteri replaces remark/rehype as default markdown processor — no remark/rehype plugins currently configured, low risk, but re-check blog `.md`/`.mdx` posts render identically
6. Confirm no file named `src/fetch.ts` (none currently — filename now reserved)
7. Verify & ship: `npm run build`, `npm run lint`, manual browser pass — homepage, blog post w/ gallery, comments, reactions, RSS

## Upcoming Features (Queue)

(empty)

---

## Hero Restyle

## Status

Completed

## Goals

- Keep "Hi there! I'm Francis" text
- Remove frosted glass / backdrop-blur box
- Replace with cleaner treatment: semi-transparent white pill OR text-shadow only
- Add subtle gradient overlay at bottom of hero image for depth (`transparent → rgba(0,0,0,0.3)`)
- File: `src/pages/index.astro`

## Notes

Current hero overlay uses `backdrop-filter: blur(6px)` + `rgba(255,255,255,0.5)` background. Feels generic. Goal is something warmer and cleaner that lets the photo breathe.

## Upcoming Features (Queue — Archived)

2. Hero restyle — remove frosted glass blur, keep "Hi there! I'm Francis", cleaner overlay treatment
3. About section — narrow prose to 720px, style "But God had other plans." as pull quote
4. Cards redesign + re-enable — uncomment `<Cards />`, gold buttons, better image treatment, "Walk With Us" heading
5. Footer redesign — purpose tagline, nav links, copyright
6. Pull quote utility — add `.pull-quote` to `global.css`

## History

<!-- Keep this updated. Earliest to latest -->
- **Desktop Navigation** — Added inline nav links on desktop (≥768px); hamburger retained for mobile. `src/components/Header.astro`
- **Hero Restyle** — Replaced full-bleed background image with side-by-side layout (text left, photo right); warm gradient background; stacks on mobile. `src/pages/index.astro`
- **Cards Redesign** — Replaced images with Lucide icons, added "Walk With Us" heading, gold CTA buttons, re-enabled on homepage. `src/components/Cards.astro`
- **Footer Redesign** — Added site name, tagline, nav links, copyright. Slate blue background. `src/components/Footer.astro`
- **About Section** — Added dedicated About section between hero and timeline, prose narrowed to 720px, "But God had other plans." styled as bold pull quote, hero slimmed to greeting + CTA. PR #3. `src/pages/index.astro`
- **Pull Quote Utility** — Added `.pull-quote` utility class to `global.css` for reuse across pages. PR #6. `src/styles/global.css`
