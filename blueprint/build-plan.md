# Build Plan

Shipped features are checked. Unchecked items are the roadmap, in priority
order (carried over from the former `context/current-feature.md` queue).
Run `/overview` to add tracking numbers, then `/feature` for the next unchecked item.

## Your features

Shipped (adopted from an existing codebase):

- [x] 1. **Site scaffold and base layout** - Astro 7, Tailwind v4, BaseLayout/BaseHead, Header with desktop nav + mobile hamburger, Footer
- [x] 2. **Homepage** - hero flip rotator, full "Francis's Story" section, Cards, React timeline island
- [x] 3. **Blog content collection** - `src/content/blog/` (md/mdx) with heroImage + galleryPhotos schema, photo grid in `BlogPost.astro`
- [x] 4. **Updates listing** - `/blog` with client-side search and date-range filter
- [x] 5. **Comments** - Astro Action `addComment` with honeypot, timing check, spam filter, 30s email rate limit; `/api/comments` route
- [x] 6. **Love reactions** - Astro Action `addLove`, `/api/reactions` route
- [x] 7. **Prayers and Support pages, RSS feed, sitemap**
- [x] 8. **Drizzle ORM on Turso** - replaced Astro DB
- [x] 9. **Cloudflare Workers hosting** - replaced Netlify; Workers Builds deploys on push to `main`
- [x] 10. **Vitest unit tests + GitHub Actions** - 17 tests over actions and API routes
- [x] 11. **CaringBridge migration** - all posts, photos (AVIF), 237 comments and reactions imported
- [x] 12. **Git-based CMS** - Pages CMS config with `isPublished` gating everywhere
- [x] 13. **Per-post social preview meta and prerendered blog posts in sitemap**

Roadmap:

- [ ] 14. **Notify subscribers of new blog posts** - `Subscriber` table (single opt-in, token unsubscribe), subscribe form in Footer + `/blog`, `npm run notify -- --slug=<slug>` CLI sending text-only email via Resend batch. Full design already decided: `blueprint/plans/notify-subscribers.md`
- [ ] 15. **Playwright E2E smoke tests** - comment submission, love button, `/blog` listing (use `/tests browser`)
- [ ] 16. **Replace Lucide icons with astro-icon** - `src/components/Cards.astro`
- [ ] 17. **Streamline SEO with astro-seo** - per-page title/description/OG props instead of duplicated meta tags
- [ ] 18. **Loading animation for comments** - cue in `Comments.astro` during initial fetch and post-submit refresh, graceful failure fallback
- [ ] 19. **Migrate Turso to Cloudflare D1** - `drizzle-orm/d1` binding, keep libsql `:memory:` for Vitest, `db/migrate.ts`/`db/seed.ts` become `wrangler d1` commands
