# Session S21 — Disclosure + DataTable + FormWizard

**Stream:** design-system
**Depends on:** S11 (tokens + theme), S12 (base CSS + reduced-motion), S13 (Icon + component testing)
**PR:** <#___>   **Branch:** `migrate/S21-disclosure-datatable-formwizard`
**Status:** 🟦 PR open

## Goal (one sentence)

Build the three admin composites — `Disclosure.svelte`, `DataTable.svelte` (card-collapse below
1100px) and `FormWizard.svelte` (the shared step machine ported from `js/pages/admin/form-wizard.js`)
— so every later admin session has one collapse, one table and one wizard to consume.

## In scope

- `web/src/lib/components/Disclosure.svelte`
- `web/src/lib/components/DataTable.svelte` + `web/src/lib/components/data-table.ts`
- `web/src/lib/components/FormWizard.svelte` + `web/src/lib/components/wizard.ts`
- `web/src/lib/scroll-lock.ts` (new shared primitive — the reference-counted body lock the
  wizard needs and S16/S20 must reuse)
- Showcase routes `web/src/routes/kit/{disclosure,data-table,form-wizard}/+page.svelte`
- Tests: `tests/unit/{wizard,data-table,scroll-lock}.test.ts`,
  `tests/component/{Disclosure,DataTable,FormWizard}.test.ts` (+ `tests/component/fixtures/`),
  `tests/e2e/kit-s21.spec.ts`

## Out of scope (do NOT touch)

- The live legacy admin (`js/pages/admin/**`, `css/pages/admin/**`) — frozen; `DUAL-MAINTENANCE.md`
  governs.
- `Button` / `IconButton` / `Card` / `Badge` (S14, in flight in parallel). The nav and Retry
  controls carry the `.ird-btn` class names with a clearly-marked INTERIM scoped style; S14 takes
  them over.
- `Modal` / `ConfirmDialog` (S16), `ActionSheet` (S17): FormWizard owns its own overlay for now.
- The `StateLoading` / `StateEmpty` / `StateError` components DESIGN-SYSTEM §5.4 names — still
  unassigned (S12 deferred them to after S14). DataTable ships its own three states inline and
  should adopt the shared components when they land.
- The extended field-type union (color · checkbox · radio · toggle · multi-select · file ·
  rich-text · icon-picker · segmented) and SegmentedControl/SectionNav/MultiSelect/IconPicker,
  which DESIGN-SYSTEM §4.4's appendix also files under S21. This session delivers the roadmap row
  (Disclosure + DataTable + FormWizard) and the wizard's seven-type contract; the rest is additive
  and needs S14/S18 first.
- DB / RLS / edge functions. No repo-layer code.

## Prereqs (read before writing code)

- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-002/G-009/G-010/G-012/G-018/G-019) and `CLAUDE.md` §4/§5.
- [x] Read `docs/migration/ROADMAP.md` (S21 row), `DESIGN-SYSTEM.md` (§2 tokens, §4.3 field
      vocabulary, §4.4 Disclosure/DataTable/FormWizard, §5 states, §6 checklist),
      `PORT-DEBT.md` (S21 row), `docs/admin-ux.md`, `VERIFICATION.md`.
- [x] Dependency sessions S11/S12/S13 present in the harness (their deliverables copied in).
- [x] Legacy source of truth: `js/pages/admin/form-wizard.js`, `js/pages/admin/treasury-tab.js`
      (`WIZ` specs + `bindList`), `css/pages/admin/wizard.css`,
      `css/pages/admin/special-events.css` (`.se-reg-table`, `.se-collapse`),
      `css/pages/admin/treasury.css` (`.trez-table`, `.trez-pill`), `docs/admin-ux.md` §1/§2.
- [x] Fixture / golden: none needed — these are new UI, not a byte-parity port. The behavioural
      goldens are the component tests.

## Steps

1. Ported the wizard's pure logic to `components/wizard.ts` (field union, defaults, `showIf`,
   validation, the ONE review renderer, the submit-result reader) and unit-tested it.
2. Extracted DataTable's column contract + comparator to `components/data-table.ts` so sort state
   provably drives render order.
3. Added `$lib/scroll-lock.ts` — one reference-counted body lock for every overlay.
4. Built the three components, token-only, with the full state matrix and a reduced-motion guard on
   every animation.
5. Wrote the component tests (`@testing-library/svelte`, S13's harness) and the three `/kit/` pages.
6. Ran the four gates, then a real-browser Playwright smoke at 360px and 1280px.

## Acceptance criteria

- [x] **admin-ux conventions honored** — Disclosure is a real `<button>` with `aria-expanded` +
      `aria-controls`, the panel uses the `hidden` attribute, and it starts collapsed.
- [x] **The table has no horizontal scroll at 360px** — verified in Chromium:
      `documentElement.scrollWidth <= innerWidth` on `/kit/data-table/` at 360×740, `thead` hidden,
      each `td::before` rendering `attr(data-label)`. There is no `overflow-x` declaration in the
      component.
- [x] **The wizard drives the field-type contract** — `text · textarea · number · money · date ·
      select · choice` all render, validate and format for review from one union; the
      treasury `WIZ` spec shape (`toData` / `toPayload`) type-checks unchanged.
- [x] Progress strip is `steps.length + 1` (2 dots for a one-step wizard, 5 for four steps) —
      never a hard-coded 4.
- [x] Per-step validation blocks Siguiente, shows the message inline (`role="alert"`, not a toast)
      and moves focus to the first invalid field.
- [x] Submit shows the spinner + "Guardando…", disables, and on `{ error }` re-enables and stays
      open with the message inline.
- [x] Reference-counted scroll lock: the previous `body.style.overflow` is saved and restored, and
      a nested release does not unlock the page.
- [x] Token-only: no hex literal, no px/raw-rem font-size, no `@media (prefers-color-scheme)`
      anywhere in the three components; breakpoints are 1100 and 480 only.
- [x] No `window.__*` global and no inline `onclick=` attribute in emitted markup (asserted).
- [x] Live URLs unaffected — everything is new, under `/app/kit/*`.
- [x] No new console errors on smoke (Playwright collects `console.error` + `pageerror`; both empty).

## Verification gate

- [x] `npm run check` — **0 errors, 0 warnings** (500 files).
- [x] `npm run lint` — prettier clean + eslint clean.
- [x] `npm run test` — **619 passed | 2 skipped (621)**, 28 files (baseline before this session:
      511 passed / 22 files).
- [x] `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` — built, `build/kit/{disclosure,data-table,form-wizard}/`
      prerendered, assets resolve under `/app/_app/…`.
- [x] Browser smoke (not in the CI gate): `npx playwright test tests/e2e/kit-s21.spec.ts` —
      **10 passed** in Chromium against `vite preview` (3 × Disclosure, 4 × DataTable at 360px and
      1280px, 3 × FormWizard at 360px).

## How to resume if interrupted

- Branch: `migrate/S21-disclosure-datatable-formwizard`. Last known-good commit: see PR.
- Done so far: all three components + their pure modules, the shared scroll lock, 3 kit pages,
  3 component test files + 3 unit test files + 1 e2e spec. All four gates green.
- Next concrete action: none for S21. The follow-ups belong to other sessions — see NOTES.md
  ("Open for the parent").
- Landmines: see NOTES.md.

## On completion

- [ ] Update `MIGRATION.md`: status board, Current state, Next up, and the new decisions/gotchas
      NOTES.md proposes (the `scroll-lock` contract, the `$props.id()` rule replacing G-009, the
      Vitest hook-order landmine).
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
