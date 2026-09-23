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


<!-- blueprint:completion {"schemaVersion":1,"specBytes":13282,"specSha256":"422d6c383551a63d066e138a9ae1618a5fa5e5e11f31d375667f1fe4a8ee9b2b","branch":"refs/heads/claude/fallow-code-quality-9g5b6e","head":"7601401796a4eff399ec27e27d0775eaaa26f1de","baseRef":"refs/heads/main","baseCommit":"6e139d583cc6b9ec2d5cdc2d549d4e1bedc8a3fa","sourceTree":"09b908531ea0d08f02596eafdfd0cda4f2b20387","absentOptional":[]} -->

## Findings

### adopt-fallow-and-clear-its-findings/F-16 [P2] closed - Half the branch delta installs fallow tooling that the spec never describes and that merges to main with this PR

**File:** blueprint/context/current-feature.md:27-52 (the tooling: .claude/settings.json:1-16, .claude/hooks/fallow-gate.sh:1-171, .mcp.json:1-12, .github/workflows/fallow.yml:1-25, .claude/skills/fallow/SKILL.md, AGENTS.md:319-350, package.json:15)
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** The review delta is nine commits, not four. The five commits before `dc107f7` (`16cecbe`, `7222115`, `ac8e713`, `0ec884a`, `0ea1f2f`) install fallow itself, and `git cat-file -e main:<path>` confirms every one of those files is absent from `main`. The spec's "The problem" cites them as prior context ("the branch that introduced fallow itself (PR #31)") while "Known deviations" confirms PR #31 *is* this branch, so the spec describes the cleanup but not the tooling that ships alongside it. What merges unspecced: a CI workflow, a `PreToolUse` hook that runs a shell script on every agent Bash call, an MCP server registration, a new devDependency, and an `AGENTS.md` policy block telling every agent to gate commits on fallow. None of it has acceptance criteria, none of it appears in the Verify list, and `/complete` will archive a history record that reads as a four-step code cleanup. A later reader auditing how a CI workflow or an agent hook entered the repo finds no reviewed decision behind it.
**Suggested fix:** Extend "The fix" with a fifth part describing the fallow installation (the eight paths above), add the matching "Must not break" and Verify entries, and note in Known deviations that the tooling commits predate the spec for the same reason the cleanup commits do. Spec-only change; no code moves. No current requirement is lost.
**Resolution:** Spec retitled "Adopt fallow and clear its findings" and given a "Tooling (Step 0)" section covering the devDependency and `npm run analyze`, `.fallowrc.json`, the `.mcp.json` registration, the `PreToolUse` gate and its fail-open behavior, the non-blocking workflow, and the AGENTS.md task map, plus a checked Step 0 listing the five commits and its acceptance. A revision note records why the first draft missed them. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: re-reviewed the spec at `5a7266f` against the delta. Step 0 now names six of the seven tooling paths this finding listed, plus `.fallowrc.json`, each with its acceptance, and Verify gained entries 3, 4 and 6 covering `npx fallow`, the audit gate and the SHA pin. The seventh path, `.claude/skills/fallow/`, is still uncovered and is tracked separately as F-21 rather than held open here.

### adopt-fallow-and-clear-its-findings/F-17 [P2] closed - The fallow workflow grants `pull-requests: write` to a third-party action pinned to a mutable tag

