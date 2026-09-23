# Fix: Fallow code quality cleanup

**Type:** Fix
**Status:** verified
**Branch:** `claude/fallow-code-quality-9g5b6e`

> Retroactive spec, written 2026-09-23 after the work was already built and
> committed in the same session. The build steps below record what landed, not
> what was planned. The branch predates this spec and therefore does not use the
> configured `fix/` prefix; it was left alone because PR #31 already tracks it.

## The problem

`npx fallow` reported 14 dead-code issues, 4 clone groups, and 1 complexity
finding against the branch that introduced fallow itself (PR #31, whose body
says the findings were surfaced but not fixed). None of it blocked a commit,
because the audit gate runs `gate=new-only` and every finding was inherited,
but a permanently red baseline means a genuinely new finding is indistinguishable
from the existing noise.

Reviewed against the code, the report split three ways: real defects, false
positives from detectors that do not follow Astro templates or build config, and
findings whose fix would cost more than the duplication it removed.

## The fix

Four parts, in the order they were applied.

1. **Dead code.** Delete `src/components/PhotoGallery.astro` (411 lines, no
   importer, orphaned when the carousel was swapped for the lightbox in
   `5b6a74c`), drop `react-image-gallery` and `prop-types`, remove the unused
   `SITE_LOGO` const (`Header.astro` imports the SVG asset directly) and the
   unused `desc` re-export in `db/d1-client.ts`. User approved the file
   deletion before it was made.
2. **Duplication.** Add `src/lib/http.ts` with `json(body, status)` and
   `requirePostSlug(url)`, then rewire `src/pages/api/comments.ts`,
   `reactions.ts`, and `notify.ts` (which carried its own private `json`).
   `requirePostSlug` returns `{ postSlug } | { error: Response }` so the 400
   cannot be skipped by accident. Delete the duplicate `.pull-quote` block from
   `src/pages/index.astro`; `global.css` already defines byte-identical rules and
   loads on every page through `BaseHead.astro`.
3. **Complexity.** `POST /api/notify` measured cognitive 20 against a threshold
   of 15. Move the per-post email rendering and the chunked send loop into
   `src/lib/notify.ts` as `buildNotificationEmails` and `sendInBatches`, leaving
   the route its D1 reads and writes. Both are now covered directly.
4. **Config.** Record the reviewed exceptions in `.fallowrc.json`, each with its
   reason: `sharp` is needed by `imageService: 'compile'` at build time;
   `test-only-dependencies` is off because `astro.config.mjs` is the only
   importer of the build integrations; `unused-component-props` is off for
   `HeroFlip.astro` because `alt` is used at line 53 in a template expression the
   React detector does not follow; the `eq` re-export pair and the
   confirm/unsubscribe token blocks were reviewed and deliberately kept.

Must not break: every API response body, status code, and header; the notify
send semantics, including recording `PostNotification` regardless of partial
send failure so a rerun never double-sends; the rendered appearance of
`.pull-quote` on the home page.

Deliberately not done: the drizzle `eq`/`desc` re-export consolidation (user
decision, 2026-09-22), a shared helper for the confirm/unsubscribe token blocks,
and any change to the unit-size threshold for Astro templates.

## Build steps

- [x] **Step 1 - Dead code** *(`dc107f7`; build and 74 tests pass)* - delete
  `PhotoGallery.astro`, drop `react-image-gallery` and `prop-types`, remove
  `SITE_LOGO` and the `desc` re-export, refresh the lockfile. *Done when:*
  fallow reports 0 unused files and 0 unused exports.
- [x] **Step 2 - Duplication** *(`25759e7`; build and 74 tests pass)* - add
  `src/lib/http.ts`, rewire the three API routes, delete the duplicate
  `.pull-quote` rules. *Done when:* the existing route tests still assert the
  same 400 and 200 payloads with no edits, and the clone group for
  `comments.ts`/`reactions.ts` is gone.
- [x] **Step 3 - Complexity** *(`84b5022`; build and 80 tests pass)* - extract
  `buildNotificationEmails` and `sendInBatches` into `src/lib/notify.ts` with 6
  new tests. *Done when:* fallow reports 0 functions above threshold.
- [x] **Step 4 - Config** *(`f559e34`; build and 80 tests pass)* - record the
  five reviewed exceptions in `.fallowrc.json` with inline reasons. *Done when:*
  `npx fallow` exits 0 with no findings in any section.

## Verify

1. `npm run build` passes.
2. `npm run test` passes: 10 files, 80 tests (74 before this work, 6 added in
   step 3).
3. `npx fallow` exits 0: dead code 0, duplication 0, complexity 0 above
   threshold, maintainability 94.3.
4. `npx fallow audit --format json --quiet --explain --gate-marker agent`
   returns verdict `pass` with 0 introduced findings.
5. Home page renders `.pull-quote` unchanged (two blockquotes in the about
   section of `/`), served from `global.css` instead of the page's scoped style.

## Known deviations

- The branch name predates this spec and does not use the configured `fix/`
  prefix. PR #31 already tracks `claude/fallow-code-quality-9g5b6e`, so renaming
  it would orphan the pull request.
- The work landed as four commits instead of one, because it was built before it
  was specced.
- Commit `dc107f7`'s message body contains an em dash, which
  `blueprint/context/coding-standards.md:187` forbids in generated content. The
  code delta itself is clean. User decision (2026-09-23): leave the history
  unrewritten rather than rebase commits that were already made.

## Known issue, not fixed here

`npm run analyze` fails with `sh: fallow: command not found`. `fallow` is in
`devDependencies` but is not installed under `node_modules`, and a stray
`node_modules 2` directory sits beside it. Every fallow command in this work ran
through `npx fallow` (3.28.0). Fixing it means `npm install`, which rewrites the
lockfile, so it was left for a separate change.
