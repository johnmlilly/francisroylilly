# Current Feature

<!-- Feature Name -->
## Footer Redesign

## Status

Up Next

## Goals

- Purpose tagline
- Nav links
- Copyright

## Upcoming Features (Queue)

5. Footer redesign — purpose tagline, nav links, copyright
6. Pull quote utility — add `.pull-quote` to `global.css`
7. About section — PR #3 open

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
