# Session S03 — Merged deploy: legacy + `/app` in one artifact

**Stream:** foundation
**Depends on:** S02   **PR:** <#___>   **Branch:** `migrate/S03-merged-deploy`
**Status:** 🟦 PR open

## Goal (one sentence)
Make `deploy.yml` build `web/` and ship it as `/app/` inside the same Pages artifact as the legacy site — and stop uploading `web/` sources to production.

## In scope
- `.github/workflows/deploy.yml` — add a SvelteKit build stage (setup-node 24 with npm cache on `web/package-lock.json` → `cd web && npm ci && BASE_PATH=/app npm run build` → `cp -r web/build/. app/`), inserted after the legacy generators and **before** the prune step; add `web` to the prune list.
- `MIGRATION.md` ledger update.

## Out of scope (do NOT touch)
- Any legacy build step, the `CNAME`, the artifact `path: .`, `configure-pages`/`deploy-pages`.
- `web/` itself (no app code — S04 adds config/env).
- No secrets/env for the web build yet (that is S04; the S02 hello page needs none).

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2 — esp. D-008 `/app` base path — §3, §4 "How prod deploys today") and `CLAUDE.md`.
- [ ] Confirm S02 ✅ on the status board.
- [ ] Legacy source of truth: `.github/workflows/deploy.yml` (the prune step runs LAST — the web build must precede it).
- [ ] Fixture / golden: none (workflow change). Oracle = artifact tree inspection (below).

## Steps
1. Insert the three steps between "Inline shared HTML fragments" and the prune step; extend the prune list with `web`.
2. Verify locally by replicating the pipeline's relevant parts (see acceptance criteria) — do **NOT** `workflow_dispatch` from the branch: `deploy.yml` has no branch guard on dispatch inputs and publishes to production. The real proof is the deploy that runs on merge to `main`.
3. After merge: smoke `https://www.irdlex.org/app/` (S02 hello page renders, assets load from `/app/_app/…`) and confirm `https://www.irdlex.org/web/package.json` now 404s (source no longer shipped).

## Acceptance criteria
- [ ] Local replication: `cd web && npm ci && BASE_PATH=/app npm run build` succeeds; simulated merge (`mkdir -p app && cp -r web/build/. app/`) yields `app/index.html` whose asset URLs are absolute under `/app/_app/…`; root `index.html` is byte-unchanged.
- [ ] `git diff` touches only `.github/workflows/deploy.yml`, this file, and `MIGRATION.md`.
- [ ] Post-merge (human check): live root pages unchanged; `/app/` serves the hello page; `web/` sources gone from the artifact.

## Verification gate
- [ ] Ran `docs/migration/VERIFICATION.md` — applicable boxes (#6 build succeeds, #8 scope, #13 ledger); #5/#10/#11 N/A (no ported module, no public-surface change, no cutover — `/app/` is a NEW url, D-001 unaffected).

## How to resume if interrupted
- Branch: `migrate/S03-merged-deploy`. Last known-good commit: see PR.
- Done so far: deploy.yml edited (build stage + prune), ledger updated.
- Next concrete action: merge; then the two post-merge smoke checks in Steps 3.
- Landmines: artifact-based Pages deploys skip Jekyll, so **no root `.nojekyll` is needed** for `app/_app/`; GitHub Pages serves only the ROOT `404.html` — see G-021.

## On completion
- [ ] Update `MIGRATION.md`: status board, Current state, Next up, new D-xxx / G-xxx (G-021 added).
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
