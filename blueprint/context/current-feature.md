# Fix: Adopt fallow and clear its findings

**Type:** Fix
**Status:** verified
**Branch:** `claude/fallow-code-quality-9g5b6e`

> Retroactive spec, written 2026-09-23 after the work was already built and
> committed. The build steps record what landed, not what was planned. The
> branch predates this spec and therefore does not use the configured `fix/`
> prefix; it was left alone because PR #31 already tracks it.
>
> Revised 2026-09-23 after an independent review found the first draft covered
> only the last four of the branch's nine commits (F-16). The tooling adoption
> in Step 0 is now specced, because it merges to `main` with this PR.

## The problem

Two problems, one branch.

First, the branch had no static analysis. Dead files, unused exports and
dependencies, duplicated blocks, and complexity drift were invisible unless
someone noticed them by hand.

Second, once fallow was installed it reported 14 dead-code issues, 4 clone
groups, and 1 complexity finding, and none of it was fixed. PR #31's body says
so explicitly. None of it blocked a commit, because the audit gate runs
`gate=new-only` and every finding was inherited, but a permanently red baseline
means a genuinely new finding is indistinguishable from the existing noise.

Reviewed against the code, the report split three ways: real defects, false
positives from detectors that do not follow Astro templates or build config, and
findings whose fix would cost more than the duplication it removed.

## The fix

### Tooling (Step 0, built before this spec existed)

Five commits, `16cecbe` through `0ea1f2f`, none of which exist on `main`:

- `fallow` as a devDependency (pinned in `package-lock.json` at 3.27.0 with its
  `fallow`, `fallow-lsp` and `fallow-mcp` bins) plus an `npm run analyze` script.
- `.fallowrc.json`, initially only to exclude the wrangler-generated
  `worker-configuration.d.ts` from duplicate detection.
- `.mcp.json`: registers `fallow-mcp` over stdio so an agent session can query
  fallow directly instead of shelling out.
- `.claude/settings.json` plus `.claude/hooks/fallow-gate.sh` (171 lines): a
  `PreToolUse` hook on `Bash` that intercepts agent-run `git commit` and
  `git push` and runs `fallow audit` against the changeset. It resolves fallow
  from PATH, `node_modules/.bin`, yarn, then `npx --no-install`, and **exits 0
  when it finds none**, so the gate is advisory rather than enforcing on a
  checkout whose `node_modules` is stale.
- `.claude/skills/fallow/`: the agent skill written by `fallow agent install`.
  `SKILL.md` is a 35-line pointer that tells an agent to read the full skill
  from the installed package and to resolve flags from `fallow --help` rather
  than from memory; `agents/openai.yaml` carries the display name and default
  prompt for tools that read that format. Both are instructions for agents, not
  code the site runs.
- `.github/workflows/fallow.yml`: runs `fallow audit` on pull requests and
  pushes to `main`, with `continue-on-error: true` and `fail-on-issues: false`,
  so it comments on the PR and never blocks a merge.
- `AGENTS.md`: the fallow task map and the local commit-gate instruction.

Acceptance for that work: `npx fallow` runs against this project and its
`.fallowrc.json` is honored; the workflow runs on the PR without failing it; the
hook never blocks a legitimate commit.

### Cleanup (Steps 1-4)

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
   `test-only-dependencies` is off because the five build integrations are
   imported only by `astro.config.mjs`; `unused-component-props` is off for
   `HeroFlip.astro` because `alt` is used at line 53 in a template expression the
   React detector does not follow; the `eq` re-export pair and the
   confirm/unsubscribe token blocks were reviewed and deliberately kept.

### Review repairs (Step 5)

Pin the third-party action to a commit and correct one inaccurate config
comment, both raised by the independent review.

### Security fix (Step 6)

The second independent review found that `GET /api/comments` answered with
`db.select()` and no column list, so every response carried the `Comment`
table's `notNull` `email` column (F-19, P1). The route is unauthenticated,
`prerender = false`, and post slugs are public through the sitemap and RSS, so
any commenter's address could be read by requesting a slug. The same review
found that comment text reached `innerHTML` unescaped in the client refresh
path, defended only by a single-pass tag strip that an unterminated tag such as
`<img src=x onerror=...` slips through (F-20, P1).

Both are inherited, not introduced by this branch, and both live in the code
this branch touched.

The fix removes the routes rather than narrowing them. Neither endpoint is
needed: `Comments.astro` renders `CommentsList` and `ReactionsButton` with
`server:defer`, so both islands are rendered per request in the Worker and
already show current data on every page view. The two public GET routes existed
only to redraw after a submission, and the actions can return what the browser
needs.

- Delete `src/pages/api/comments.ts` and `src/pages/api/reactions.ts` with their
  tests. No route, no response, nothing to harvest.
- `addCommentHandler` projects its `returning()` to id, postSlug, name, message
  and createdAt, so the action never hands an email to a browser either.
  `addLoveHandler` returns the new `loves` count instead of `{ success: true }`.
- `CommentsForm.astro` passes the returned row on the `commentAdded` event;
  `CommentsList.astro` builds the new comment with `createElement` and
  `textContent` and prepends it. That removes the `innerHTML` sink rather than
  escaping around it.