**File:** .github/workflows/fallow.yml:8-10, 20
**Found:** 2026-09-23 by /audit (scope: current; lens: security; independent)
**Why it matters:** `uses: fallow-rs/fallow@v3` resolves a tag the publisher can repoint at any commit, and the job hands whatever it resolves a `GITHUB_TOKEN` carrying `pull-requests: write`. On `push: branches: [main]` and on same-repo pull requests that token is genuinely writable, so a repointed tag runs attacker-chosen code with comment-write access to this public repository and read access to the checkout (`fetch-depth: 0`, full history). `continue-on-error: true` and `fail-on-issues: false` mean the step is advisory, so the write scope buys only the PR comment. Pinning is the standard, one-line mitigation and nothing here needs a floating version.
**Suggested fix:** Replace `fallow-rs/fallow@v3` with the full commit SHA of the v3 release, keeping `# v3.x.y` as a trailing comment so upgrades stay legible. If the PR comment is not worth the write scope, also drop `pull-requests: write` and leave only `contents: read`. No current requirement is lost.
**Resolution:** Pinned to `fallow-rs/fallow@bd8fca5af5df4ccfd94c7a835d17bd93c31a7cef # v3.28.0`, the commit the annotated `v3` tag dereferenced to, with a comment stating why the pin exists and to bump it alongside the devDependency. `pull-requests: write` kept: the PR comment is the workflow's only output, and with the action pinned the token is no longer reachable through a repointed tag. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: the pin was verified against GitHub rather than trusted. `refs/tags/v3` is an annotated tag object `3c85ffb8`, PGP-verified, named `v3.28.0`, and it dereferences to exactly `bd8fca5af5df4ccfd94c7a835d17bd93c31a7cef`, whose commit message is `chore: release v3.28.0`. `.github/workflows/fallow.yml:23` carries that 40-character SHA with a `# v3.28.0` trailing comment and a comment stating why the pin exists. `actions/checkout@v4` is left on its tag, which matches the existing practice in `.github/workflows/test.yml` for a GitHub-owned action.

### adopt-fallow-and-clear-its-findings/F-18 [P3] closed - The recorded reason for disabling `test-only-dependencies` claims all of `@astrojs/*` is config-only, but `@astrojs/rss` is imported by a page

**File:** .fallowrc.json:32-37
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** The comment reads "The only importer of @astrojs/* and @tailwindcss/vite is astro.config.mjs". `src/pages/rss.xml.js:2` imports `@astrojs/rss` from production code, so the claim is false as written. The rule is switched off project-wide on the strength of that sentence, and it is the one exception of the five whose stated reason does not survive checking. The disable itself is still justified for the five genuinely config-only packages (`@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/react`, `@astrojs/cloudflare`, `@tailwindcss/vite`, all verified as imported only by `astro.config.mjs`), so this is an accuracy defect in the record, not a wrong setting. A reviewed exception is only worth the reason attached to it; a reason that overstates its scope invites the next reader to trust the next one without checking.
**Suggested fix:** Name the packages instead of globbing: "The only importer of `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/react`, `@astrojs/cloudflare` and `@tailwindcss/vite` is astro.config.mjs, which fallow does not count as production code. `@astrojs/rss` is imported by src/pages/rss.xml.js and is unaffected." Comment-only change. No current requirement is lost.
**Resolution:** Comment rewritten to name the five config-only packages and to state that `@astrojs/rss` is imported by `src/pages/rss.xml.js` from production code and was never flagged. Setting unchanged. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: every claim in the new comment was checked against the tree. `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/react`, `@astrojs/cloudflare` and `@tailwindcss/vite` each have exactly one importer, `astro.config.mjs`; `@astrojs/rss` is imported at `src/pages/rss.xml.js:2`. `npx fallow config` shows `.fallowrc.json` loaded with `test-only-dependencies: off` unchanged, and `npx fallow` still exits 0.

### adopt-fallow-and-clear-its-findings/F-19 [P1] closed - `GET /api/comments` returns every Comment column, so commenter email addresses are served publicly

