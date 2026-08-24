# Session S11 — Design tokens + theme

**Stream:** design-system
**Depends on:** S02 (scaffold), S05 (test harness)   **PR:** <#___>   **Branch:** `migrate/S11-design-tokens`
**Status:** 🟦 PR open

## Goal (one sentence)
Port the legacy token families (`css/tokens/*.css` + the admin `palette.css` override) to `web/src/lib/styles/tokens/*` → `app.css`, re-tuned per the locked decisions (D-014 slate admin scope, D-015 monotonic type scale, D-016 money tokens, D-017 one dark-mode mechanism), plus a runes `theme` module with a no-FOUC pre-paint boot script.

## In scope
- `web/src/lib/styles/tokens/{colors,typography,sizes,spacing,radius,shadows,z-index,admin}.css` (new)
- `web/src/lib/styles/app.css` (new — tokens only; S12 appends base/layout/utilities)
- `web/src/lib/theme.svelte.ts` (new — runes module; `.svelte.ts` because it holds `$state`)
- `web/src/app.html` (edit — inline no-FOUC boot script)
- `web/src/routes/+layout.svelte` (new — imports `app.css`, calls `initTheme()` on mount)
- `web/src/routes/kit/tokens/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/src/lib/test/css.ts` (new — test helper: bundles `app.css` @imports, extracts blocks/declarations)
- `web/tests/unit/theme.test.ts`, `web/tests/unit/tokens.test.ts` (new)
- `web/tests/e2e/kit-tokens.spec.ts` (new — real-browser proof; not in the CI gate, like `smoke.spec.ts`)
- `web/vitest.config.ts` (edit — svelte plugin + `resolve.conditions: ['browser']`)
- `web/eslint.config.js` (edit — `.svelte.ts` files get the TS sub-parser)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `css/tokens/*`, `css/pages/admin/palette.css`, `admin/index.html`, `js/pages/admin/prefs.js` (live; DUAL-MAINTENANCE)
- Any component (Button/Card/Badge…) — S13+. The `--status-*` / `--money-*` / `--shadow-*` tokens are the *contract* those sessions consume.
- The `(admin)` route group itself (S37) — this session only defines the `[data-surface="admin"]` selector contract it must apply.
- DB / RLS / edge functions.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 — D-014/D-015/D-016/D-017; §3 — G-018/G-019/G-020) and `CLAUDE.md` §4.
- [x] `DESIGN-SYSTEM.md` §2 Tokens + §3 Dark mode + §6.4; `PORT-DEBT.md` S11 row.
- [x] Prereqs S02/S05 are on `origin/migrate/S09-pdf` (the harness base).
- [x] Legacy source of truth: `css/tokens/colors.css`, `typography.css`, `sizes.css`, `spacing.css`, `radius.css`, `shadows.css`, `z-index.css`; `css/pages/admin/palette.css:10-15`; `admin/index.html:52-58` (pre-paint script); `js/pages/admin/prefs.js` (theme branch); `js/pages/admin/state.js:79-86` (`CAT_COLORS`, deleted — not ported).
- [x] Fixture / golden: none — tokens have no legacy runtime oracle. The contract tests in `tokens.test.ts` (money/fs defined once in `:root`, scale monotonic, forced-dark ≡ system-dark, admin scoped, no `prefers-color-scheme` outside tokens) are the regression guard.

## Steps
1. Port each token file verbatim except the locked deviations; move the shadow trio to `shadows.css` on a reversing `--shadow-rgb`; add `--money-*`, `--status-*`, `--color-done`, `--color-focus`.
2. Re-tune `--fs-*` monotonic on one 360→1280px ramp (documented table in `typography.css`).
3. Scope the palette override to `[data-surface="admin"]` in `tokens/admin.css`; document the selector contract.
4. Write `theme.svelte.ts` (`theme.current/resolved/set`, `initTheme`, `THEME_BOOT_SCRIPT`) and inline the boot script in `app.html` (`<!-- prettier-ignore -->` keeps it byte-identical).
5. Wire `app.css` + `initTheme()` in the root layout; build `/kit/tokens/`.
6. Tests; verification gate.

