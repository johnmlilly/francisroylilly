# Fix: Subscription flow diagram

**Type:** Fix
**Status:** not started
**Branch:** `fix/subscription-flow-diagram`

## The problem

The subscriber notification feature (14) spans a form, an Astro Action, two
token pages, a secret-protected notify route, a GitHub Actions workflow, D1, and
Resend. The only descriptions are prose in the archived spec and
`blueprint/plans/notify-subscribers.md`. There is no single visual that shows
how a reader, the site, D1, Resend, and the workflow interact, so explaining or
re-learning the flow means re-reading code. The user wants a diagram saved
under `blueprint/references/` that can be linked from the README later.

## The fix

Add `blueprint/references/subscription-flow.md`, a Markdown file with Mermaid
diagrams (GitHub renders Mermaid natively, so it works in a README link and in
PR views with no build step or image asset). Content:

1. **Layer map** (`flowchart`): entry points (`/subscribe` form + popup,
   `subscribeToUpdates` action, `/api/confirm`, `/api/unsubscribe`,
   `/api/notify`, `/api/version`), logic (`src/lib/subscribeDecision.ts`,
   `subscriptions.ts`, `notify.ts`), storage (`db/d1-client.ts`, `Subscriber`,
   `PostNotification`), external (Resend, GitHub Actions, Workers Builds).
2. **Subscribe and confirm** (`sequenceDiagram`): form → action → honeypot /
   timing → `decideSubscribe` (insert / resend / reactivate / noop / throttled)
   → D1 → Resend confirmation email → reader clicks link → GET renders page →
   POST sets `confirmedAt` → `/subscribed`. Shows the 10 minute throttle.
3. **Publish and notify** (`sequenceDiagram`): push to `main` → Workers Builds
   deploy → Actions workflow polls `/api/version` until SHA matches → POST
   `/api/notify` with secret → `selectNewPosts` → active subscribers → Resend
   batch (100/chunk) → `PostNotification` row → JSON result.
4. **Unsubscribe** (short `sequenceDiagram`): email link → GET page → POST sets
   `unsubscribedAt` → `/unsubscribed`; idempotent.
5. A short legend table: route, method, mutates?, auth, result.

Each diagram must reflect the code as it is on `main` today (confirm is GET
page + POST button). A one-line note at the top says to update the confirm
diagram when the confirm-on-click fix lands. Plain Markdown, no em dashes, no
images, no new dependencies. No product code changes. Do not edit `README.md`
(still the Astro starter boilerplate; the user will link the file when the
README is rewritten).

Must not break: nothing at runtime. `blueprint/references/` is a new folder;
the Blueprint tooling ignores unknown folders under `blueprint/`.

## Build steps

- [ ] **Step 1 - Write the reference** - create `blueprint/references/subscription-flow.md`
  with the five sections above. *Done when:* the file renders on GitHub (verify
  Mermaid syntax with `npx -y @mermaid-js/mermaid-cli -i <file>` or by pasting
  each block into https://mermaid.live), every route, file, and table name in it
  exists on `main`, and `npm run build` still passes.

## Verify

1. Open the file in GitHub's file view on the PR branch: all four diagrams render.
2. Cross-check names against the code: `grep -rn "api/confirm\|api/unsubscribe\|api/notify\|api/version" src/` and `db/d1-schema.ts`.
3. `npm run build` passes (no runtime change expected).
