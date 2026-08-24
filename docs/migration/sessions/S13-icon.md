# Session S13 — Icon (Font Awesome + SVG sprite) + component testing

**Stream:** design-system
**Depends on:** S12 (global baseline; `svg { display: block }` reset, `$lib/reduced-motion`), S11 (tokens, `svelte()` in vitest)   **PR:** <#___>   **Branch:** `migrate/S13-icon`
**Status:** 🟦 PR open

## Goal (one sentence)
Ship `Icon.svelte` — the single icon component over Font Awesome 6.5.0 (`fas`/`far`/`fab`) and the trusted static SVG sprite (injected once by `injectSprite()`, retiring `js/utils/load-icons.js`) with a `label` prop that toggles `aria-label` vs `aria-hidden` — and establish component testing for the fleet (`@testing-library/svelte` + jest-dom, `tests/component/**`).

## In scope
- `web/src/lib/components/Icon.svelte` (new — the component)
- `web/src/lib/components/icon.ts` (new — `IconSet`, `SPRITE_ICONS`, name guards, `FA_*` pin, `injectSprite()`)
- `web/src/lib/assets/icons.svg` (new — verbatim copy of `resources/icons/icons.svg`, bundled via `?raw`)
- `web/src/app.html` (edit — the pinned, SRI-checked Font Awesome `<link>`)
- `web/svelte.config.js` (edit — `prerender.handleMissingId` scoped to the sprite ids; see NOTES landmine 1)
- `web/vitest.config.ts` (edit — `svelteTesting()` plugin, `setupFiles`, `tests/component/**` include)
- `web/package.json` + `web/package-lock.json` (edit — `@testing-library/svelte@^5.4.2`, `@testing-library/jest-dom@^7.0.1`)
- `web/tests/setup.ts` (new), `web/tests/component/Icon.test.ts` (new), `web/tests/unit/icon.test.ts` (new)
- `web/src/routes/kit/icon/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/tests/e2e/kit-icon.spec.ts` (new — real-browser proof; not in the CI gate)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `js/utils/load-icons.js`, `resources/icons/icons.svg`, `scripts/build-heads.mjs`, `admin/index.html`, `sw.js` (live; DUAL-MAINTENANCE).
- Avatar (DESIGN-SYSTEM appendix lists it under S13/S14) — its photo/initials algorithm belongs with Badge/Card in S14; nothing here depends on it.
- IconButton / Button (S14), the §5 State components (post-S14), IconPicker (S21).
- The root layout, `(admin)` group, any SW change.
- DB / RLS / edge functions.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010), `CLAUDE.md` §4/§5, `DESIGN-SYSTEM.md` §1/§4.1 Icon/§6.1, `PORT-DEBT.md` S13 row, `docs/admin-ux.md`, `VERIFICATION.md`.
- [x] S11 + S12 deliverables applied to the harness (S09 base + S11 + S12 + this).
- [x] Legacy source of truth: `js/utils/load-icons.js:1-53`, `resources/icons/icons.svg:1-362`, `scripts/build-heads.mjs:208` (FA link + SRI), `src/footer.html:88` (`#logo-church` consumer), the FA-class census (NOTES).
- [x] Fixture / golden: none (no runtime output). The sprite asset IS the legacy file byte-for-byte; `tests/unit/icon.test.ts` pins its symbol set and the FA URL/SRI hash (re-verified against the CDN file, NOTES).

## Steps
1. Census legacy icon usage (fas/far/fab/fa-spin, sprite consumers) and how FA + sprite are loaded; verify the SRI hash.
2. `icon.ts`: the set union, `SPRITE_ICONS` (closed), FA-name regex guard, FA pin constants, idempotent `injectSprite()` (DOM-verified cache, adopts a pre-existing holder, Safari `<use>` re-point).
3. `Icon.svelte`: one element per branch, `label` → `role="img"`+`aria-label` else `aria-hidden`, `spin`, `class`; sprite box `1em`/`currentColor`/`inline-block`; keyframe + reduce guard; `:global(#svg-sprite-holder)` clip.
4. `app.html`: the FA `<link>` with integrity/crossorigin/referrerpolicy.
5. Component testing: install testing-library, `svelteTesting()` + `setupFiles` + include in `vitest.config.ts`; `tests/component/Icon.test.ts`; `tests/unit/icon.test.ts`.
6. `/kit/icon/` showcase; `svelte.config.js` `handleMissingId` after the first build failed on `<use href="#…">`; e2e spec; gate.

