# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-11 [P2] fixed - Subscribe action re-sends a confirmation email on every submission for an unconfirmed or unsubscribed address, with no throttle

**File:** src/lib/subscribeDecision.ts:50-56, 63-75 (caller src/actions/index.ts:213-216)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** The `resend` and `reactivate` branches send a fresh confirmation email each time the form is posted for that address. The only gates are the honeypot and the client-supplied `timestamp`, both trivially satisfied by a script that posts `timestamp = now - 4000`. Anyone can therefore point the public action at a third party's address and trigger an unbounded stream of "Confirm your subscription" emails from `updates@mail.francisroylilly.com`: unsolicited mail to a victim, sender-reputation damage, and exhaustion of the Resend quota, which would then block real confirmations and the next post notification. Impact is bounded by the Resend plan limits, and the spec accepted these soft gates, so this stays at P2 rather than P1.
**Suggested fix:** Smallest repository-native option: skip the send in `decideSubscribe` when the row was emailed recently (for example within 10 minutes), which needs one nullable `lastEmailedAt` column on `Subscriber` (D1 migration) set on every send, and a test for the throttled branch; the response stays identical so nothing is revealed. Platform-native alternative with no code: one Cloudflare rate-limiting rule on `POST /_actions/*` per client IP. Either changes shipped behavior slightly (a genuine "I didn't get it" resend within the window is suppressed), so it needs the user's decision on the window or the WAF path. No current requirement is lost.
**Resolution:** User chose the lastEmailedAt column with a 10 minute window (2026-09-18). decideSubscribe returns `throttled` for resend/reactivate when lastEmailedAt is inside CONFIRMATION_RESEND_WINDOW_MS; the handler stamps lastEmailedAt only after a successful send; response unchanged. Migration drizzle/d1/0001_*.sql. Fixed by /implement 2026-09-18.

### F-13 [P3] open - Notify workflow stays green when every batch send fails, so missed notifications go unnoticed

**File:** .github/workflows/notify-subscribers.yml:41-43 (see also src/pages/api/notify.ts:79-85, 91-96)
**Found:** 2026-09-18 by /audit (scope: current; lens: quality, security, performance, tests; independent)
**Why it matters:** `/api/notify` answers 200 with `{ notified: [{ slug, sent, failed }] }` whether or not a batch failed, and the `PostNotification` row is written regardless, so a rerun sends nothing. `curl -sf` fails only on a non-2xx status, so a run in which Resend rejected every chunk (429, an invalid address failing its whole chunk of up to 100, an expired API key) is a green Actions run. The only signal is the JSON body in the step log, and nothing prompts anyone to read it, so subscribers never hear about that post. Response-only reporting is the spec's chosen contract, so this is a follow-up, not a blocker.
**Suggested fix:** In the trigger step, capture the body and pipe it through `jq -e '([.notified[].failed] | add // 0) == 0'` so a non-zero `failed` count fails the run and GitHub sends its failure email; print the body first so the counts stay in the log. No current requirement is lost.
**Resolution:**