## Acceptance criteria
- [x] `var(--fs-lg)` resolves (`clamp(1.25rem, 1.152rem + .435vw, 1.5rem)`; computes 24px at 1280px — browser-verified).
- [x] light/dark/system toggle flips the palette: `data-theme` set/removed on `<html>`, body bg white ↔ `#121c1f`, `--money-pos` `#1e6b61` ↔ `#4fc3a1` (browser-verified).
- [x] No reload flash: with the app JS bundle blocked, a stored `dark` still paints dark from the inline boot script (browser-verified).
- [x] Admin slate override reproduced and scoped: `--color-secondary` is `#9a6a2c` outside and `#475569` inside `[data-surface="admin"]` (browser-verified).
- [x] Type scale monotonic — min AND max strictly increase xxs→4xl; `--fs-lg` (20–24px) is the mid-range step between labels (`--fs-xs`) and KPI numbers (`--fs-xl`) (unit test).
- [x] One shadow definition (`tokens/shadows.css`); `colors.css` no longer declares `--btn-shadow`/`--container-shadow`/`--image-shadow` (unit test).
- [x] `--money-*` ×6 defined once in `:root` and reversed in BOTH dark blocks; the two legacy greens collapsed (`#1c7a52` absent) (unit test).
- [x] `data-theme` / `prefers-color-scheme` appear in `tokens/colors.css` only; forced-dark block ≡ system-dark block token-for-token (unit test).
- [x] Category colour has one source (`--cat-*`); no `CAT_COLORS` / category hex in any `web/` ts/svelte (unit test).
- [x] Every `.svelte`/`.css` in the port is token-only (no hex outside `tokens/`), no px font-size, `prefers-reduced-motion` guard on the one transition.
- [ ] No change to still-live legacy files (`git diff --stat` clean outside `web/` + docs) — verify on the real branch.

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md` boxes 1–4, 6, 7, 8, 12 in a clean harness (`git archive origin/migrate/S09-pdf web` + `npm ci`, `web/.env` stubbed):
  - `npm run check` → `461 FILES 0 ERRORS 0 WARNINGS`
  - `npm run lint` → prettier clean, eslint 0 problems
  - `npm run test` → 29 files / 737 tests passed, 2 skipped (S11 adds 47: theme 22 + tokens 25)
  - `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`; `build/kit/tokens/index.html` prerendered; bundled CSS has 0 leftover `@import`, tokens first, `[data-surface=admin]` present
  - Preview smoke (`vite preview` + Chromium, scratch script → now `tests/e2e/kit-tokens.spec.ts`): 16/16 token checks passed — no console errors, fs-lg 24px, toggle + persistence, no-FOUC with JS blocked, dark-OS system + forced-light opt-out, admin scope, money reversal.
  - `npx playwright test` (real `playwright.config.ts` webServer, Chromium headless shell 1234) → **10 passed** (`smoke.spec.ts` 1 + `kit-tokens.spec.ts` 5 + `kit-base.spec.ts` 4), 7.6s.
- Box 5 (golden) N/A — no legacy runtime output to diff; the deliberate re-tunes are D-015/D-016 and are recorded in NOTES.md.

## How to resume if interrupted
- Branch: `migrate/S11-design-tokens`. Last known-good commit: see PR.
- Done so far: all files in this scratch dir are final and gate-green in the harness.
- Next concrete action: copy `s11/web/**` onto the branch (`web/`), `cd web && npm ci && npm run check && npm run lint && npm run test && BASE_PATH=/app npm run build`, open the PR, paste the gate.
- Landmines: see NOTES.md — `.svelte.ts` needs the vitest svelte plugin + `browser` condition and the eslint `files` change; `app.html` boot script must stay byte-identical (`prettier-ignore`); `[data-surface="admin"]` must NOT go on `<html>`; `--color-success` fails AA as text (use `--money-pos`/`--status-*` ink).

## On completion
- [ ] Update `MIGRATION.md`: status board (S11 → 🟦), Current state (`/app/kit/tokens/` in staging), Next up (S12). Candidate ledger entries (parent decides): **D-020** `--shadow-rgb` + `[data-surface="admin"]` selector contract + `ird.theme` storage key; **G-023** `.svelte.ts` tooling (vitest svelte plugin + `resolve.conditions: ['browser']`, eslint `files` glob).
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
