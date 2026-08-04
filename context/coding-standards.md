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

- `.astro` files are server-rendered by default — no directives needed for static content; place styles, frontmatter scripts, and build-time data fetching (within `---` fences) natively in the file, and use explicit file extensions on `.astro` imports
- Prioritize static HTML generation over client-side JS hydration; prefer native HTML/CSS/Tailwind over heavy framework abstractions, and don't add interactive components unless explicitly requested
- Use React only for interactive islands: `client:only="react"` for components needing browser APIs, or `client:load`/`client:visible`/`client:idle` only when a component strictly needs UI state or event listeners
- Fetch data (DB queries, `getCollection`) in frontmatter, not in React components
- Use Astro Actions (`src/actions/index.ts`) for form submissions and mutations
- Use API routes (`src/pages/api/`) when you need specific HTTP status codes, headers, or GET endpoints consumed by client components
- Content collections live in `src/content/`; define schemas in `src/content.config.ts` using the Content Layer API (`defineCollection` + `loader`)

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