**File:** src/pages/api/comments.ts:13-19 (schema db/schema.ts:3-10; browser consumer src/components/CommentsList.astro:53)
**Found:** 2026-09-23 by /audit (scope: current; lens: security; independent)
**Why it matters:** The route runs `db.select().from(Comment)` with no column list, which Drizzle expands to every schema column, and hands the rows straight to `json(comments, 200)`. `Comment` has a `notNull` `email` column, so an unauthenticated `GET /api/comments?postSlug=<slug>` returns each commenter's name, message and email address. `prerender = false` makes it a live Worker route, there is no auth and no rate limit, and every post slug is public through the sitemap and RSS feed, so the whole comment table's addresses can be harvested in a handful of requests. The rendered UI is deliberately narrower: both the Astro server render and the client-side `renderComment` show only name, date and message, so the people who commented were never shown that their address would be published. This is inherited, not introduced by this branch, but `comments.ts` is in the reviewed delta and the delta rewrote the response construction around the offending select.
**Suggested fix:** Project the columns the clients actually use: `db.select({ id: Comment.id, postSlug: Comment.postSlug, name: Comment.name, message: Comment.message, createdAt: Comment.createdAt })`. Apply the same projection to the identical select in `src/components/CommentsList.astro:9-13`. `email` stays in the table for the existing 30-second rate-limit lookup in `src/actions/index.ts`, which queries it server-side and never returns it. No current requirement is lost: no caller reads `email` from either response.
**Resolution:** Fixed by removing the route rather than projecting it (user decision, 2026-09-23: protect the data from public view rather than narrow the payload). `src/pages/api/comments.ts` and its test are deleted, so there is no public response to harvest. `Comments.astro` renders `CommentsList` with `server:defer`, so the list was never served by this route on page load and still shows current data per request. The remaining reads name their columns: `CommentsList.astro` selects id, name, message and createdAt, and `addCommentHandler` projects its `returning()` to the same shape minus name duplication, so the action no longer hands an email to the browser either. `email` stays in the table and the 30-second rate-limit lookup now selects only `createdAt`. Covered by an updated assertion in src/actions/index.test.ts: the result has no `email` property while the stored row still does. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: re-reviewed the whole `47334f9..583ea48` delta rather than the repair alone. `src/pages/api/comments.ts` and `src/pages/api/reactions.ts` are absent at `583ea48`; the only routes left under `src/pages/api/` are `confirm.astro`, `unsubscribe.astro`, `notify.ts` and `version.ts`, and none reads `Comment` or `Reaction`. No source file references either path (the only remaining mentions are blueprint docs, tracked as F-24). Every surviving read names its columns: `CommentsList.astro:13-18` (id, name, message, createdAt), `ReactionsButton.astro:8` (loves), `src/actions/index.ts:65` (createdAt), `:116` (loves), and the insert's `.returning()` at `:96-102` (id, postSlug, name, message, createdAt). `Comments.astro:15,21` renders `ReactionsButton` and `CommentsList` with `server:defer`, so both islands are rendered in the Worker per request and still show current data on every post view; the deleted routes only ever served the post-submit redraw, which the actions' return values now cover. `email` is still `notNull` in `db/schema.ts:7` and still populated. `npm run build` passes and `npm run test` passes 74 tests in 8 files, including the assertion that the action result has no `email` while the stored row does. Reviewer agrees with deleting rather than projecting: neither route had a caller left, keeping two unauthenticated `prerender = false` Worker routes alive for no current requirement would be the wider surface, and a projection is a per-query discipline that a future `select()` could silently undo.

### adopt-fallow-and-clear-its-findings/F-20 [P1] closed - Comment text reaches `innerHTML` unescaped behind a single-pass tag stripper that an unterminated tag slips past

