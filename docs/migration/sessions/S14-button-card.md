# Session S14 — Button + Card

> Copy of `docs/migration/SESSION-TEMPLATE.md`, filled in. Lands as
> `docs/migration/sessions/S14-button-card.md`.

**Stream:** design-system
**Depends on:** S11 (tokens + theme), S12 (base CSS + reduced motion), S13 (Icon + component testing)
**PR:** <#___>   **Branch:** `migrate/S14-button-card`
**Status:** 🟦 PR open

## Goal (one sentence)

Build the two design-system primitives every later surface leans on — `Button.svelte` (four
variants, three sizes, a real `loading` prop) and `Card.svelte` (static / interactive / KPI tile) —
on the S11 tokens, keeping the `.ird-btn` class family for coexistence.

## In scope

- `web/src/lib/components/Button.svelte` + `web/src/lib/components/button.ts`
- `web/src/lib/components/Card.svelte` + `web/src/lib/components/card.ts`
- `web/src/routes/kit/button/+page.svelte`, `web/src/routes/kit/card/+page.svelte` (staging smoke pages)
- `web/tests/component/{Button,Card}.test.ts`, `web/tests/e2e/kit-{button,card}.spec.ts`

## Out of scope (do NOT touch)

- Every legacy file. Nothing under `css/`, `js/`, `admin/` or the public HTML changed.
- IconButton, Badge, Avatar — DESIGN-SYSTEM's appendix files them under S14 but the ROADMAP row and
  this session's brief are Button + Card. **Owed; see NOTES.md "Open for the parent".**
- The S12 §5 state system (`StateLoading`/`StateEmpty`/`StateError`) — S12 deferred it pending
  Button; still unassigned.
- Tokens, base CSS, `theme.svelte.ts`, `Icon.svelte`, the test harness config (all consumed as-is).

## Prereqs (read before writing code)

- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010/G-018/G-019),
      `CLAUDE.md` §4/§5, `docs/migration/ROADMAP.md` (S14 row), `DESIGN-SYSTEM.md` (§1, §2, §3,
      §4.1 Button/Card, §6.1), `PORT-DEBT.md` (S14 row), `docs/admin-ux.md`, `VERIFICATION.md`.
- [x] Dependency sessions S11/S12/S13 present in the harness and green before any new file was added.
- [x] Legacy source of truth: `css/pages/admin/buttons.css:1-33`, `css/components/buttons.css:1-201`,
      `js/pages/admin/auth.js:88-96`, `js/pages/admin/form-wizard.js:203`,
      `js/pages/admin/event-form.js:177,282`, `css/pages/admin/dashboard.css:28-122`,
      `css/pages/admin/treasury.css:105-110`, `js/pages/admin/grid-balance.js:18,38`.
- [x] Fixture / golden: none — this is new UI, not a ported pure function. Parity is against the
      DESIGN-SYSTEM state matrices, asserted as component + e2e tests.

## Steps

1. Rebuilt the harness from `origin/migrate/S09-pdf` + the S11/S12/S13 deliverables; confirmed all
   four gates green **before** adding anything (511 tests).
2. Wrote `button.ts` / `card.ts` (unions + BEM block + the `KpiTile` shape) and the two components.
3. Reconciled the legacy baseline numbers to tokens: `--fs-btn` (D-015), `--shadow-sm`/`--shadow-md`,
   `--radius-md`, `--btn-pd-*`; substituted the surface/ink pairs CLAUDE.md §4 requires.
4. Wrote the two showcase routes and the component + e2e tests.
5. Ran the gates, then a real-browser pass over the built pages (17 Playwright checks) covering the
   computed colours, focus ring, loading width, dark mode, 360px and reduced motion.

## Acceptance criteria (ROADMAP "Done when": all variants render · href→`<a>` else `<button>` · focus-visible ring)

- [x] All four Button variants × three sizes × default/hover/focus-visible/active/disabled/loading
      render, on both elements and both palettes (`/kit/button/`, 21 component tests).
