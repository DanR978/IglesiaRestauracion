# Session Sxx — <short title>

> Copy this file to `docs/migration/sessions/Sxx-<slug>.md` and fill it in at the start of the session.

**Stream:** <foundation | design-system | public | admin | hard-subsystem | testing/cutover>
**Depends on:** <Syy, Szz | none>   **PR:** <#___>   **Branch:** `migrate/Sxx-<slug>`
**Status:** ⬜ not started / 🟨 in progress / 🟦 PR open / ✅ done

## Goal (one sentence)
<e.g. Port js/lib/validators.js → web/src/lib/validators.ts with golden parity.>

## In scope
- <files / surfaces this session WILL touch>

## Out of scope (do NOT touch)
- <live legacy files, other streams, DB/RLS, unrelated surfaces>

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2, §3, current state) and `CLAUDE.md`.
- [ ] Confirm dependency sessions are ✅ on the status board.
- [ ] Legacy source of truth: <path(s)>
- [ ] Fixture / golden: <tests/fixtures/*.json — reuse, or create it this session>

## Steps
1. <…>
2. <…>

## Acceptance criteria
- [ ] <observable outcome, e.g. ported module byte-identical to golden>
- [ ] <live URLs unaffected / surface renders at the same path>
- [ ] <no new console errors on smoke>

## Verification gate
- [ ] Ran `docs/migration/VERIFICATION.md` — all applicable boxes green; results pasted in the PR.

## How to resume if interrupted
- Branch: `migrate/Sxx-<slug>`. Last known-good commit: <sha / "see PR">.
- Done so far: <bullets, kept current>
- Next concrete action: <the very next command or edit>
- Landmines: <…>

## On completion
- [ ] Update `MIGRATION.md`: status board, Current state, Next up, new D-xxx / G-xxx.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
