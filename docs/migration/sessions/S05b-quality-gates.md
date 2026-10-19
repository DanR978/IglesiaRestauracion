# Session S05b — Cross-engine, accessibility, budget and boundary gates

**Stream:** foundation (quality gates)
**Depends on:** S02b (D-030), S05   **PR:** PR-C1 (not opened yet)   **Branch:** `migrate/S02b-S05b-S22b-foundations`
**Status:** 🟦 PR open — `migrate/S02b-S05b-S22b-foundations` (PR-C1)

## Goal (one sentence)
Turn the proposed boxes 14–19 of [`testing-and-rollout.md` §1](../../architecture/testing-and-rollout.md#1-proposed-gates) into gates that run: four Playwright projects in CI, axe on every prerendered page in both themes, a per-page JS budget plus lab LCP/CLS, the layer import boundaries of [`target-architecture.md` §3](../../architecture/target-architecture.md#3-layers-and-dependency-rules-web) as lint, and `npm audit` for runtime dependencies.

## In scope
- `web/playwright.config.ts` — projects `chromium`, `webkit`, `Mobile Safari` (iPhone 15), `Mobile Chrome` (Pixel 7).
- New specs and helpers: `web/tests/e2e/a11y.spec.ts`, `perf.spec.ts`, `helpers/routes.ts`, `helpers/network.ts`.
- Minimal, commented adjustments to five existing specs where an engine differs (listed below).
- `web/scripts/check-budget.mjs` + `web/budget.json` + `npm run budget`.
- `web/eslint.config.js` — `no-restricted-imports` per layer.
- `web/package.json` + lockfile — `@axe-core/playwright` **4.14.0** (exact, dev) and the `budget` script; nothing else.
- `.github/workflows/ci.yml` — new `e2e` and `audit` jobs.
- `docs/migration/VERIFICATION.md` — boxes 14–19, box 6 reworded, box 12 extended.
- Six kit pages (`/kit/base|card|form-wizard|lightbox|signature-pad|toast/`): the real violations axe and the 360px check found.

## Out of scope (do NOT touch)
- Live legacy files — none changed.
- `MIGRATION.md`, `ROADMAP.md` — the PR-C1 ledger step (follow-ups below).
- Token values and the overlay focus code: the two recorded exceptions and X-1 have owners (below).
- `web/tests/unit/**` (S22b is editing `tests/unit/repos/` on the same branch) — so the layer rules got a scripted probe, not a unit test (follow-up; done in the review follow-ups below).
- ~~Dev-only `npm audit` advisories (box 18 covers runtime dependencies).~~ Wrong: box 18 audits the whole tree — see Box 18 and the review follow-ups.

## Prereqs (read before writing code)
- [x] `MIGRATION.md` §0–3 (D-007, D-030–D-032, G-018–G-021, G-024, G-029), ADR-0002, ADR-0004, `testing-and-rollout.md`, `target-architecture.md` §3, `VERIFICATION.md`, this template.
- [x] S02b ✅ on the branch (`30183bc`).
- [x] Local `web/.env` with the loopback placeholders (`PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `PUBLIC_SUPABASE_ANON_KEY=local-test-key`); gitignored, not committed.
- [x] `npx playwright install webkit` (WebKit 26.5, Playwright 1.62.1).

## What changed

### Box 14 — four engines
`playwright.config.ts` keeps the S05 shape (build, then `vite preview` at base `''`, G-019) and adds:
the four projects; `reuseExistingServer: false` (a preview left on 4173 — another worktree, an older build —
was silently reused before; now a busy port fails the run); in CI `retries: 1`, `forbidOnly` and the
`github` reporter; `trace: 'retain-on-failure'`; `perf.spec.ts` ignored outside `chromium`.

The first four-project run of the existing specs: **333 passed, 11 failed** (chromium and Mobile Chrome
clean). Root causes and what was done:

| # | Failure | Cause | Done |
|---|---|---|---|
| 1 | `kit-base` 360px: "nothing scrolls sideways" (webkit, Mobile Safari) | **Real.** An unrevealed `.scroll-fade-right` sits 28px right and widened a 360px phone by 8px. WebKit counts it in `scrollWidth`; Chromium zooms the page out to fit it (`innerWidth` 368), which is why the test passed there | `/kit/base/` clips its reveal demo (`overflow-x: clip`), as `.wrapper` already does on real pages |
| 2 | `kit-button` "href picks the element" (Mobile Safari) | Test race: a one-shot `innerText` read before hydration filled the readout | Auto-retrying `toContainText` |
| 3 | `kit-base` skip link on Tab (webkit, Mobile Safari) | Engine default: WebKit's Tab skips links unless Safari's "Press Tab to highlight each item" is on; Playwright's WebKit has no Option-Tab | `test.skip` on WebKit (E-1) |
| 4 | `kit-action-sheet` "repositions while the page scrolls", `kit-lightbox` "locks the page scroll" (Mobile Safari) | `mouse.wheel` is not supported in mobile WebKit | `test.skip` on mobile WebKit (E-2) |
| 5 | `kit-modal` focus back to the trigger, `kit-lightbox` focus back to the tile (webkit, Mobile Safari) | **Real** — finding X-1 below | `test.fail` on WebKit, so the gate stays green and the line fails ("passed unexpectedly") the day it is fixed |

### Box 15 — axe
`a11y.spec.ts` visits every page in `build/` (read when the spec loads — Playwright starts `webServer` first,
so it is this run's build; an empty build fails instead of passing), in light and dark (localStorage
`ird.theme` via `addInitScript`, asserted through `data-theme`), with reduced motion emulated so reveals are
settled. Fails on any `serious`/`critical` violation that is not a recorded exception; the full list (every
impact) is attached to the report. It also asserts no request left the preview origin and the pinned CDN.

First run: **72 failed, 52 passed**. Fixed in the kit pages:
- `/kit/form-wizard/` danger CTA: `--color-white` on `--color-danger` was 3.59:1 in dark → `--static-white` (Button's own rule).
- `/kit/signature-pad/` paper label: `opacity: 0.65` was 3.71:1 → 0.8 (≥ 5.5:1 in both themes).
- `/kit/lightbox/`, `/kit/toast/` code samples: a horizontal scroller is not keyboard-reachable in WebKit (`scrollable-region-focusable`) → they wrap.
- `/kit/card/` interactive cards: an `ariaLabel` that left out the visible text failed WCAG 2.5.3 Label in Name → the content is the name.

Recorded exceptions (matched per node on rule + theme + the measured colours, so the same rule failing
anywhere else still fails):

| ID | Violation | Pages | Owner |
|---|---|---|---|
| A11Y-1 | `--color-secondary` used as **ink** (base `strong`, RichText links) has no dark value: gold #9a6a2c on the dark page #121c1f / surface #1a262a 3.7/3.3:1, admin slate #475569 on the dark surface #1a262a 2.0:1 (the entries match exactly these pairs — review follow-up 5) | 12 kit pages, dark, all projects | PR-C2 — `--color-accent-ink` (planned D-038) |
| A11Y-2 | `--money-warn` (= `--status-pending`) on its own `-bg` tint: #a05a10 on #f2e8de, 4.38:1. D-023 measured the pair only against the surface | `/kit/data-table/`, `/kit/tokens/`, `/kit/base/` (≤768px), light | S11b (token layering) — before PR-C2's `Badge` pairs ink and tint |

Not blocking, reported: `heading-order` (moderate) on some kit pages.

### Box 17 — budget and lab vitals
`scripts/check-budget.mjs` (no dependency) sums the gzip size (level 9) of every script a page loads up
front — `modulepreload` links, `<script src>`, and the `import("…")` calls in Kit's boot script — once per
file, and compares each page with `budget.json`: over baseline + 5% fails, and so do a page without a
baseline and a baseline without a page. Root-relative URLs are matched to `build/` by dropping leading
segments, so any `BASE_PATH` works. `npm run budget -- --update` re-records (a reviewed diff). Failure modes
were exercised (over budget, missing and stale entry, no build).

Baseline (`BASE_PATH=/app` build, loopback env, gzip bytes): `/` 41 301 · `/kit/action-sheet/` 66 982 ·
`/kit/base/` 44 745 · `/kit/button/` 64 754 · `/kit/card/` 65 166 · `/kit/data-table/` 65 914 ·
`/kit/disclosure/` 63 821 · `/kit/form-wizard/` 67 429 · `/kit/icon/` 64 789 · `/kit/lightbox/` 67 741 ·
`/kit/modal/` 68 077 · `/kit/rich-text/` 68 795 · `/kit/signature-pad/` 65 730 · `/kit/toast/` 65 385 ·
`/kit/tokens/` 44 440.

`perf.spec.ts` (chromium only — DevTools throttling; WebKit reports no LCP or layout-shift entries):
Lighthouse's default mobile run applied for real — 412×823 at DPR 1.75, Slow 4G (562.5 ms request latency,
1.47 Mbit/s down, 675 kbit/s up), 4× CPU — one fresh context per page, after one unthrottled warm-up pass
per worker (DNS and file caches, so the first page is not charged for the runner's cold start). LCP from
`largest-contentful-paint`, CLS as the worst session window; results grouped by route group.

| Group | Pages | LCP (clean room, CI=1, 2 workers) | CLS |
|---|---|---|---|
| home | `/` | 1520 ms | 0.000 |
| kit | 14 pages | 1716–2184 ms (worst `/kit/icon/`) | ≤ 0.018 (`/kit/data-table/`) |

These are pessimistic next to production: `vite preview` speaks HTTP/1.1 uncompressed, and the throttled
waterfall shows the render-blocking CSS sharing the link with 13–17 JS module preloads (Pages serves gzip
over HTTP/2). The margin to 2.5 s is ~0.3 s on the worst page; a regression that adds a round trip or a
render-blocking resource crosses it.

### Layer boundaries (target-architecture §3)
`eslint.config.js` adds one `no-restricted-imports` block per layer; each lists everything that layer may not
import (a later flat-config block replaces an earlier one's options, so none relies on another). Patterns
match `#lib/…` and relative paths into the folder.

| Files | May not import |
|---|---|
| everything in `src/` except `repos/**`, `db/**`, `stores/session.svelte.ts` | `db/client` |
| primitives `src/lib/components/*.{ts,svelte}` | `db/*`, `repos/*`, `platform/*` |
| `src/lib/repos/**` | `components/*`, `stores/*` |
| `src/lib/stores/**` (not `session.svelte.ts`) | `components/*`, `db/client` |
| `src/lib/stores/session.svelte.ts` (S38's auth module) | `components/*` |
| `src/lib/platform/**` (CC1, when created) | `components/*`, `stores/*`, `repos/*`, `db/*` |
| pure libs `src/lib/*.ts` | `components/*`, `stores/*`, `repos/*`, `db/*`, `platform/*` |

Feature components (`components/<feature>/**`, S23's `site/Newsletter.svelte`) keep repos, stores and
platform — only `db/client` is closed to them. Lint passes on the current code (and on S22b's work in
progress). A scripted probe linted 25 synthetic imports through the real config — every layer's allowed and
forbidden case, `#lib` and relative forms, the future `session.svelte.ts` and `platform/` — and all behaved.

### Box 18 — supply chain
As first shipped: `npm audit --omit=dev --audit-level=high` → 0 vulnerabilities, with 6 advisories in
devDependencies (2 moderate, 4 high: brace-expansion, nanoid, postcss, postcss-selector-parser,
source-map-js, undici — the same set S02b left for this box) waved through on the claim that "dev tooling
never reaches the Pages artifact". **That claim is false:** svelte, @sveltejs/kit and devalue are
devDependencies, and the build compiles them into every page; the rest of the toolchain produces the
artifact. Since the review follow-ups the gate is `npm audit --audit-level=high` on the **whole tree** —
0 vulnerabilities after a lockfile-only `audit fix` (follow-up 1). Every runtime CDN URL is exact: Font
Awesome 6.5.0 (`app.html`, SRI), pdfmake 0.2.10 and pdf.js 3.11.174 (`#lib/pdf.ts`).

### CI (`.github/workflows/ci.yml`)
`web` and `ledger` are unchanged. New:
- **`e2e`** — `npm ci` → `npx playwright install --with-deps chromium webkit` (the two engines the projects
  use) → `BASE_PATH=/app npm run build && npm run budget` → `npx playwright test` (all four projects) →
  test results uploaded on failure. Env = the loopback placeholders, not the secrets: no e2e page talks to
  Supabase, so the build cannot reach production, and the budget is measured under the values its baseline was.
- **`audit`** — `npm audit --audit-level=high` over the whole tree (was `--omit=dev`; follow-up 1), its own
  job so an advisory published overnight reads as a supply-chain failure, not an e2e one.
- Since the review follow-ups: top-level `permissions: contents: read`, and every `uses:` pinned to a commit
  SHA with its release in a trailing comment (follow-up 6).

### VERIFICATION.md
Boxes 14–19 added as `testing-and-rollout.md` §1 specifies (20 stays for cutovers, noted under the block);
box 6 now allows build-time reads and requires a failed read to render loading, never empty (ADR-0004);
box 12 is a runnable grep that adds Google OAuth client secrets (`GOCSPX-`), Entra/Azure client secrets
(`…Q~…`), `sb_secret_`, Resend keys and private keys to the service-role/JWT check.

## Cross-engine findings

- **X-1 (open) — Safari does not focus a clicked `<button>`, so focus does not return to the opener.**
  `Modal`, `Lightbox` and `FormWizard` record `document.activeElement` when they open; after a mouse click or
  a tap in WebKit that is `<body>` or the nearest focusable ancestor (`<main tabindex="-1">` on the kit pages),
  so focus lands there on close. Keyboard opening works. `ActionSheet` is unaffected (it takes an explicit
  `trigger`). A fix belongs in the shared overlay code (`#lib/focus-trap.ts`: fall back to the control the
  last `pointerdown` pressed when `activeElement` is not one) — PR-C2's primitives step reuses it and S12b
  unifies the overlay stack. The two `test.fail` lines go when it lands — each now sits on its own
  focus-return test, so nothing else is exempt on WebKit (review follow-up 2).
- **X-2 (fixed) — horizontal reveal transforms widen a 360px page** (failure 1). Global note for S23/S12b:
  `body { overflow-x: clip }` does not stop Chromium from zooming out to fit; content with reveals belongs
  inside a clipping container (`.wrapper`), or a root-level clip is S12b's call.
- **X-3 (test-only) — WebKit's mobile emulation can hold a stale computed style on `<body>`** for a long page
  (`/kit/base/`): `getComputedStyle` reported no inherited custom properties (black ink, transparent
  background) while the page painted correctly, so axe "saw" dark-theme text on white. Re-setting a custom
  property on the root clears it; `a11y.spec.ts` does so before scanning.

## Verification gate

Two places: the worktree (shared with S22b's work in progress) and a **clean room** — `git -c core.autocrlf=false
-c core.eol=lf archive HEAD web .github docs` (G-025) plus only this session's files, `npm ci`, loopback `.env`.

```
[x]  1. Install clean     npm ci (clean room, npm 11.5.2)  → 302 packages (+2: @axe-core/playwright, axe-core)
[x]  2. Typecheck         npm run check                    → clean room 634 FILES · worktree 647 FILES — 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint                     → prettier: all files pass · eslint: 0 problems (both)
[x]  4. Unit tests        npm run test                     → clean room 64 passed | 1 skipped files · 1610 passed | 2 skipped (= S02b)
                                                             worktree (with S22b WIP) 65 | 1 · 1747 | 2
[x]  5. Golden parity     npm run test:golden              → 12 files · 533 passed
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → 15 prerendered pages under /app; no network reads
[x]  7. Preview smoke     part of box 14
[x]  8. Legacy untouched  only web/**, .github/workflows/ci.yml, docs/migration/** changed
[ ]  9. Parity walk       n/a — no surface ported
[ ] 10. SEO diff          n/a
[ ] 11. SW cache bumped   n/a (not a cutover)
[x] 12. Secrets/PII clean box-12 grep over this session's patch → hits only in box 12's own pattern text
[x] 13. Ledger updated    → MIGRATION.md, PR-C1 ledger step (2026-10-19)
[x] 14. Cross-engine e2e  npx playwright test (clean room, CI=1, 2 workers, 6.9 min) → 484 tests:
                            chromium      133 passed
                            webkit        116 passed (incl. 2 expected failures, X-1) · 1 skipped (E-1)
                            Mobile Safari 114 passed (incl. 2 expected failures, X-1) · 3 skipped (E-1, E-2)
                            Mobile Chrome 117 passed
                          → 0 failed · 0 flaky (S02b: 86 passed, chromium only)
[x] 15. Automated a11y    31 tests × 4 projects pass; 0 serious/critical outside A11Y-1 / A11Y-2
[ ] 16. Manual WCAG 2.2   n/a — no surface ported (S37+ record it)
[x] 17. Performance       npm run budget → 15 pages within budget (baseline above);
                          perf.spec.ts → LCP 1520–2184 ms, CLS ≤ 0.018 (16 tests, chromium)
[x] 18. Supply chain      npm audit --omit=dev --audit-level=high → 0 vulnerabilities; CDN URLs exact
                          (superseded: the gate is now the whole tree — see Review follow-ups)
[ ] 19. Security list     n/a — no auth, data or Edge Function change
```

## Review follow-ups (2026-10-19)

Two reviewers re-checked the gates with evidence; each finding below is fixed with a test that fails
without the fix. Commits `867d1ef` (audit + CI), `39bfc60` (lint), `cf797c4` (e2e).

1. **Box 18 never saw the code it ships.** `npm audit --omit=dev` skips svelte, @sveltejs/kit and devalue —
   devDependencies the build compiles into every page — so "dev tooling never reaches the Pages artifact"
   was false (Box 18 above is corrected). The `audit` job now runs `npm audit --audit-level=high` on the whole
   tree. `npx npm@11.21.1 audit fix` (11.5.2's install crashes on this lockfile, G-036) moved lockfile entries
   only, no majors: undici 7.29.0 → 7.30.1, source-map-js 1.2.1 → 1.2.2, postcss 8.5.19 → 8.5.31,
   postcss-selector-parser 7.1.5 → 7.1.6, nanoid 3.3.16 → 3.3.20, brace-expansion 5.0.9 → 5.0.12. A clean-room
   `npm ci` (npm 11.5.2) installs it; the full audit is clean; the budget did not move (±0.0%).
2. **X-1's `test.fail` covered whole tests**, so on webkit and Mobile Safari the modal's Tab trap and the
   lightbox's arrows, Escape and console checks gated nothing. Only the focus-return assertions moved, each to
   its own test (`returns focus to the trigger that opened it`, `returns focus to the tile that opened it`)
   carrying the WebKit `test.fail` (G-038 / X-1; removed when `focus-trap.ts` records the opener — PR-C2). The
   rest passes on all four projects; Tab really cycles Cerrar → Cancelar → Entendido → Cerrar in WebKit, so
   the trap is exercised there too.
3. **The layer lint ignored dynamic `import()`.** Each layer block now also sets `no-restricted-syntax` on
   `ImportExpression` with the same patterns and messages — a string source, or the leading text of a
   template literal; one `restrict()` builds both rules (an esquery regex can't hold `/`, so the selectors
   spell it `/`). `tests/unit/layer-boundaries.test.ts` (93 cases) lints static and dynamic forms through
   the real config at a probe path in every layer — the "unit test for the layer rules" follow-up. Without the
   new rule 40 cases fail; without the template selector, 4.
4. **The network guard compared hostnames**, so any localhost port passed — the e2e build's Supabase at
   `127.0.0.1:54321` included. `helpers/network.ts` now allows only the test's `baseURL` origin and
   `https://cdnjs.cloudflare.com`, and watches WebSockets as well (Playwright reports a socket as `websocket`,
   never as `request`); `a11y.spec.ts` and `perf.spec.ts` pass their `baseURL`. `network-guard.spec.ts` proves
   it with routed requests and a refused socket, so nothing but the preview is reached; the old helper fails
   all 8 of its tests.
5. **A11Y-1 had no `bg`**, so those inks failing on any dark background were exempt. It is pinned to the
   measured pairs — gold #9a6a2c on the dark page #121c1f and surface #1a262a, slate #475569 on #1a262a — `bg`
   is now required, and a test proves an exception covers nothing else.
6. **CI hardening.** `permissions: contents: read` at the top. Every `uses:` is pinned to the commit its tag
   pointed at on 2026-10-19 (`gh api repos/actions/<action>/git/ref/tags/v4`; all three are lightweight tags,
   so nothing to dereference): checkout v4.4.0 `11d5960a…`, setup-node v4.4.0 `49933ea5…`, upload-artifact
   v4.6.2 `ea165f8d…`, the release in a trailing comment. deploy.yml is untouched.
7. "How to resume" below said S05b was uncommitted; it is `d4192f8`.

Gates after the follow-ups (worktree, with the S22b follow-ups):

```
[x]  2. Typecheck         npm run check   → 653 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint    → prettier: all files pass · eslint: 0 problems
[x]  4. Unit tests        npm run test    → 67 passed | 1 skipped files · 1979 passed | 2 skipped
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → 15 prerendered pages
[x] 14. Cross-engine e2e  E2E_PORT=4185 npx playwright test (1.8 min) → 504 tests:
                            chromium      138 passed
                            webkit        119 passed + 2 expected failures (X-1, focus return only) · 1 skipped (E-1)
                            Mobile Safari 117 passed + 2 expected failures (X-1, focus return only) · 3 skipped (E-1, E-2)
                            Mobile Chrome 122 passed
                          → 0 failed · 0 flaky (+20: network guard, exception pairs, the split X-1 tests)
[x] 15. Automated a11y    32 tests × 4 projects pass; 0 serious/critical outside the pinned A11Y-1 / A11Y-2 pairs
[x] 17. Performance       npm run budget → 15 pages within budget (±0.0%);
                          perf.spec.ts → LCP 1564–2272 ms, CLS ≤ 0.018 (chromium)
[x] 18. Supply chain      npm audit --audit-level=high → 0 vulnerabilities (whole tree)
```

## How to resume if interrupted
- Branch: `migrate/S02b-S05b-S22b-foundations`. S05b is committed: `d4192f8` (the gates), `2574853` (themes
  forced before load), `200feb4` (`E2E_PORT`); the review follow-ups are `867d1ef`, `39bfc60`, `cf797c4`.
- Done: everything above.
- Next concrete action: open PR-C1 and paste the gate results.
- Landmines:
  - `reuseExistingServer: false` — stop any `vite preview` on 4173 before `npm run test:e2e`, or pick
    another port with `E2E_PORT`.
  - Locally a full run needs `npx playwright install chromium webkit`.
  - `web/test-results/` is Playwright output and not gitignored — never commit it.
  - Running the budget after a base-`''` build (what `npm run test:e2e` leaves in `build/`) measures within a few bytes of the /app build, but the baseline is the /app build's.
  - A new page needs a budget entry: `npm run budget -- --update`, and review the diff.

## Ledger follow-ups (for the PR-C1 ledger step — not edited here)
- MIGRATION.md §1: S05b done; §3 gotchas from X-1, X-2, X-3 and the pessimism note under box 17 (HTTP/1.1 preview, CSS sharing the link with module preloads).
- `testing-and-rollout.md` still calls boxes 14–20 "proposed"; 14–19 now live in VERIFICATION.md.
- The e2e spec headers still say "not part of the CI gate".
- `web/.gitignore`: add `test-results/`.
- ~~A unit test for the layer rules, like `no-raw-html`'s fixtures (`tests/unit/`).~~ Done:
  `tests/unit/layer-boundaries.test.ts` (review follow-up 3).
- Branch protection: require `e2e` and `audit` alongside `web` and `ledger`.
- Owners: A11Y-1 → PR-C2 (planned D-038), A11Y-2 → S11b, X-1 → PR-C2 primitives / S12b.

## On completion
- [ ] Update `MIGRATION.md`: status board, Current state, Next up, new D-xxx / G-xxx.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