**File:** src/components/CommentsList.astro:32-57 (sanitizer at src/actions/index.ts:82-83)
**Found:** 2026-09-23 by /audit (scope: current; lens: security; independent)
**Why it matters:** `refreshComments` assigns `commentsList.innerHTML = comments.map(renderComment).join("")`, and `renderComment` interpolates `${comment.name}` and `${comment.message}` into an HTML string with no escaping. The only defense is `message.replace(/<[^>]*>/g, '')` on insert, which is one non-rescanning pass and only matches a `<...>` pair. A message with no `>` in it, such as `<img src=x onerror=...`, has nothing for the regex to match, survives storage verbatim, is returned by the changed `/api/comments` route and is then closed off by the literal `</div>` that follows the interpolation in the template. The spam list blocks `<script>` but not that shape, and Zod only bounds the length at 1000. The server-rendered path is safe because Astro escapes it; the exposure is the post-submit refresh, so a payload fires for whoever next comments on that post. Recorded as unverified because the chain was derived by reading the code and the HTML parsing step was not reproduced in a browser, and because both files sit outside the reviewed delta: they were reached by following a consumer of the changed route. It is a lead for a separate work item, not a gate on this branch.
**Suggested fix:** Confirm it first with a browser reproduction against the dev server. If it reproduces, stop building HTML from strings: have `renderComment` create the elements and set `textContent` for the name and message, which removes the sink entirely and does not depend on the sanitizer. `src/actions/index.ts:82` strips `name` the same way and feeds the same sink, so cover both. Leave the insert-time stripper in place for the stored value. No current requirement is lost; the markup and classes stay the same.
**Resolution:** Fixed without a browser reproduction (user decision, 2026-09-23: fix it alongside F-19 rather than carry it as a lead). The sink is gone, not escaped: `refreshComments` and the string-building `renderComment` are deleted along with the fetch they served. `CommentsList.astro` now builds the new comment with `createElement` and sets `textContent` for both the name and the message, so neither value is ever parsed as HTML, and the result does not depend on the insert-time stripper. That stripper stays in `src/actions/index.ts:82-83` for the stored value. The markup and classes are unchanged. The list is ordered newest first, so the new node is prepended. Not covered by a test: the path is browser script in an .astro component and no browser harness is configured, so Verify entry 7 checks it by hand. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: `grep -n innerHTML src/components/CommentsList.astro` returns only the explanatory comment at line 45, never an assignment. `buildComment` (`:47-69`) creates four elements with literal tag names and sets `name.textContent`, `date.textContent` and `body.textContent`, so neither the commenter's name nor the message is ever parsed as HTML, regardless of what the insert-time stripper at `src/actions/index.ts:82-83` let through. `renderComment`, `refreshComments` and the `fetch` they served are gone. The listener (`:74-80`) reads `CustomEvent.detail`, returns early when the container or the detail is missing, and prepends, which matches the newest-first `orderBy(desc(Comment.createdAt))` at `:21`. `CommentsForm.astro:160,183` supplies that detail from the action's projected row, so the payload carries no email either. The remaining `innerHTML` writes in `CommentsForm.astro` are a separate, non-reachable case recorded as F-26, not this defect. No automated test covers the browser path, by the project's own opt-in browser-testing rule; the guarantee here rests on `textContent` rather than on a sanitizer, which is verifiable by inspection.

### adopt-fallow-and-clear-its-findings/F-21 [P3] closed - The fallow agent skill under `.claude/skills/fallow/` merges to main with no spec coverage

**File:** .claude/skills/fallow/SKILL.md:1-35, .claude/skills/fallow/agents/openai.yaml:1-4 (spec at blueprint/context/current-feature.md:36-59, 104-109)
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** `git cat-file -e main:...` confirms both files are absent from `main`, so they ship with this PR. The revised Step 0 lists the devDependency, `.fallowrc.json`, `.mcp.json`, the `PreToolUse` gate, the workflow and the AGENTS.md task map, but not these two. F-16's suggested fix named `.claude/skills/fallow/SKILL.md` explicitly among the paths to cover, and it is the one that was missed. `SKILL.md` is an agent-instruction file that auto-loads on description match and tells the agent to read `node_modules/fallow/skills/fallow/SKILL.md` before running fallow, and `agents/openai.yaml` is a Codex-facing registration for a second tool. This is the residue of F-16 rather than a new class of problem, and it is small, so it is a follow-up and not a blocker.
**Suggested fix:** Add the two paths to the Step 0 bullet list in `blueprint/context/current-feature.md` with one line saying they were written by `fallow agent install` and that `SKILL.md` is a pointer to the version-matched skill inside the installed package. Spec-only change; no code moves. No current requirement is lost.
**Resolution:** Step 0 in the spec now lists `.claude/skills/fallow/` with both paths, stating that `fallow agent install` wrote them, that `SKILL.md` is a 35-line pointer to the version-matched skill inside the installed package and tells agents to resolve flags from `fallow --help` rather than memory, that `agents/openai.yaml` is the display name and default prompt for tools reading that format, and that both are agent instructions rather than code the site runs. The Step 0 build step names the skill alongside the other tooling. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: the spec's Step 0 bullet at `blueprint/context/current-feature.md:52-56` and the Step 0 build step at `:147-152` both name `.claude/skills/fallow/`, and every claim in the new text checks out. `wc -l` reports `SKILL.md` at exactly 35 lines, and `agents/openai.yaml` at 4 lines carrying `display_name`, `short_description` and `default_prompt` under an `interface` key, which is the display name and default prompt the spec describes. Both files remain absent from `main`. Neither is imported by product code, so the "agent instructions, not code the site runs" claim holds.

