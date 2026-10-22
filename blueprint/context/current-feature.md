# Fix: CI setup

**Type:** Fix
**Status:** implemented, awaiting review
**Branch:** fix/ci-setup

Takes priority over the build plan (prayer map waits until this merges).

## The problem

CI exists but doesn't match the Blueprint `/ci` contract or the setup in
johnsblog and ya-portal-blocks:

- `.github/workflows/test.yml` runs `npm run test` + `npm run build` on Node 22,
  with unpinned actions, no `permissions` block, and no shared `verify` script.
  `AGENTS.md` documents no `Verify` command.
- No typecheck. `@astrojs/check` is not installed, so `astro check` never runs.
- `fallow.yml` pins the fallow action but still uses `actions/checkout@v4` by
  tag, in a job that holds `pull-requests: write`.
- No dependency checks. `npm audit --omit=dev` shows ~15 high-severity
  advisories (wrangler, @cloudflare/vite-plugin, miniflare, undici, devalue,
  sharp, and others). Fixes exist for all of them. sharp needs a major bump
  (0.35.x).
- No Dependabot.

Leave alone: `notify-subscribers.yml` and `subscriber-report.yml` (production
jobs, not checks). Deploys stay on Cloudflare Workers Builds.

## The fix

Copy the johnsblog pattern (same stack: Astro on a Cloudflare Worker), with
this repo's checks:

| Piece | What |
|---|---|
| `verify` script | `astro check && vitest run && astro build` |
| `audit` script | `npm audit --omit=dev --audit-level=high` |
| `verify.yml` | Replaces `test.yml`. Runs on PRs and pushes to `main`, `contents: read`, Node 24, `npm ci`, `npm run verify`. Actions pinned by SHA. |
| `dependency-review.yml` | Blocks PRs that add high or critical vulnerabilities. Also runs the audit script weekly (Mon 09:00 UTC) and on manual dispatch. |
| `dependabot.yml` | Weekly npm and github-actions updates. Groups: `astro` (`astro`, `@astrojs/*`), dev dependencies. |
| `fallow.yml` | Pin `actions/checkout` by SHA. No other changes. |
| `AGENTS.md` | Add `Verify: npm run verify` under Commands. |

Pinned SHAs come from johnsblog: `actions/checkout` v7.0.1,
`actions/setup-node` v7.1.0, `actions/dependency-review-action` v5.0.0.

New devDeps: `@astrojs/check` and `typescript`.

Must not break: `npm run build` (the Workers Builds deploy), `npm run test`, the
notify and report workflows, or the fallow PR comment.

No pre-push hook (you chose no).

## Build steps

1. **Typecheck.** Add `@astrojs/check` + `typescript` and the `verify` script.
   Fix any type errors `astro check` reports. If there are many errors, stop
   and re-scope before fixing them.
   *Done when:* `npm run verify` passes locally.
2. **Dependency fixes.** Run `npm audit fix`, then bump sharp to 0.35.x.
   Add the `audit` script.
   *Done when:* `npm run audit` exits 0 and `npm run verify` still passes.
3. **Workflows.** Add `verify.yml`, `dependency-review.yml`, and
   `dependabot.yml`. Delete `test.yml` (approved as part of this spec). Pin
   checkout in `fallow.yml`. Document Verify in `AGENTS.md`.
   *Done when:* the YAML parses and `fallow audit` passes.

## Verify

- Local: `npm run verify`, `npm run audit`, and `npm run test` all pass.
  Fallow's gate passes.
- GitHub (after `/complete` opens the PR): Verify, Dependencies/review, and
  Fallow Audit go green on the PR. The old `Test` check is gone.
- Follow-up on GitHub, done by you: update the `main` ruleset to require
  `Verify` instead of `Test`, if `Test` is currently required.
