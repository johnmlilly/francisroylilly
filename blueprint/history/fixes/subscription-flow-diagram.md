# Fix: Subscription flow diagram

**Type:** Fix
**Status:** verified
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
images, no new dependencies. No product code changes.

Also rewrite `README.md` (still the unedited Astro starter-kit boilerplate) to
describe the real project, sourced from `blueprint/context/project-overview.md`:
what the site is, live URL, tech stack, key routes, commands (dev/build/test/
deploy, matching `AGENTS.md`), and data model summary. Link to
`blueprint/references/subscription-flow.md` for the notification flow. Keep it
a real project README, not a copy of Blueprint workflow docs. No em dashes.

Must not break: nothing at runtime. `blueprint/references/` is a new folder;
the Blueprint tooling ignores unknown folders under `blueprint/`.

## Build steps

- [x] **Step 1 - Write the reference** *(all 4 Mermaid blocks rendered clean with
  `mermaid-cli` after fixing one semicolon-in-Note parse error and one mislabeled
  participant; names cross-checked against `db/d1-schema.ts` and `src/`)* - created
  `blueprint/references/subscription-flow.md` with the five sections above.
- [x] **Step 2 - Rewrite README** *(no boilerplate text remains; links the new
  reference file; `npm run build` passes)* - replaced the Astro starter-kit
  boilerplate with a real project README sourced from `project-overview.md`.

## Verify

1. Open the diagram file in GitHub's file view on the PR branch: all four diagrams render.
2. README reads as this project's README, not the Astro starter kit.
3. Cross-check names against the code: `grep -rn "api/confirm\|api/unsubscribe\|api/notify\|api/version" src/` and `db/d1-schema.ts`.
4. `npm run build` passes (no runtime change expected).


<!-- blueprint:completion {"schemaVersion":1,"specBytes":3908,"specSha256":"ca0a0c6e4bbc69729ac16ecc27a0f5cf9c2135ccc7f71a45e0f1cbac10bd2eae","branch":"refs/heads/fix/subscription-flow-diagram","head":"83dde6aa86af41aede2eeaf0f64140582271b619","baseRef":"refs/heads/main","baseCommit":"7e379aa1fe04a7d1d5e46205dccc9f746234c674","sourceTree":"5ef9da397d9d937b008752a4074272292a2f8a90","absentOptional":[]} -->