### adopt-fallow-and-clear-its-findings/F-22 [P3] closed - The AGENTS.md fallow block tells agents to change the gate in `fallow.toml`, a file this project does not use

**File:** AGENTS.md:327 (project config at .fallowrc.json:1-48)
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** The pasted block says `Set [audit] gate = "all" in fallow.toml`, but `fallow --help` lists four accepted config names and `npx fallow config` reports `.fallowrc.json` as the loaded one. An agent acting on that sentence would create a second config file next to the existing one. fallow discovers and loads a single config, so the outcome is either that the new gate setting is silently ignored or that `.fallowrc.json` stops being loaded, which would drop all five reviewed exceptions (`sharp`, the `eq` re-export, the confirm/unsubscribe clone, the `worker-configuration.d.ts` duplicate ignore, `test-only-dependencies` and the `HeroFlip.astro` override) and turn the baseline red again. The text is vendor boilerplate from `fallow setup-hooks`, but it merges to `main` as this project's standing instruction to every agent, and it is the same class of defect as F-18: an instruction worth only the accuracy of what it points at.
**Suggested fix:** Change that one sentence to name the file this project actually uses, for example `Set "rules" / audit gate to "all" in .fallowrc.json`, and keep the rest of the generated block. The marker comments around the block mean a future `fallow setup-hooks` run may overwrite it, so note the edit next to it. Documentation-only change. No current requirement is lost.
**Resolution:** AGENTS.md:327 now reads `set "audit": { "gate": "all" } in .fallowrc.json`, matching the `audit.gate` key in fallow's own schema, and adds an explicit warning not to create a `fallow.toml`, since fallow loads one config and a new one would take precedence and drop the five reviewed exceptions. The sentence stays inside the generated `fallow:setup-hooks` markers, so a future `fallow setup-hooks` run can overwrite it; that risk is recorded here rather than by moving the text outside the block, which would leave two copies to drift apart. Fixed by /complete 2026-09-23. Closed by /audit independent 2026-09-23: `AGENTS.md:327` now reads `set "audit": { "gate": "all" } in .fallowrc.json, which is the config this project loads` and adds `Do not add a fallow.toml`, with the reason. No occurrence of `fallow.toml` remains anywhere in `AGENTS.md`. The sentence sits between the `fallow:setup-hooks:start` and `:end` markers as the resolution states, so the overwrite risk is recorded rather than removed. `.fallowrc.json` is unchanged and still carries all five reviewed exceptions; `npx fallow` exits 0 with 0 dead code, 0 clone groups and 0 functions above threshold, and `npx fallow audit --format json --quiet --explain --gate-marker agent` returns verdict `pass` with 0 introduced findings.

## Independent review

