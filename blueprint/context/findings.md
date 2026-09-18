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