- Every remaining read of `Comment` and `Reaction` names its columns, so adding
  a column can never silently widen a response again.
- `requirePostSlug` in `src/lib/http.ts` loses both consumers with the routes and
  goes with them. `json()` stays for `notify.ts`. Step 2's deduplication of
  those two routes is therefore partly dissolved by Step 6: the duplicated code
  is gone rather than shared.

Must not break: every API response body, status code, and header; the notify
send semantics, including recording `PostNotification` regardless of partial
send failure so a rerun never double-sends; the rendered appearance of
`.pull-quote` on the home page.

Deliberately not done: the drizzle `eq`/`desc` re-export consolidation (user
decision, 2026-09-22), a shared helper for the confirm/unsubscribe token blocks,
and any change to the unit-size threshold for Astro templates.

## Build steps

- [x] **Step 0 - Adopt fallow** *(`16cecbe`, `7222115`, `ac8e713`, `0ec884a`,
  `0ea1f2f`; built in an earlier session, specced retroactively)* - devDependency,
  `npm run analyze`, `.fallowrc.json`, MCP registration, the `.claude/skills/fallow/`
  agent skill, `PreToolUse` commit gate, non-blocking GitHub workflow, AGENTS.md
  task map. *Done when:* `npx fallow` runs and honors the config, and the
  workflow reports on the PR without failing it.
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
- [x] **Step 5 - Review repairs** *(F-16, F-17, F-18)* - pin
  `fallow-rs/fallow` to `bd8fca5af5df4ccfd94c7a835d17bd93c31a7cef` (v3.28.0)
  instead of the mutable `v3` tag, since that job holds `pull-requests: write`;
  correct the `test-only-dependencies` comment, which claimed `astro.config.mjs`
  was the only importer of `@astrojs/*` while `src/pages/rss.xml.js:2` imports
  `@astrojs/rss` from production code; extend this spec to cover Step 0.
  *Done when:* the workflow references a 40-character SHA, the comment names the
  five config-only packages, and `npx fallow` still exits 0.
- [x] **Step 6 - Close the comment PII leak and the innerHTML sink** *(F-19,
  F-20)* - delete both public GET routes and their tests, project the actions'
  return values and every remaining `Comment`/`Reaction` read, render the new
  comment through `textContent`, drop the now-unused `requirePostSlug`.
  *Done when:* no route under `src/pages/api/` reads the `Comment` or `Reaction`
  tables, `grep -rn "innerHTML" src/components/CommentsList.astro` returns
  nothing, `addCommentHandler`'s result has no `email` property while the stored
  row still does, and build and tests pass.
- [x] **Step 7 - Second-review cleanups** *(F-21, F-22)* - cover
  `.claude/skills/fallow/` in Step 0, correct the AGENTS.md gate instruction to
  name `.fallowrc.json` instead of `fallow.toml`, and delete
  `src/test/helpers.ts`, which only built the request context for the two route
  tests removed in Step 6. *Done when:* `npx fallow` reports no unused files and
  AGENTS.md no longer mentions `fallow.toml`.

## Verify

1. `npm run build` passes.
2. `npm run test` passes: 8 files, 74 tests. The count moved twice: step 3 added
   6, and step 6 removed the two route test files (12 tests) along with the
   routes they covered.
3. `npx fallow` exits 0: dead code 0, duplication 0, complexity 0 above
   threshold, maintainability 94.3.
4. `npx fallow audit --format json --quiet --explain --gate-marker agent`
   returns verdict `pass` with 0 introduced findings.
5. Home page renders `.pull-quote` unchanged (two blockquotes in the about
   section of `/`), served from `global.css` instead of the page's scoped style.
6. `grep -n "fallow-rs/fallow@" .github/workflows/fallow.yml` shows a 40-character
   commit SHA with the version in a trailing comment.
7. `curl -s "$SITE/api/comments?postSlug=<any-published-slug>"` returns 404 on
   the deployed site, and no response anywhere contains a commenter email. Post
   a comment on a published post: it appears in the list immediately, and a
   reload shows it served by the island.
8. Click the heart on a published post: the count increments with no request to
   `/api/reactions`, and a reload shows the new count.

## Known deviations

- The branch name predates this spec and does not use the configured `fix/`
  prefix. PR #31 already tracks `claude/fallow-code-quality-9g5b6e`, so renaming
  it would orphan the pull request.
- The work landed as several commits instead of one, because it was built before
  it was specced.
- Commit `dc107f7`'s message body contains an em dash, which
  `blueprint/context/coding-standards.md:187` forbids in generated content. The
  code delta itself is clean. User decision (2026-09-23): leave the history
  unrewritten rather than rebase commits that were already made.

## Known issue, not fixed here

`npm run analyze` fails on this machine with `sh: fallow: command not found`.
The repository is correct: `package-lock.json` pins `fallow@3.27.0` with its
bins, so `npm ci` installs it. Only the local `node_modules` is stale (a stray
`node_modules 2` directory sits beside it). Until that is resolved locally,
`.claude/hooks/fallow-gate.sh` finds no fallow and exits 0, so the AGENTS.md
commit gate is advisory in this checkout, and every fallow signal recorded here
came from `npx fallow` 3.28.0 instead.