- [x] `href` → `<a>`; no `href` → `<button>`; a disabled link drops `href`, leaves the tab order and
      declares `aria-disabled`.
- [x] Visible focus-visible ring on Button and on the interactive Card — measured 2px solid in
      Chromium, and specific enough (0,2,0) to beat the reset's `button:active { outline: none }`.
- [x] `loading` is a component prop: spinner + `disabled` + `aria-busy="true"` + **width unchanged**
      (measured: 0px delta) + the accessible name survives.
- [x] Card renders one radius (10px) and one shadow; static → `<div>`, interactive → real
      `<a>`/`<button>`; the KPI tile always states its scope.
- [x] Token-only: zero hex literals, zero px/raw-rem `font-size`, zero `@media (prefers-color-scheme)`
      in either component (asserted in the component tests, and by S11's repo-wide guard).
- [x] No horizontal scroll at 360px on either showcase page; every transition neutralised under
      `prefers-reduced-motion: reduce`.
- [x] No new console errors on either page.
- [x] Legacy untouched — deliverables are 10 new files under `web/`.

## Verification gate

Ran `docs/migration/VERIFICATION.md` in a clean harness (`git archive origin/migrate/S09-pdf` +
S11/S12/S13 deliverables + `npm ci` + `web/.env`):

```
[x]  1. Install clean       npm ci                                    → exit 0
[x]  2. Typecheck           npm run check                             → 489 files, 0 errors, 0 warnings
[x]  3. Lint / format       npm run lint                              → prettier clean, eslint 0 problems
[x]  4. Unit tests          npm run test                              → 24 files, 554 passed / 2 skipped
                                                                        (+43 new: Button 21, Card 22;
                                                                         baseline before S14 was 511)
[ ]  5. Golden parity       n/a — new UI, no legacy golden to match. Parity is the DESIGN-SYSTEM
                            state matrix, asserted in tests/component + tests/e2e.
[x]  6. Build               BASE_PATH=/app npm run build              → build/kit/{button,card}/ emitted,
                                                                        0 errors, base applied
                                                                        (href="/app/kit/card/")
[x]  7. Preview smoke       npx playwright test kit-button kit-card   → 17/17 (see the landmine about
                                                                        port 4173 in NOTES.md)
[x]  8. Legacy untouched    10 new files, all under web/
[ ]  9. Parity walk         n/a — no legacy screen is being replaced yet; the components are
                            consumed from S16 on.
[ ] 10. SEO diff            n/a — /kit/* is noindex staging, not a public route.
[ ] 11. SW cache bumped     n/a — no cutover.
[x] 12. Secrets/PII clean   no keys, no PII; the only .env is the harness stub.
[ ] 13. Ledger updated      MIGRATION.md status board + Current state — owner: the merging session.
```

## How to resume if interrupted

- Branch: `migrate/S14-button-card`. Last known-good: all four gates green with the 10 files in place.
- Done so far: Button + Card + their contract modules, both showcase routes, component + e2e tests.
- Next concrete action: nothing outstanding for S14 itself. The next hands should decide the
  IconButton / Badge / Avatar question in NOTES.md "Open for the parent" before S16 needs a modal
  close button.
- Landmines: see NOTES.md — the `.ird-btn--sm` + full-width gap, the eslint
  `no-navigation-without-resolve` rule, the `target` prop colliding with a testing-library option,
  and the shared port 4173.

## On completion

- [ ] Update `MIGRATION.md`: status board (Phase 1), Current state, Next up; consider promoting the
      three decisions in NOTES.md to `D-0xx` (fixed-white ink on solid fills, the translucent border
      idiom, required KPI `scope`).
- [ ] Amend `DESIGN-SYSTEM.md` §4.1 Button/Card with the shipped prop tables (NOTES.md has them).
- [ ] Open/refresh the PR; paste the gate results; link this file.
