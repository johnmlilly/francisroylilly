# Fix: Throttle confirmation email resends

**Type:** Fix
**Status:** verified
**Branch:** `fix/throttle-confirmation-resends`
**Fixes:** F-11
**Base:** `feature/notify-subscribers-resend-d1` (PR #26 unmerged; this fix's PR targets that branch)

## The problem

`subscribeToUpdatesHandler` sends a confirmation email on every submission for
an address that is unconfirmed (`resend`) or previously unsubscribed
(`reactivate`). The only gates are the honeypot and the client-supplied
`timestamp`, both trivially satisfied by a script. Anyone can point the public
action at a third party's address and trigger an unbounded stream of "Confirm
your subscription" mail from `updates@mail.francisroylilly.com`: unsolicited
mail to the victim, sender-reputation damage, and Resend quota exhaustion that
would then block real confirmations and the next post notification.

Decision (user, 2026-09-18): repository-native throttle with a `lastEmailedAt`
column and a 10 minute window, not a Cloudflare WAF rule.

## The fix

- `db/d1-schema.ts`: add nullable `lastEmailedAt` (`integer`, `timestamp` mode)
  to `Subscriber`. Generate `drizzle/d1/0001_hard_major_mapleleaf.sql` with `npm run db:d1:generate`.
- `src/lib/subscribeDecision.ts`: new `CONFIRMATION_RESEND_WINDOW_MS` (10 min).
  In the `resend` and `reactivate` branches, return `{ kind: 'throttled' }` when
  `existing.lastEmailedAt` is set and `now - lastEmailedAt < window`. A `null`
  `lastEmailedAt` (rows created before this migration) never throttles. `insert`
  and `noop` are unchanged.
- `src/actions/index.ts`: treat `throttled` like `noop` for DB writes and
  sending. After a successful `sendConfirmationEmail`, update the row's
  `lastEmailedAt = now` by email. Stamp only after the send succeeds so a Resend
  failure (which already surfaces an error to the reader) does not lock them out
  for 10 minutes. The response stays `Check your email to confirm your
  subscription.` in every branch, so nothing reveals list membership.
- No change to confirm, unsubscribe, notify, templates, or the form.

Must not break: existing four opt-in branches, honeypot and timing rejections,
the Resend error path, email normalization, and the identical-response contract.

## Build steps

- [x] **Step 1 - Column, throttle, stamp, tests** *(74 tests green incl. 8 new; build passes; migration `drizzle/d1/0001_hard_major_mapleleaf.sql` is one ALTER TABLE)* - schema column + generated
  migration; `throttled` branch in `decideSubscribe`; handler stamps
  `lastEmailedAt` after a successful send and skips everything on `throttled`;
  tests in `src/lib/subscribeDecision.test.ts` (resend and reactivate throttled
  inside the window, allowed at exactly the window and beyond, allowed when
  `lastEmailedAt` is null) and `src/actions/subscribe.test.ts` (throttled
  submission writes nothing and sends nothing but returns the normal message;
  successful send records `lastEmailedAt`). *Done when:* `npm run test` green
  with the new cases; `npm run build` passes; `drizzle/d1/0001_hard_major_mapleleaf.sql` contains
  exactly one `ALTER TABLE \`Subscriber\` ADD \`lastEmailedAt\` integer`.

## Deployment note

After merge, before the next post: user applies the migration once to
production and once locally:

    wrangler d1 execute francisroylilly --remote --file=drizzle/d1/0001_hard_major_mapleleaf.sql
    wrangler d1 execute francisroylilly --local  --file=drizzle/d1/0001_hard_major_mapleleaf.sql

Until the remote migration runs, the deployed action will fail on the unknown
column, so apply it before merging PR #26 to `main` (or immediately after).

## Verify

1. `npm run test`: new throttle cases pass alongside the existing 66.
2. `npm run build` passes.
3. Dev (`.dev.vars` with real Resend key, local D1 migrated): submit `/subscribe`
   for a fresh address, get one email; submit again within 10 minutes, see the
   same success message but no second email and unchanged `lastEmailedAt` in
   `wrangler d1 execute francisroylilly --local --command "SELECT email, lastEmailedAt FROM Subscriber"`.