## Acceptance criteria
- [x] `<Icon set="fas" name="church" />` renders `<i class="icon fas fa-church" aria-hidden="true">`; `far`/`fab` likewise (jsdom + browser: FA font resolves via `document.fonts.check`, `::before` content non-empty).
- [x] `<Icon set="sprite" name="logo-church" />` renders `<svg class="icon icon--sprite"><use href="#logo-church" xlink:href=…>` and paints (browser: `getBBox()` width/height > 0; 56×70 via class at 360px and 1280px).
- [x] Sprite injected **exactly once** into `<body>` (`#svg-sprite-holder`, `aria-hidden`, all 5 symbols) across many icons; FA-only pages never inject it (jsdom + browser).
- [x] `label` present → `role="img" aria-label="…"`, no `aria-hidden`; absent/blank → `aria-hidden="true"`, no role/label — identical on both branches (jsdom + browser `getByRole('img', { name })`).
- [x] An invalid name (`"spinner fa-spin"`, `"Image"`, `"g14"`, `""`) renders nothing and warns — no class injection, nothing untrusted reaches the sprite (jsdom; browser shows "0 iconos renderizados").
- [x] `spin` → `fa-spin` / `icon--spin`; under `prefers-reduced-motion: reduce` the sprite animation is `none` and FA's collapses to one 1 ms iteration (browser `emulateMedia`).
- [x] No horizontal scroll at 360px on `/kit/icon/` (browser `scrollWidth − clientWidth ≤ 0`).
- [x] Token-only CSS (no hex, no px/rem font-size), one reduce-guarded animation, no `prefers-color-scheme`, no inline styles, canonical breakpoints only — S11/S12 hygiene tests stay green over the new files.
- [x] Component testing works for later sessions: `render(Component, props)` under jsdom with auto-cleanup and jest-dom matchers; `tests/component/**` is in the gate.
- [ ] No change to still-live legacy files — verify on the real branch (`git diff --stat` outside `web/` + docs must be empty).

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md` boxes 1–4, 6, 7, 8, 12 in a clean harness (`git archive origin/migrate/S09-pdf web` + S11 + S12 deliverables + this, `npm ci`, `web/.env` stubbed, line endings normalised to LF — see NOTES landmine 2):
  - `npm run check` → `477 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`
  - `npm run lint` → `All matched files use Prettier code style!`, eslint 0 problems
  - `npm run test` → `22 passed | 1 skipped (23)` files, `511 passed | 2 skipped (513)` tests, 4.6 s (S13 adds 24: `tests/unit/icon.test.ts` 11 + `tests/component/Icon.test.ts` 13)
  - `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`; `build/kit/icon/index.html` prerendered with the FA `<link>` (URL + SRI), 60 `<i class="icon fas …">` and 14 sprite `<svg>`s server-rendered, no holder in the HTML (client-injected by design). First attempt FAILED on the crawler's missing-id check for `<use href="#icon-calendar">` → fixed with `handleMissingId` scoped to the sprite ids, rebuilt green.
  - `npx playwright test` (real `playwright.config.ts` webServer at base '', Chromium headless shell 1234) → **14 passed** (`smoke` 1 + `kit-tokens` 5 + `kit-base` 4 + `kit-icon` 4), ≈11 s. The first run caught a spec bug (`getBBox()` does not serialise across `evaluate`), not a product bug.
- Box 5 (golden) N/A — the sprite is byte-identical to the legacy asset (verbatim copy) and the FA pin is the legacy URL/hash; there is no runtime output to diff.

## How to resume if interrupted
- Branch: `migrate/S13-icon` (on top of S12). Last known-good commit: see PR.
- Done so far: everything in this scratch dir is final and gate-green in the harness with S11 + S12 applied.
- Next concrete action: apply S11 + S12, copy `s13/web/**` (its `app.html`, `vitest.config.ts`, `svelte.config.js`, `package.json`, `package-lock.json` supersede the earlier versions), `cd web && npm ci && npm run check && npm run lint && npm run test && MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`, open the PR.
- Landmines: NOTES.md — the crawler/`handleMissingId` coupling; CRLF from `git archive`; the holder lives outside the test container; `document.fonts.check` needs the CDN; keep `.icon--sprite { display: inline-block }`.

## On completion
- [ ] Update `MIGRATION.md`: status board (S13 → 🟦), Current state (`/app/kit/icon/` in staging; component testing available), Next up (S14). Candidate ledger entries (parent decides): **D-xxx** Font Awesome stays the pinned cdnjs 6.5.0 `<link>` with SRI, shared with legacy during the strangler period; the sprite is bundled (`?raw`) and injected once by `injectSprite()` — the sole D-005 `innerHTML` carve-out; `set` gains `'fab'`. **G-xxx** the prerender crawler treats every `href` (incl. `<use href="#id">`) as a fragment link — `svelte.config.js` `handleMissingId` whitelists only the sprite ids, read from the asset.
- [ ] Amend DESIGN-SYSTEM §4.1 Icon prop table (`'fab'`, `spin`, `class`).
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
