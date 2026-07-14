# Migration operating manual

This folder is the **operating system for a multi-session rewrite** carried out by fresh Claude sessions that share no memory. The repo is the memory. Read this once; then every session follows the protocol below.

## The files

| File | Role |
|---|---|
| [`../../MIGRATION.md`](../../MIGRATION.md) | **The ledger.** Status board, locked decisions, gotchas. Read first, updated last, every session. |
| [`ROADMAP.md`](ROADMAP.md) | The full ~65-session backlog, dependency-ordered, in 7 phases. |
| [`VERIFICATION.md`](VERIFICATION.md) | The gate every session must pass before it's "done". |
| [`DUAL-MAINTENANCE.md`](DUAL-MAINTENANCE.md) | Rules for the live site during the months-long port + freeze windows. |
| [`DUAL-FIX-BACKLOG.md`](DUAL-FIX-BACKLOG.md) | The register of qualifying legacy critical fixes (and the rejected ones) — the freeze audit trail. |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | The appearance spec for the S11–S21 component library — variants, state matrices, tokens. **Read before building a component.** |
| [`PORT-DEBT.md`](PORT-DEBT.md) | The legacy bugs each port must NOT re-implement, filed per session. **Read your surface's row before porting it.** |
| [`SESSION-TEMPLATE.md`](SESSION-TEMPLATE.md) | Copy this to `sessions/NN-slug.md` to spec a session. |
| `sessions/NN-slug.md` | One written task file per session (created from the template when the session is picked up). |

## Why this exists

A full rewrite of this app is ~14–18 weeks. No single session holds it in context. Without a durable ledger + fixed protocol, session 12 undoes session 7's decision, re-fetches facts already learned, or ports a module with no oracle and silently changes behavior. This machinery prevents that: **decisions are append-only, every port is diffed against a golden, and every session is one reversible PR.**

## SESSION START protocol

The human kicks off a session by pasting something like:

```
Rewrite session. Read MIGRATION.md, then docs/migration/ROADMAP.md, then do session Sxx.
Create docs/migration/sessions/Sxx-<slug>.md from SESSION-TEMPLATE.md if it doesn't exist.
Stay in scope. Run the verification gate before finishing. One PR.
```

Claude's first actions, in order:
1. Read `MIGRATION.md` (§0 TL;DR, §2 decisions, §3 gotchas, §1 current state).
2. Read the `ROADMAP.md` row for `Sxx` and confirm its **prereqs are ✅** on the status board. If a prereq isn't done, stop and tell the human.
3. Read `CLAUDE.md` (repo conventions) and the session file (create it from the template if missing).
3.5. **Before porting a surface, read its row in [`PORT-DEBT.md`](PORT-DEBT.md)** — fold its *MUST FIX ON PORT* items into acceptance criteria and its *DO NOT PORT* items into out-of-scope. **Before building a component (S11–S21), read [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).** A port that reproduces a listed bug does not pass review.
4. `git status`, `git log --oneline -5`, create/confirm the branch `migrate/Sxx-<slug>`.
5. **Restate back to the human**: the goal, in/out-of-scope, and acceptance criteria — before editing anything.

## SESSION END protocol

1. Run the full [`VERIFICATION.md`](VERIFICATION.md) gate; paste results into the PR body.
2. Update `MIGRATION.md`: status board, **Current state**, **Next up**, and append any new **Decisions** (`D-xxx`) / **Gotchas** (`G-xxx`). Append-only.
3. Update the session file: status, "what's done", PR number, and "how to resume if interrupted".
4. Open/refresh the PR (one session = one PR). Request review.

## Branch / PR strategy

- Branch per session off `main`: `migrate/Sxx-<slug>`. Never commit the rewrite straight to `main`.
- **Squash-merge** each PR → one commit per session on `main` → a clean `git revert` is a per-surface rollback.
- **Legacy files are deleted only in the cutover PR, never earlier** — so a revert always restores a working legacy surface.
- Branch protection on `main`: require the CI gate (typecheck + lint + test + build) and the ledger-updated check.

## Golden rules (the ones that most often get violated across sessions)

1. **Diff every port against a golden.** Snapshot the legacy module's output on a fixture vector *before* porting; assert the port is byte-identical (or an explicitly approved diff recorded as a Decision). This is the only defense against silent behavior change on a codebase with no prior tests.
2. **Never break a live URL.** Port or redirect; keep trailing slashes. QR codes and bulletin links point at these.
3. **Don't move the trust boundary.** RLS stays the guard; the client stays anon-key + UX-only gating.
4. **Preserve, don't redesign** `pdf.js`, `waiver.js`, `fabric.js`, and the edge functions.
5. **Bump the SW cache version on every cutover** or users get stuck on the cached old page.
6. **Respect the freeze.** No `registro`/`admin` cutover during VBS/registration season (see `DUAL-MAINTENANCE.md`).
7. **Update the ledger in the same PR.** A decision or gotcha that isn't written down didn't happen.
