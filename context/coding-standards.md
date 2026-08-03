# Coding Standards

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## Astro

### Core Principles

- Prioritize static HTML generation over client-side JavaScript hydration
- Do not add interactive client-side components unless explicitly requested
- Use native HTML elements and CSS/Tailwind instead of heavy framework abstractions

### Astro Code Rules

- `.astro` files are server-rendered by default — no directives needed for static content
- Component Structure: place styles and frontmatter scripts natively inside `.astro` files
- Component Imports: always use explicit file extensions for `.astro` file imports
- Use React only for interactive islands; add `client:only="react"` when the component uses browser APIs or can't hydrate server-side
- Island Architecture: only use `client:load`, `client:visible`, or `client:idle` directives when a component strictly requires UI state management or event listeners — don't ship a "SPA-shaped JavaScript blob" by default
- Use Astro Actions (`src/actions/index.ts`) for form submissions and mutations
- Use API routes (`src/pages/api/`) when you need specific HTTP status codes, headers, or GET endpoints consumed by client components
- Fetch data (DB queries, `getCollection`) directly in the frontmatter of `.astro` files, within `---` code fences — not in React components
- Content collections live in `src/content/`; define schemas in `src/content.config.ts` using the Content Layer API (`defineCollection` + `loader`) for local and remote datasets

## Tailwind CSS v4

**CRITICAL**: We are using Tailwind CSS v4, which uses CSS-based configuration.

- **DO NOT** create `tailwind.config.ts` or `tailwind.config.js` files (those are for v3)
- All theme configuration must be done in CSS using the `@theme` directive in `src/app/globals.css`
- Use CSS custom properties for colors, spacing, etc.
- No JavaScript-based config allowed

Example v4 configuration:

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(50% 0.2 250);
}
```

## File Organization

- Components: `src/components/[feature]/ComponentName.tsx`
- Pages: `src/app/[route]/page.tsx`
- Server Actions: `src/actions/[feature].ts`
- Types: `src/types/[feature].ts`
- Lib/Utils: `src/lib/[utility].ts`

## Naming

- Components: PascalCase (`ItemCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS for all styling

## Database

- Use Drizzle ORM for all database operations — schema in `db/schema.ts`, client in `db/client.ts`
- Client uses Turso if `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are set, else a local SQLite file
- Seed data in `db/seed.ts`
- Schema changes: edit `db/schema.ts`, run `npm run db:migrate`

## Data Fetching

- `.astro` frontmatter fetches directly via `db.select()` from `db/client.ts` (Drizzle)
- Client components use Astro Actions or fetch from API routes
- Validate all inputs with Zod (via `astro:schema` in actions)

## Error Handling

- Use try/catch in Server Actions
- Return `{ success, data, error }` pattern from actions
- Display user-friendly error messages via toast

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
