# Session S17 — ActionSheet

**Stream:** design-system
**Depends on:** S13 (`Icon.svelte` + `isFaIconName`, component-test harness), S12 (`$lib/reduced-motion`, global focus ring, reduced-motion base), S11 (tokens: `--z-action-*`, `--money-*`, `--color-surface`, `--fs-*`)   **PR:** <#___>   **Branch:** `migrate/S17-action-sheet`
**Status:** 🟦 PR open

## Goal (one sentence)
Ship `ActionSheet.svelte` — the one contextual menu (desktop popover that anchors, flips and repositions; bottom sheet ≤640px; `role=menu` + roving-tabindex `menuitem` rows; Escape closes and returns focus to the trigger) — plus the imperative `showActionSheet()` singleton + `<ActionSheetHost>` so the 8 non-component legacy call sites port unchanged.

## In scope
- `web/src/lib/components/action-sheet.svelte.ts` (new — the contract: `SheetAction`/`SheetGroup`/`ActionSheetRequest`, `popoverPosition()`, `buildSections()`, `iconName()`, `isMobileViewport()`, the `showActionSheet`/`closeActionSheet` singleton)
- `web/src/lib/components/ActionSheet.svelte` (new — the component)
- `web/src/lib/components/ActionSheetHost.svelte` (new — mounts the singleton inside a surface's layout)
- `web/src/routes/kit/action-sheet/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/tests/unit/action-sheet.test.ts` (new — 22), `web/tests/component/ActionSheet.test.ts` (new — 32)
- `web/tests/e2e/kit-action-sheet.spec.ts` (new — 7, real browser; not in the CI gate)
- `MIGRATION.md` status board / Current state / this session file (same PR)

**No config change.** No new devDependency, no `vitest.config.ts` / `package.json` / `svelte.config.js` edit — S13's component-test setup covers this session as-is.

## Out of scope (do NOT touch)
- Legacy `js/components/action-sheet.js`, `css/components/action-sheet.css`, and the three bespoke menus (`.se-menu__pop`, `.dscp-member-pop`, `.dz-pop`) — live, DUAL-MAINTENANCE. They die when their surfaces port (S44/S48–S50/S53/S56/S57/S59–S63).
- The `(admin)` route group and its `data-surface="admin"` wrapper (S37) — the host has no home until then; only `/kit/action-sheet/` mounts it now.
- Modal / ConfirmDialog (S16) and the shared reference-counted scroll lock it owns — see NOTES "Deliberate divergences" #3.
- Button / IconButton (S14): the kebab trigger on the kit page is local page CSS, not a shipped `.kebab-btn` component.
- DB / RLS / edge functions / the SW.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-018/G-019), `CLAUDE.md` §4/§5, `DESIGN-SYSTEM.md` §1/§2/§4.2 ActionSheet/§6.1/§6.2, `PORT-DEBT.md` S17 row, `docs/admin-ux.md`, `SESSION-TEMPLATE.md`, `VERIFICATION.md`.
- [x] S11 + S12 + S13 deliverables applied to the harness (S09 base + those three + this).
- [x] Legacy source of truth: `js/components/action-sheet.js:1-155`, `css/components/action-sheet.css:1-193`, and the 8 call sites (`treasury-tab.js:576-602`, `special-events-tab.js:255-269`, `users.js:150`, `role-presets.js:294`, `ministries.js:127`, `calendar-tab.js:62`, `events-tab.js:275`, `project-treasury.js:282`) + `discipleship-tab.js:483-572` (the grouped member menu the shared API could not express).
- [x] Fixture / golden: none — no serialisable output. `popoverPosition()` is the legacy `positionPopover()` math extracted as a pure function and pinned by 7 unit cases instead (same clamp order, same 8/12px constants, same 240×200 pre-measure fallback).

