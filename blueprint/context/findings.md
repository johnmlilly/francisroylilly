# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-13 [P3] open - Notify workflow stays green when every batch send fails, so missed notifications go unnoticed

**File:** .github/workflows/notify-subscribers.yml:41-43 (see also src/pages/api/notify.ts:79-85, 91-96)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `/api/notify` answers 200 with `{ notified: [{ slug, sent, failed }] }` whether or not a batch failed, and the `PostNotification` row is written regardless, so a rerun sends nothing. `curl -sf` fails only on a non-2xx status, so a run in which Resend rejected every chunk (429, an invalid address failing its whole chunk of up to 100, an expired API key) is a green Actions run. The only signal is the JSON body in the step log, and nothing prompts anyone to read it, so subscribers never hear about that post. Response-only reporting is the spec's chosen contract, so this is a follow-up, not a blocker.
**Suggested fix:** In the trigger step, capture the body and pipe it through `jq -e '([.notified[].failed] | add // 0) == 0'` so a non-zero `failed` count fails the run and GitHub sends its failure email; print the body first so the counts stay in the log. No current requirement is lost.
**Resolution:**

### F-14 [P3] open - Resend throttle is check-then-act, so concurrent submissions for one address can each send before the first stamp lands

**File:** src/actions/index.ts:188-221 (decision at src/lib/subscribeDecision.ts:31-36)
**Found:** 2026-09-18 by /audit (scope: current; lens: security, performance; independent)
**Why it matters:** The handler reads the row, decides, sends, then writes `lastEmailedAt`. Nothing serialises requests for the same email, so N requests fired in parallel all observe the pre-send `lastEmailedAt` (null or stale) and all send; only requests arriving after the first stamp commits are throttled. The abuse F-11 closed is therefore reduced from unbounded to one burst (bounded by how many requests land inside roughly one Resend round-trip) per address per 10 minutes, not to one email. Bursts still count against the Resend quota and land as duplicate mail on the victim. The window is short and the throttle materially reduces the risk, so this is a follow-up, not a blocker.
**Suggested fix:** Claim the window before sending: on `resend` and `reactivate`, run one conditional `UPDATE Subscriber SET lastEmailedAt = ? WHERE email = ? AND (lastEmailedAt IS NULL OR lastEmailedAt <= ?)` (D1 returns `meta.changes`; `0` means another request won and the handler treats it as `throttled`), then send, and on a Resend error reset `lastEmailedAt` to its prior value so the reader is not locked out. This changes the spec's "stamp only after a successful send" contract to "stamp first, roll back on failure", so it needs the user's decision. No current requirement is lost.
**Resolution:**

### F-15 [P3] open - Every Subscriber read selects the new column, so deploying before the remote migration breaks confirm, unsubscribe, and notify, not only subscribe

**File:** src/lib/subscriptions.ts:17, src/pages/api/notify.ts:56-59, src/actions/index.ts:188-192 (deployment note in blueprint/context/current-feature.md:58-66)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality; independent)
**Why it matters:** Drizzle's `select()` with no column list expands to every schema column, so once this code is live any query against a production `Subscriber` table that lacks `lastEmailedAt` fails with `no such column`. That includes the token lookup behind `/api/confirm` and `/api/unsubscribe` (readers clicking emailed links get an error page) and the active-subscriber query in `/api/notify` (the Actions run goes red; `PostNotification` is not written, so a rerun after the migration recovers). The spec's deployment note only says "the deployed action will fail", which understates the blast radius and could lead to applying the migration after merge rather than before.
**Suggested fix:** Apply `drizzle/d1/0001_hard_major_mapleleaf.sql` to the remote D1 before merging to `main` (the migration is additive and harmless to run ahead of the code), and correct the deployment note to say that confirm, unsubscribe, and notify also depend on it. No code change needed. No current requirement is lost.
**Resolution:**

### F-16 [P2] fixed - Half the branch delta installs fallow tooling that the spec never describes and that merges to main with this PR