**Status:** passed
**Target commit:** 583ea486be9ff24f0b9d5478fbebd77c24826839
**Base commit:** 47334f97148c746161c7d50f72084d21757a6c36
**Base ref:** main
**Spec hash:** 422d6c383551a63d066e138a9ae1618a5fa5e5e11f31d375667f1fe4a8ee9b2b
**Prepared by:** claude
**Builder model:** claude-opus-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-09-23T13:52:34Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-09-23T13:58:13Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `47334f97148c746161c7d50f72084d21757a6c36..583ea486be9ff24f0b9d5478fbebd77c24826839` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`: pass (equals Target commit)
- `git merge-base main 583ea48`: pass (equals Base commit)
- `shasum -a 256 blueprint/context/current-feature.md`: pass (equals Spec hash)
- `git status --porcelain` and `git ls-files --others --exclude-standard`: pass (only `blueprint/context/review.md` differs from the target; no untracked paths)
- `npm run build`: pass
- `npm run test`: pass (8 files, 74 tests)
- `npx fallow`: pass (exit 0; dead code 0, duplication 0 clone groups, 0 functions above threshold, maintainability 94.4)
- `npx fallow audit --format json --quiet --explain --gate-marker agent`: pass (verdict `pass`, 0 introduced findings across dead code, complexity, duplication and styling)
- `npm run analyze`: unavailable (stale local `node_modules`, documented in the spec's "Known issue, not fixed here"; `npx fallow` 3.28.0 was used instead)
- `/check`: not run (the request records Check as not required)

### Evidence

- Delta reviewed in full: 12 commits, `16cecbe` through `583ea48`, 32 files, +1465/-880. All four lenses were applied to the whole range, including the five Step 0 tooling commits, not only the newest commit.
- F-19: `src/pages/api/comments.ts` and `src/pages/api/reactions.ts` are absent at the target. The surviving routes under `src/pages/api/` are `confirm.astro`, `unsubscribe.astro`, `notify.ts` and `version.ts`, and none reads `Comment` or `Reaction`. A repo-wide grep finds no source reference to either deleted path; the only remaining mentions are blueprint documents (F-24). Every surviving read names its columns: `CommentsList.astro:13-18`, `ReactionsButton.astro:8`, `src/actions/index.ts:65`, `:116`, and the insert's `.returning()` at `:96-102`. `email` stays `notNull` in `db/schema.ts:7` and is still stored.
- F-19 availability: `Comments.astro:15,21` renders `ReactionsButton` and `CommentsList` with `server:defer`, so both islands render in the Worker on every post view and never depended on the deleted GET routes. Those routes only served the post-submit redraw, which `addCommentHandler`'s projected `returning()` and `addLoveHandler`'s `{ loves }` now cover in the action response.
- F-20: `grep -n innerHTML src/components/CommentsList.astro` matches only the explanatory comment on line 45. `buildComment` at `:47-69` creates elements with literal tag names and assigns `textContent` for the name, the date and the message, so no comment value can be parsed as HTML. `renderComment`, `refreshComments` and their `fetch` are gone. `CommentsForm.astro:183` supplies the event detail from the action's projected row, and the listener at `CommentsList.astro:74-80` guards on a missing container or detail before prepending, which matches the newest-first `orderBy(desc(Comment.createdAt))`.
- F-20 verdict on the approach: deleting the routes rather than projecting their columns is the right call. Neither route had a caller left once the actions returned what the browser needed, so projecting would have preserved two unauthenticated `prerender = false` Worker routes for no current requirement, and a projection is a per-query discipline a later `select()` could silently undo.
- Rate limit: the projected `select({ createdAt: Comment.createdAt })` at `src/actions/index.ts:65` changes no filter, ordering or limit, and `recentComments[0].createdAt` is still read at `:73`. The existing test at `src/actions/index.test.ts:67-74` passes. A separate pre-existing case-normalization defect in the same statement's `where` is recorded as F-23.
- Notify refactor: `sendInBatches` preserves the previous send semantics, including `skipSend`. With `skipSend` the old code produced an empty `emails` array, so `chunk` returned no groups and `resend!` was never dereferenced; the new explicit `{ sent: 0, failed: 0 }` branch yields the same counts. `PostNotification` is still written regardless of partial failure, and the response body, status and headers are unchanged.
- Deletions: `src/test/helpers.ts` had exactly two consumers, `src/pages/api/_comments.test.ts` and `_reactions.test.ts`, both removed with the routes they covered. No other file imports `apiContext`. The `desc` re-export dropped from `db/d1-client.ts` has no consumer; the remaining `desc` uses import from `db/client.ts`. 80 to 74 tests is fully explained: Step 3 added 6 and Step 6 removed 12.
- Standards: `blueprint/context/coding-standards.md` checked against the delta. No em dash, en dash or ellipsis character appears in any added line. The `.pull-quote` rules deleted from `src/pages/index.astro` are byte-equivalent to `src/styles/global.css:163-185`, which loads on every page through `BaseHead.astro:4`, matching the "shared utilities live in global.css" rule. Comments added by the delta explain why rather than what.
- Tooling (Step 0) re-reviewed independently: `.github/workflows/fallow.yml:23` pins `fallow-rs/fallow` to the 40-character SHA `bd8fca5a...` with a `# v3.28.0` trailing comment; `.mcp.json` runs `npx --no fallow-mcp`, which cannot install from the network; `.claude/hooks/fallow-gate.sh` never evaluates the intercepted command, disables globbing before tokenizing, and fails open by design as the spec documents; `.fallowrc.json`'s five reviewed exceptions were spot-checked, including `@astrojs/rss` at `src/pages/rss.xml.js:2`.
- Behavior narrowed deliberately: after posting, the list now prepends only the new comment instead of refetching the whole thread, so comments others posted since the island rendered appear on the next page load. This is stated in the spec at `:126-128` and in a code comment at `CommentsList.astro:71-73`, and it removes one round trip per submission.