## Steps
1. Read the legacy component + CSS + every call site; catalogue what the shared API could NOT express (groups, per-row disabled/description) and what PORT-DEBT forbids re-porting.
2. `action-sheet.svelte.ts`: types, constants, `popoverPosition()` (pure, legacy-faithful), `buildSections()` (grouping + flat roving indices + per-row icon sanitising through S13's `isFaIconName`), `isMobileViewport()`, and the `$state` singleton with key-scoped `closeActionSheet(key?)`.
3. `ActionSheet.svelte`: `visible`/`shown` two-phase mount so the close animation survives; measure → place → focus → rAF-open; document Escape listener; sheet-level Arrow/Home/End/Tab; `close(run?)` defers the action `motionMs(60)` and unmounts at `motionMs(240)`; trigger `aria-haspopup`/`aria-expanded` marked and restored.
4. CSS from the legacy sheet, retokenised: `--color-surface` card, `--shadow-lg`, `--radius-lg`, `color-mix` hairlines/washes off `--color-text`, `--money-*` ink for warn/danger, house easing, reduce guard, inside-drawn focus ring.
5. `ActionSheetHost.svelte` (writable `$derived` mirror + `{#key}` per request) and the `/kit/action-sheet/` showcase.
6. Tests: unit (geometry/sections/singleton) + component (semantics/keyboard/activation/popover/bottom sheet/groups/trigger/host) + e2e; gate.
7. Real-browser run caught two bugs the jsdom suite could not (see NOTES landmines 1 & 2) — fixed, re-gated.

## Acceptance criteria
- [x] **Desktop popover anchors + repositions.** Right-aligned to the trigger, 8px below it; flips above on viewport-bottom overflow; clamped 12px inside both gutters; re-placed on `scroll` (capture) and `resize`. Browser-verified at all four viewport corners and while wheel-scrolling with the menu open; unit-pinned as pure math.
- [x] **Mobile ≤640px is a bottom sheet.** `translateY(110%)` → 0, dimmed scrim, explicit `Cancelar` row (browser at 360px: inset both sides, bottom-anchored, every row ≥44px, `scrollWidth − clientWidth ≤ 0`).
- [x] **`role="menu"` with `role="menuitem"` children**, `aria-orientation="vertical"`, named from title · subtitle (fallback `Acciones`); the visual header is `aria-hidden` so it is not read twice; groups are `role="group"` + `aria-labelledby`, separated by `role="separator"`.
- [x] **Arrow-key navigation.** ↑/↓ wrap, Home/End jump, roving tabindex follows focus, Tab dismisses. Focus enters the sheet on open (first row) — legacy did neither.
- [x] **Escape closes and returns focus to the trigger** (also on backdrop click, Cancelar, and after activating a row); the trigger's `aria-haspopup`/`aria-expanded` are restored to their prior values.
- [x] Grouped items: section label + divider + empty-section fallback (the `.dscp-member-pop` shape the shared legacy API could not express).
- [x] Per-row `disabled` (`aria-disabled`, still focusable, inert) and `description` — the contextual "Marcar pagado only when status=open" case.
- [x] Only one sheet open at a time; the action runs on a `motionMs(60)` defer so the close can start; a sheet opened **by** an action is not torn down by its predecessor's close timer.
- [x] PORT-DEBT: iOS blue `#0a84ff` dropped; no glassmorphism; the row default is the reversing slate ink.
- [x] Token-only CSS (no hex, no px/rem font-size), house easing, reduce guard on every transition, no `prefers-color-scheme`, no `{@html}`, no `window.__*`/inline `onclick`, no invented breakpoint. S11/S12 hygiene tests stay green over the new files.
- [x] Light **and** dark, public **and** `data-surface="admin"`, 1280px **and** 360px screenshotted and read as legible (see NOTES "What I looked at").
- [ ] No change to still-live legacy files — verify on the real branch (`git diff --stat` outside `web/` + docs must be empty).

## Verification gate
Clean harness: `MSYS_NO_PATHCONV=1 git archive origin/migrate/S09-pdf web | tar -x -C <scratch>/harness` + S11 + S12 + S13 deliverables + this session, `npm ci`, `web/.env` stubbed, line endings normalised to LF (S13 NOTES landmine 2 — **and dotfiles too**, see NOTES landmine 5).

- [x] `npm run check` → `485 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`
- [x] `npm run lint` → `All matched files use Prettier code style!`, eslint 0 problems
- [x] `npm run test` → `24 passed | 1 skipped (25)` files, `565 passed | 2 skipped (567)` tests, 5.8 s (S17 adds **54**: `tests/unit/action-sheet.test.ts` 22 + `tests/component/ActionSheet.test.ts` 32)
- [x] `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`; `build/kit/action-sheet/index.html` prerendered (the sheet itself is client-only and closed at rest, so no overlay markup ships in the HTML — correct)
- [x] `npx playwright test` (real `playwright.config.ts`, base `''`, Chromium headless shell 1234) → **21 passed** (`smoke` 1 + `kit-tokens` 5 + `kit-base` 4 + `kit-icon` 4 + `kit-action-sheet` 7), ≈8 s. **The first browser run failed 4/7 and found two real product bugs** (NOTES landmines 1 & 2) plus three spec bugs; all fixed, re-run green.
- Box 5 (golden) N/A — no serialisable output. The legacy geometry is pinned by unit cases, not a fixture.

## How to resume if interrupted
- Branch: `migrate/S17-action-sheet` (on top of S13). Last known-good commit: see PR.
- Done so far: everything in this scratch dir is final and gate-green in the harness with S11 + S12 + S13 applied.
- Next concrete action: apply S11 + S12 + S13, copy `s17/web/**` (nothing of theirs is superseded — S17 adds files only), `cd web && npm ci && npm run check && npm run lint && npm run test && MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`, open the PR.
- Landmines: NOTES.md — `focus()` is a no-op while the popover is still `visibility:hidden`; props are lazy getters and are unreadable at teardown; the sheet is deliberately NOT portaled; `vite preview` serves a stale build after a rebuild.

## On completion
- [ ] Update `MIGRATION.md`: status board (S17 → 🟦), Current state (`/app/kit/action-sheet/` in staging), Next up. Candidate ledger entries (parent decides):
  - **D-xxx** ActionSheet row ink is `--color-text` (not the `--color-dark` PORT-DEBT names): identical in light mode, and `--color-dark` is a *surface* that would be dark-on-dark on `--color-surface` in dark mode (CLAUDE.md §4). Loud rows use `--money-warn`/`--money-neg`, the only AA-tuned reversing amber/red inks — DESIGN-SYSTEM §2.1 already routes TEXT away from the fill tokens `--color-warn`/`--color-danger`. Consider `--ink-warn`/`--ink-danger` aliases in S11's tokens so a menu row need not name "money".
  - **D-xxx** Overlay hosts are rendered **in place** inside the surface layout, never portaled to `<body>` — required by the `[data-surface="admin"]` token contract (custom properties inherit). Consequence for every later overlay: no ancestor of a host may set `transform`/`filter`/`perspective`/`contain`, which would break `position: fixed`.
  - **G-xxx** `focus()` silently does nothing on a `visibility: hidden` element, and jsdom does not model that — a measure-then-place overlay must `await tick()` after clearing the hidden class before moving focus. Caught only by the real-browser run.
  - **G-xxx** Svelte 5 props are lazy getters: reading one during `onDestroy` evaluates the *parent's current* expression, which for a keyed/conditional host is `null` (throws) or the *next* request (wrong element). Cache any DOM element a component must touch at teardown.
- [ ] Amend DESIGN-SYSTEM §4.2 ActionSheet: record `disabled`, `description`, `groups: SheetGroup[]` (declared groups render first, ungrouped last) and the "Tab dismisses" rule.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