**File:** blueprint/context/current-feature.md:27-52 (the tooling: .claude/settings.json:1-16, .claude/hooks/fallow-gate.sh:1-171, .mcp.json:1-12, .github/workflows/fallow.yml:1-25, .claude/skills/fallow/SKILL.md, AGENTS.md:319-350, package.json:15)
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** The review delta is nine commits, not four. The five commits before `dc107f7` (`16cecbe`, `7222115`, `ac8e713`, `0ec884a`, `0ea1f2f`) install fallow itself, and `git cat-file -e main:<path>` confirms every one of those files is absent from `main`. The spec's "The problem" cites them as prior context ("the branch that introduced fallow itself (PR #31)") while "Known deviations" confirms PR #31 *is* this branch, so the spec describes the cleanup but not the tooling that ships alongside it. What merges unspecced: a CI workflow, a `PreToolUse` hook that runs a shell script on every agent Bash call, an MCP server registration, a new devDependency, and an `AGENTS.md` policy block telling every agent to gate commits on fallow. None of it has acceptance criteria, none of it appears in the Verify list, and `/complete` will archive a history record that reads as a four-step code cleanup. A later reader auditing how a CI workflow or an agent hook entered the repo finds no reviewed decision behind it.
**Suggested fix:** Extend "The fix" with a fifth part describing the fallow installation (the eight paths above), add the matching "Must not break" and Verify entries, and note in Known deviations that the tooling commits predate the spec for the same reason the cleanup commits do. Spec-only change; no code moves. No current requirement is lost.
**Resolution:** Spec retitled "Adopt fallow and clear its findings" and given a "Tooling (Step 0)" section covering the devDependency and `npm run analyze`, `.fallowrc.json`, the `.mcp.json` registration, the `PreToolUse` gate and its fail-open behavior, the non-blocking workflow, and the AGENTS.md task map, plus a checked Step 0 listing the five commits and its acceptance. A revision note records why the first draft missed them. Fixed by /complete 2026-09-23.

### F-17 [P2] fixed - The fallow workflow grants `pull-requests: write` to a third-party action pinned to a mutable tag

**File:** .github/workflows/fallow.yml:8-10, 20
**Found:** 2026-09-23 by /audit (scope: current; lens: security; independent)
**Why it matters:** `uses: fallow-rs/fallow@v3` resolves a tag the publisher can repoint at any commit, and the job hands whatever it resolves a `GITHUB_TOKEN` carrying `pull-requests: write`. On `push: branches: [main]` and on same-repo pull requests that token is genuinely writable, so a repointed tag runs attacker-chosen code with comment-write access to this public repository and read access to the checkout (`fetch-depth: 0`, full history). `continue-on-error: true` and `fail-on-issues: false` mean the step is advisory, so the write scope buys only the PR comment. Pinning is the standard, one-line mitigation and nothing here needs a floating version.
**Suggested fix:** Replace `fallow-rs/fallow@v3` with the full commit SHA of the v3 release, keeping `# v3.x.y` as a trailing comment so upgrades stay legible. If the PR comment is not worth the write scope, also drop `pull-requests: write` and leave only `contents: read`. No current requirement is lost.
**Resolution:** Pinned to `fallow-rs/fallow@bd8fca5af5df4ccfd94c7a835d17bd93c31a7cef # v3.28.0`, the commit the annotated `v3` tag dereferenced to, with a comment stating why the pin exists and to bump it alongside the devDependency. `pull-requests: write` kept: the PR comment is the workflow's only output, and with the action pinned the token is no longer reachable through a repointed tag. Fixed by /complete 2026-09-23.

### F-18 [P3] fixed - The recorded reason for disabling `test-only-dependencies` claims all of `@astrojs/*` is config-only, but `@astrojs/rss` is imported by a page

**File:** .fallowrc.json:32-37
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** The comment reads "The only importer of @astrojs/* and @tailwindcss/vite is astro.config.mjs". `src/pages/rss.xml.js:2` imports `@astrojs/rss` from production code, so the claim is false as written. The rule is switched off project-wide on the strength of that sentence, and it is the one exception of the five whose stated reason does not survive checking. The disable itself is still justified for the five genuinely config-only packages (`@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/react`, `@astrojs/cloudflare`, `@tailwindcss/vite`, all verified as imported only by `astro.config.mjs`), so this is an accuracy defect in the record, not a wrong setting. A reviewed exception is only worth the reason attached to it; a reason that overstates its scope invites the next reader to trust the next one without checking.
**Suggested fix:** Name the packages instead of globbing: "The only importer of `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/react`, `@astrojs/cloudflare` and `@tailwindcss/vite` is astro.config.mjs, which fallow does not count as production code. `@astrojs/rss` is imported by src/pages/rss.xml.js and is unaffected." Comment-only change. No current requirement is lost.
**Resolution:** Comment rewritten to name the five config-only packages and to state that `@astrojs/rss` is imported by `src/pages/rss.xml.js` from production code and was never flagged. Setting unchanged. Fixed by /complete 2026-09-23.
