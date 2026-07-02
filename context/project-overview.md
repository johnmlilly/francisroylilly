## Francis Roy Lilly — Project Overview

Sharing updates, progress, and the journey of how God saved my son.

---

## Purpose

Personal site documenting the journey of Francis Roy Lilly, a baby who survived a severe brain injury (HIE) at birth. Shares ongoing updates with family and friends, hosts a photo blog, and serves as a permanent home for content originally on CaringBridge.

---

## Tech Stack

| Category    | Choice                                    |
| ----------- | ----------------------------------------- |
| Framework   | Astro 6 (SSR, server output)              |
| Language    | TypeScript (strict)                       |
| UI          | Tailwind CSS v4 + React 19 (islands)      |
| Database    | Astro DB (Turso/libSQL) via `@astrojs/db` |
| Auth        | None (public site)                        |
| File Assets | `src/assets/` (Astro image optimization)  |
| Deployment  | Netlify (via `@astrojs/netlify` adapter)  |

---

## Data Model

```ts
Comment {
  id: number (PK)
  postSlug: text
  name: text
  email: text
  message: text
  createdAt: date
}

Reaction {
  id: number (PK)
  postSlug: text
  loves: number (default 0)
}
```

---

## Content Model

Blog posts in `src/content/blog/` (.md or .mdx). Frontmatter schema:

```ts
{
  title: string
  description: string
  pubDate: Date
  author: string
  heroImage?: ImageMetadata        // used on homepage timeline
  galleryPhotos?: ImageMetadata[]  // renders grid in blog post
}
```

Images go in `src/assets/blog/`. The `BlogPost` layout auto-renders a 1/2/3-column photo grid based on `galleryPhotos.length`.

---

## Key Pages

| Route          | Description                                  |
| -------------- | -------------------------------------------- |
| `/`            | Hero photo, Francis's story, cards, timeline |
| `/blog/`       | Reverse-chronological post list              |
| `/blog/[slug]` | Individual post with gallery + comments      |
| `/prayers`     | Prayer page                                  |
| `/support`     | Support/donate page                          |
| `/rss.xml`     | RSS feed                                     |

---

## Interactive Features

- **Comments** — Astro Action (`addComment`) with honeypot, timing check, spam filter, 30s email rate limit
- **Reactions** — Love button per post via Astro Action (`addLove`), count stored in DB
- **Timeline** — React island (`client:only="react"`) on homepage, receives pre-optimized image data from server

---

## Dev Workflow Notes

- User runs the dev server (`npm run dev`) — do not run it automatically
- User handles all commits and merges — do not commit or merge, even when asked to close out a feature

---

## Status

Active — live at https://francisroylilly.com