### Findings

- F-19 (P1) closed, F-20 (P1) closed, F-21 (P3) closed, F-22 (P3) closed
- F-23 (P2) open, F-24 (P3) open, F-25 (P3) open, F-26 (P3) open (new this pass)
- F-13, F-14, F-15 untouched: their files lie outside this delta
- No P0 or P1 finding is `open` or `fixed`

### Remaining risk

- `npm run analyze` could not run on this machine (stale local `node_modules`); `npx fallow` 3.28.0 supplied every fallow signal instead, while `package-lock.json` pins `fallow@3.27.0`, so the version that CI installs was not the version that produced these results.
- `/check` was not required by the request and was not run, so no runtime evidence backs the spec's Verify entries 5, 7 and 8. The deployed 404 for `/api/comments`, the post-submit comment appearing, and the heart count incrementing without a request to `/api/reactions` remain unproven at runtime.
- No browser harness is configured, so the F-20 repair in `CommentsList.astro`'s client script has no automated coverage. The guarantee rests on `textContent` and `createElement`, which is verifiable by inspection, not on an executed test.
- `CommentsList.astro`'s projected select and the `server:defer` island render are `.astro` surfaces with no unit coverage; only the action path is asserted to exclude `email`. A future `select()` there would not fail the suite.
- `npx fallow audit` computed its base as `0ea1f2f` (the merge base with `origin/claude/fallow-code-quality-9g5b6e`), not `47334f9`, so its "0 introduced findings" covers only `dc107f7..583ea48`. The five Step 0 commits were covered by manual review rather than by the gate.
- F-23 is open and untested, so a commenter using any uppercase letter in their address is not rate-limited; this is inherited from `main` and does not block, but it ships with this PR.
- Dashboard activity was not written for this reviewer pass: the Phase B reviewer may write only `blueprint/context/findings.md` and `blueprint/context/review.md`, and overwriting `blueprint/.state/run.json` would have clobbered the parent command's record.

### Scope note recorded by /complete

The receipt above covers `47334f97148c746161c7d50f72084d21757a6c36..583ea486be9ff24f0b9d5478fbebd77c24826839`,
which is the whole of this work item. It does not cover the merge that followed
it.

After the receipt passed, `main` at `6e139d583cc6b9ec2d5cdc2d549d4e1bedc8a3fa`
was merged into this branch at `7601401796a4eff399ec27e27d0775eaaa26f1de`, on
the user's explicit decision (2026-09-23) not to run a fourth review cycle for
it. The reasoning: `main`'s eight incoming commits were reviewed and merged
through their own pull requests (#29, #30), and none of them touches a file this
work item changed. The only merge conflict was
`blueprint/context/current-feature.md`, where `main` already held the reset stub,
so the resolution is the same file this completion resets anyway.

Re-verified on the merged tree rather than assumed: `npm run build` passes,
`npm run test` passes with 87 tests in 10 files (74 from this branch plus 13
arriving with `main`), `npx fallow` exits 0, and
`npx fallow audit --gate-marker agent` returns verdict `pass`.

Two changes were made after the receipt and are therefore outside its scope.
`emails/subscriberReport.ts` arrived from `main` exporting the
`SubscriberReportRow` interface with no importer, which fallow attributed as a
newly introduced finding and which failed the audit gate; the `export` keyword
was dropped, leaving a file-local type with no behavior change. And
`blueprint/plans/parked-subscription-flow-diagram.md`, parked earlier in this
session, was deleted as obsolete: `main` had already shipped
`blueprint/references/subscription-flow.md` and its archive through PR #29.
