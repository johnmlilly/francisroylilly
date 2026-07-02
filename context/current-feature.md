# Current Feature

<!-- Feature Name -->
## Desktop Navigation in Header

## Status

Completed

## Goals

- Show nav links inline on desktop (≥768px): Home · Updates · Prayers · Support
- Hide inline links on mobile, show hamburger instead (existing hamburger behavior stays)
- File: `src/components/Header.astro`

## Notes

Currently the header is hamburger-only on all screen sizes. Nav links are only accessible via the dropdown. On desktop, users should see the nav links immediately without any interaction.

## Upcoming Features (Queue)

2. Hero restyle — remove frosted glass blur, keep "Hi there! I'm Francis", cleaner overlay treatment
3. About section — narrow prose to 720px, style "But God had other plans." as pull quote
4. Cards redesign + re-enable — uncomment `<Cards />`, gold buttons, better image treatment, "Walk With Us" heading
5. Footer redesign — purpose tagline, nav links, copyright
6. Pull quote utility — add `.pull-quote` to `global.css`

## History

<!-- Keep this updated. Earliest to latest -->
- **Desktop Navigation** — Added inline nav links on desktop (≥768px); hamburger retained for mobile. `src/components/Header.astro`
