# Session S10 — `waiver.ts` port (single-sourced)


**Stream:** foundation
**Depends on:** S05 (test harness), S07 (`escape.ts` — the port imports `esc` from `./escape`); S09 is a *downstream* dep only (consumers hand the docdef to `savePdf`/`openPdf` — `waiver.js` itself never imports `pdf.js`)   **PR:** <#___>   **Branch:** `migrate/S10-waiver`
**Status:** 🟦 PR open

## Goal (one sentence)
Port `js/lib/waiver.js` → `web/src/lib/waiver.ts` (constants + `WAIVER_CLAUSES` + `WAIVER_CSS` + `renderWaiverPrintDoc` + `buildWaiverDocDef`) verbatim-but-typed with golden parity, keeping the on-screen HTML and the pdfmake PDF single-sourced (D-004).

## In scope
- `web/src/lib/waiver.ts` (new)
- `web/tests/golden/waiver.test.ts` (new)
- `web/tests/unit/waiver-version.test.ts` (new — the D-004 snapshot)
- `web/tests/fixtures/waiver-html.json`, `waiver-docdef.json`, `waiver-constants.json` (new, captured from legacy)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `js/lib/waiver.js`, `js/pages/eventos/registro-wizard.js`, `js/pages/admin/special-events-tab.js` (live surfaces; VBS freeze)
- `web/src/lib/pdf.ts` (S09) and `web/src/lib/escape.ts` (S07) — assumed, not edited here
- Any wording change to clauses or `WAIVER_VERSION` (D-004: reviewed decision only)
- DB / RLS / edge functions

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 — esp. D-004, D-009; §3, current state) and `CLAUDE.md`.
- [ ] Confirm S05 and S07 are ✅ on the status board (S07 supplies `./escape`; until it merges this module cannot compile in `web/`).
- [x] Legacy source of truth: `js/lib/waiver.js` (entire file, 351 lines).
- [x] Fixture / golden: `web/tests/fixtures/waiver-{html,docdef,constants}.json` — created THIS session by running the legacy module in node (D-012; commands in NOTES.md). Never regenerate from the port.

## Steps
1. Capture goldens from legacy: run `js/lib/waiver.js` under node with a loader mapping `/js/...` → repo root; write 8 `renderWaiverPrintDoc` vectors, 7 `buildWaiverDocDef` vectors (layout callbacks normalized to `{ __fn: <return> }`), and the full constants snapshot.
2. Port `waiver.ts`: identical template literals, Spanish strings and clause text byte-for-byte; add typed option interfaces (`WaiverOptions` etc.); import `esc` from `./escape`; keep the `bold: has` value-leak verbatim (fixture pins it).
3. Add `tests/golden/waiver.test.ts` (itGolden over both fixtures, same `normalizeDocDef` as capture) and `tests/unit/waiver-version.test.ts` (D-004 snapshot + functional single-sourcing assertions).
4. Run the verification gate in `web/`.

## Acceptance criteria
- [x] `buildWaiverDocDef({ blank: true })` matches the legacy-captured golden (docdef vector 0).
- [x] All golden vectors pass: 8 HTML + 7 docdef + 8 constants (23/23 in scratch verify run; re-run as `npm run test` / `test:golden` once merged into a real `web/` worktree).
- [x] `WAIVER_VERSION` + every clause byte-identical to the snapshot (D-004); blank form omits `Doc. <version>`, filled form carries it, in BOTH outputs.
- [x] HTML and PDF stay single-sourced: every clause + title + ack asserted present in both outputs from the same constants.
- [x] `tsc --strict` clean (with `esc(value: unknown): string` from S07).
- [ ] No change to still-live legacy files (`git diff --stat` clean outside `web/` + docs).

## Verification gate
- [ ] Ran `docs/migration/VERIFICATION.md` — boxes 1–6, 8, 12, 13 apply (no surface/preview/SEO/SW boxes; this is a lib session). Box 5 is the load-bearing one; results pasted in the PR.
- Note per VERIFICATION.md: we assert docdef *structure/text*, never PDF bytes.

## How to resume if interrupted
- Branch: `migrate/S10-waiver`. Last known-good commit: see PR.
- Done so far: fixtures captured from legacy (23 vectors/constants); `waiver.ts` ported; both test files written; scratch verify 23/23; strict typecheck clean.
- Next concrete action: copy `web/` files from the S10 scratch dir into the branch worktree, `cd web && npm ci && npm run check && npm run test`, then open the PR and paste gate results.
- Landmines: see NOTES.md — esp. the `bold: has` value-leak (keep verbatim), template-literal whitespace is load-bearing, fixtures must never be regenerated from the port, `esc` must accept `unknown`.

## On completion
- [ ] Update `MIGRATION.md`: status board (S10 → 🟦/✅), Current state, Next up; no new D-xxx needed (D-004 already governs); consider a G-xxx for the `bold: has` leak if reviewers want it recorded.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
