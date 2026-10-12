# Session S12 — Global CSS baseline + a11y

**Stream:** design-system
**Depends on:** S11 (tokens + `app.css` + `$lib/test/css`)   **PR:** <#___>   **Branch:** `migrate/S12-css-baseline`
**Status:** 🟦 PR open

## Goal (one sentence)
Port the legacy global CSS (`css/base/*`, `css/layout/*`, `css/utilities/*`) into `src/lib/styles/{base,layout,utilities}/` concatenated into `app.css` in cascade order, with the reduced-motion guard and the ≥16px mobile-input floor honoured globally, plus a `reduced-motion.ts` reactive signal for JS-driven motion.

## In scope
- `web/src/lib/styles/base/{reset,forms,motion}.css` (new — element selectors only)
- `web/src/lib/styles/layout/{container,zigzag}.css` (new)
- `web/src/lib/styles/utilities/{animations,scroll-reveal,a11y}.css` (new)
- `web/src/lib/styles/app.css` (edit — appends base → layout → utilities after S11's tokens)
- `web/src/lib/reduced-motion.ts` (new — `prefersReducedMotion.current`, `motionMs()`)
- `web/src/routes/kit/base/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/tests/unit/reduced-motion.test.ts`, `web/tests/unit/css-baseline.test.ts` (new)
- `web/tests/e2e/kit-base.spec.ts` (new — real-browser proof; not in the CI gate)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `css/base/*`, `css/layout/*`, `css/utilities/*`, `js/app/scroll-reveal.js`, `js/include.js` (live).
- **DESIGN-SYSTEM §5 State system components** (`StateLoading/StateEmpty/StateError`) — spec'd "(S12)" but they need Icon (S13) and Button (S14) for the retry affordance; deferred, see NOTES.md "Open for the parent".
- Switch/Toggle base (§4.3) — a form control, S21 owns the field vocabulary.
- The scroll-reveal IntersectionObserver (S23 chrome) — only the CSS is here.
- DB / RLS / edge functions.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-015/D-017, §3 G-019) and `CLAUDE.md` §4; `DESIGN-SYSTEM.md` §1 + §5; `PORT-DEBT.md` S12 row + dead-code rows 5–6; `docs/admin-ux.md` §2/§4/§5.
- [x] S11 deliverables present (this session's harness = S09 base + S11 + S12).
- [x] Legacy source of truth: `css/base/base.css:1-163`, `css/base/forms.css:9-16`, `css/layout/container.css:1-115`, `css/layout/zigzag.css:1-86`, `css/utilities/animations.css:1-310`, `css/utilities/scroll-reveal.css:1-73`, `css/pages/admin/account.css:219-232` (the dead density/reduce-motion hooks — NOT ported).
- [x] Fixture / golden: none (no runtime output); `css-baseline.test.ts` is the text contract, `kit-base.spec.ts` the computed-style contract.

## Steps
1. Split legacy `base.css` into element-only `reset.css` (+ move `.skip-link` to `utilities/a11y.css`; drop `#header`, `.section`, `.email-link`, `html.ready`, the tel/mailto white links — rationale in NOTES).
2. `forms.css`: the iOS floor as `:is(input:not(…)×4, select, textarea, [contenteditable])` so every control gets (0,4,1) — fixes the legacy select/textarea gap found in the browser smoke.
3. `motion.css`: the one global `prefers-reduced-motion` block (durations 0.01ms + delays 0 + `scroll-behavior: auto`, all `!important`).
4. Port `container.css` / `zigzag.css` with tokens (`--radius-md`, `--z-base`, `transparent`); drop the dead `var(--bp-xs)` media query and the invalid `minmax()` width.
5. Port `animations.css` / `scroll-reveal.css`; add the reduce-motion block that shows hidden-by-default reveal classes; drop the menu/captcha component transitions.
6. `reduced-motion.ts` on `svelte/reactivity` `MediaQuery` (lazy, SSR-safe); `/kit/base/`; tests; gate.

## Acceptance criteria
- [x] `.wrapper` renders (radius 10px, `--container-shadow`, `overflow: clip`) and the zigzag grid is 2 columns at 1280px / 1 column at 360px (browser-verified).
- [x] Every text-like input, `select`, `textarea` and `[contenteditable]` computes ≥16px at 360px even when a component class sets `--fs-sm` (browser-verified: 9/9 controls = 16px); desktop input keeps its component size (15.99px).
- [x] `prefers-reduced-motion: reduce` kills transitions (`transition-duration` 0.85s → 0s), stops `.autoRotate` (`animation-name: none`) and shows `.scroll-fade-up` (opacity 0 → 1) (browser-verified via `emulateMedia`).
- [x] `prefersReducedMotion.current` / `motionMs()` react to the OS change in the template (browser-verified: page flips to "activado", `motionMs(240) = 0`).
- [x] No horizontal scroll at 360px on `/kit/base/` (browser-verified `scrollWidth ≤ innerWidth`).
- [x] Skip link hidden until Tab, then visible with the global `:focus-visible` ring (browser-verified).
- [x] `app.css` imports tokens → base → layout → utilities, every stylesheet exactly once; base/ has no class/id selectors; only canonical breakpoints (768/640/600/480/900/1100); no hex outside tokens; no px font-size except the 16px floor (unit tests).
- [ ] No change to still-live legacy files — verify on the real branch.

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md` boxes 1–4, 6, 7, 8, 12 in the clean harness (S09 base + S11 + S12):
  - `npm run check` → `461 FILES 0 ERRORS 0 WARNINGS`
  - `npm run lint` → prettier clean, eslint 0 problems
  - `npm run test` → 29 files / 737 tests passed, 2 skipped (S12 adds 25: reduced-motion 7 + css-baseline 18)
  - `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`; `build/kit/base/index.html` prerendered; bundled CSS 18.4 kB with `font-size:max(1rem,16px)` and 4 `prefers-reduced-motion:reduce` blocks intact
  - Preview smoke (`vite preview` + Chromium): 11/11 base checks passed (see Acceptance). The first run caught the select/textarea 14px bug (fixed with `:is()`).
  - `npx playwright test` (real `playwright.config.ts` webServer, Chromium headless shell 1234) → **10 passed** (`smoke.spec.ts` 1 + `kit-tokens.spec.ts` 5 + `kit-base.spec.ts` 4), 7.6s.
- Box 5 (golden) N/A — CSS has no runtime oracle.

## How to resume if interrupted
- Branch: `migrate/S12-css-baseline` (on top of S11). Last known-good commit: see PR.
- Done so far: everything in this scratch dir is final and gate-green in the harness with S11 applied.
- Next concrete action: apply S11, then copy `s12/web/**` (its `app.css` supersedes S11's), `cd web && npm ci && npm run check && npm run lint && npm run test && BASE_PATH=/app npm run build`, open the PR.
- Landmines: NOTES.md — the `:is()` floor beats scoped classes on purpose; `base/` must stay class-free (test); dropped legacy rules are listed with reasons; S13 must handle `svg { display: block }` for inline sprite icons.

## On completion
- [ ] Update `MIGRATION.md`: status board (S12 → 🟦), Current state (`/app/kit/base/`), Next up (S13). Candidate ledger entry: **G-024** legacy `forms.css` floored only `<input>` (bare `select`/`textarea` lost to any class) — fixed in the port with `:is()`; and the note that §5 State components move to a post-S14 slot.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
