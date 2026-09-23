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

### F-23 [P2] open - The comment rate-limit lookup compares the raw-case email against a lowercased stored value, so the 30-second throttle never fires for any address typed with a capital letter

**File:** src/actions/index.ts:64-79 (insert at :91, schema at db/schema.ts:7, test at src/actions/index.test.ts:67-74)
**Found:** 2026-09-23 by /audit (scope: current; lens: security, tests; independent)
**Why it matters:** The insert stores `email: email.toLowerCase()`, but the lookup immediately above it runs `eq(Comment.email, email)` against the unmodified input. Drizzle emits a plain `=` and the column is `text('email')` with SQLite's default BINARY collation, so `Foo@Example.com` never matches the stored `foo@example.com`. The throttle therefore does not fire at all for a commenter who types any uppercase character in their address, and an abuser can reset it on demand by varying the case. `blueprint/context/project-overview.md:50` lists a "30s per-email rate limit" as shipped behavior, so the record and the code disagree. This is inherited rather than introduced: the delta changed only `.select()` to `.select({ createdAt: Comment.createdAt })` on line 65, leaving the `where` untouched. It is recorded here because the reviewed delta rewrote that statement and because no test covers the gap: the one rate-limit test at index.test.ts:67-74 uses an all-lowercase fixture, so the suite is green either way. Severity is P2, not P1: the throttle is one of four spam defenses (honeypot, 3-second timing check, spam-word filter) and its failure exposes no data and breaks no auth or ownership boundary. The ledger already grades the comparable subscriber-throttle defect F-14 at P3.
**Suggested fix:** Normalize once at the top of the handler, for example `const normalizedEmail = email.toLowerCase();`, then use it in both the `where` on line 67 and the insert on line 91. Add a case-varying assertion to the existing rate-limit test so the regression cannot come back. No current requirement is lost.
**Resolution:**

### F-24 [P3] open - The project overview still documents `/api/comments` and `/api/reactions` as live read routes after this branch deleted them

**File:** blueprint/context/project-overview.md:50, :51, :171 (see also blueprint/build-plan.md:15-16)
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** `AGENTS.md` names `blueprint/context/project-overview.md` as the project's source of truth, and after this delta it lists two endpoints that no longer exist: the feature entries at :50-51 end with "`/api/comments` read route" and "`/api/reactions` read route", and the route map at :171 has a "`/api/comments`, `/api/reactions` - GET, on-demand" line. The overview is also the file an agent reads first to learn what the site exposes, so the next reader is told to expect routes that now 404, and the deliberate reason they were removed (they served commenter emails) is recorded nowhere in the source of truth. This is the same class of defect as F-18 and F-22, which this branch fixed: an instruction is only worth the accuracy of what it points at. It is small and documentation-only, so it is a follow-up and not a blocker.
**Suggested fix:** Drop the route-map line at :171, and change the two feature entries to say the browser reads comments and reaction counts through the `server:defer` islands in `Comments.astro` and writes through the `addComment` and `addLove` actions, with one clause noting the GET routes were removed so no response can carry a commenter's email. `blueprint/build-plan.md:15-16` records the original build and should stay as history. Documentation-only change. No current requirement is lost.
**Resolution:**

### F-25 [P3] open - `src/lib/http.ts` survives as a one-function module with a single consumer after the change dissolved the duplication it was created for

**File:** src/lib/http.ts:1-7 (only importer src/pages/api/notify.ts:5)
**Found:** 2026-09-23 by /audit (scope: current; lens: quality; independent)
**Why it matters:** Step 2 added this module to share `json` and `requirePostSlug` across three API routes. Step 6 deleted two of those routes, took `requirePostSlug` with them, and left a six-line `json` helper in its own file for exactly one caller, which is the file it was lifted out of. The spec states the outcome at :131-134, so it is a known consequence rather than an oversight, but the shared module no longer pays for itself: it buys one import line and one extra file in exchange for nothing that a local function did not already provide, and it is now the only thing in `src/lib/` that is not shared. The project's own proportionality rule asks for the smaller design when the requirement that justified an abstraction is gone.
**Suggested fix:** Move `json` back into `src/pages/api/notify.ts` as a module-local function, exactly as it stood before Step 2, and delete `src/lib/http.ts`. Keep the file instead if a near-term feature will add a second API route that needs it, and say so in the spec. No current requirement is lost either way: `notify.ts` is the only caller and its five `json(...)` call sites do not change.
**Resolution:**

### F-26 [P3] open - `CommentsForm.astro` still builds its status and error messages with `innerHTML`, the pattern the sibling component just removed

**File:** src/components/CommentsForm.astro:172-177, 181-185, 194, 199-203
**Found:** 2026-09-23 by /audit (scope: current; lens: security, quality; independent)
**Why it matters:** Step 6 replaced the `innerHTML` sink in `CommentsList.astro` with `createElement` plus `textContent` and documented the reason in a comment at `CommentsList.astro:45-46`. Four lines of the same file's sibling, in the very function the delta edited at :160 and :183, still assign template-literal HTML to `messageContainer.innerHTML`, one of them interpolating `${error.message}`. This is **not** currently exploitable and is not a repeat of F-20: every reachable `error.message` here is a fixed server-side string (`'Spam detected.'`, `'Submission too fast. Please try again.'`, `'Comment contains prohibited content.'`, `'Please wait before posting another comment.'`), Zod field errors take the `isInputError` branch and are written with `textContent` at :168, and nothing on this path interpolates the commenter's own name or message. It is recorded as a P3 because the component now holds two opposite conventions for the same job, and the one that survives is the one that only stays safe as long as no future handler puts user input into a thrown message.
**Suggested fix:** Replace the four assignments with a small local helper that creates the `div`, sets `className` and sets `textContent`, matching `buildComment` in `CommentsList.astro:47-69`, and clear the container with `replaceChildren()` instead of `innerHTML = ""` at :194. The markup and Tailwind classes stay identical. No current requirement is lost.
**Resolution:**
