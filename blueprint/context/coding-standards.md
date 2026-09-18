# Coding Standards

Conventions for this project as the code actually practices them (Astro 7,
TypeScript, Tailwind v4, React islands, Drizzle on Turso, Cloudflare Workers).

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## Astro

- `.astro` files are server-rendered by default; put styles, frontmatter
  scripts, and data fetching inside the `---` fences. Use explicit file
  extensions on `.astro` imports.
- `output: 'static'`: pages prerender unless they opt out. Anything hitting the
  DB per request (`src/pages/api/*`, `server:defer` islands) sets
  `export const prerender = false`.
- Prioritize static HTML over client JS. Prefer native HTML/CSS/Tailwind over
  framework abstractions; don't add interactive components unless asked.
- React only for interactive islands: `client:only="react"` when browser APIs
  are needed, else `client:load`/`client:visible`/`client:idle` only when the
  component genuinely needs UI state or listeners.
- Fetch data (DB queries, `getCollection`) in frontmatter, not in React.
- Astro Actions (`src/actions/index.ts`) for form submissions and mutations.
  Validate with Zod via `astro:schema`.
- API routes (`src/pages/api/`) when you need specific status codes, headers,
  or GET endpoints consumed by client code.
- Content collections live in `src/content/`; schemas in `src/content.config.ts`
  (Content Layer API: `defineCollection` + `loader`). Every public read of blog
  posts filters on `isPublished`.
- Images go through `src/assets/` and Astro's `<Image>`; `imageService:
  'compile'` means only prerendered routes get optimized output.

## React

- Functional components only, hooks for state and effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## File Organization

- Pages: `src/pages/[route].astro` (dynamic: `src/pages/blog/[...slug].astro`)
- Layouts: `src/layouts/`
- Components: `src/components/ComponentName.astro` (React islands `.tsx`/`.jsx`)
- Actions: `src/actions/index.ts`
- API routes: `src/pages/api/[name].ts`
- DB: `db/schema.ts`, `db/client.ts`, `db/migrate.ts`, `db/seed.ts`, one-off
  scripts alongside them (`tsx`)
- Content: `src/content/blog/`, images `src/assets/blog/`
- Site constants: `src/consts.ts`
- Tests: next to source (`index.test.ts`), API tests `_name.test.ts`

## Naming

- Components: PascalCase (`ItemCard.astro`)
- Files: match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS v4 for all styling, CSS-first config: `@theme` in
  `src/styles/global.css`. No `tailwind.config.*` file.
- Shared utilities (`.pull-quote`, `.hero-quote`) live in `global.css`
- No inline styles except computed keyframes emitted via `<style is:inline>`

## Database

- Drizzle ORM for all DB access; schema `db/schema.ts`, client `db/client.ts`
- Client is built lazily (Workers only populate `process.env` per request);
  uses Turso when `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are set, a local
  SQLite file otherwise, in-memory under Vitest
- Schema changes: edit `db/schema.ts`, run `npm run db:migrate`
- Seed data in `db/seed.ts`

## Data Fetching

- `.astro` frontmatter queries directly with `db.select()`
- Client code uses Astro Actions or fetches API routes
- Validate all inputs with Zod

## Error Handling

- try/catch in Actions; return `{ success, data, error }`
- User-friendly messages in the form's inline status area

## Testing

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding (this project): Vitest is configured (`npm run test`), so the
gate is on. `vitest.config.ts` uses Astro's `getViteConfig()`; `db/client.ts`
switches to an in-memory SQLite DB under `VITEST`, so tests never touch Turso.
API-route tests are named `_name.test.ts` (underscore prefix keeps Astro from
treating them as routes under `output: 'static'`). Helpers in `src/test/`.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- Browser automation is separately opt-in through `/tests browser`. That setup
  reuses a compatible runner or prefers Playwright for supported projects, then
  documents the exact command as `Browser tests` in `AGENTS.md`.
- When `Browser tests` is declared, add focused coverage for stable behavioral
  done-whens when it is proportionate, and run the documented command during
  `/check`. Do not assume it proves visual fidelity, real authenticated-profile
  behavior, browser chrome, or another claim the test does not observe.
- If no Browser tests command is declared, do not add a runner silently in the
  middle of an unrelated feature. Use the available dev server, browser
  screenshots, build output, API output, or manual evidence instead.
- Browser tests are not part of the default Verify command or CI unless the user
  separately chooses that slower gate.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
- Make minimal changes; don't refactor unrelated code unless asked
- Never delete files without asking

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
