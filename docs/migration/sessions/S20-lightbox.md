# Session S20 — Lightbox

**Stream:** design-system
**Depends on:** S13 (Icon), S15 (Toast) · also consumes S11 tokens / S12 baseline · shares `$lib/scroll-lock.ts` with S21
**PR:** <#___>   **Branch:** `migrate/S20-lightbox`
**Status:** 🟦 PR open

## Goal (one sentence)

Port `js/components/lightbox.js` to `Lightbox.svelte` + a runes store exposing `openLightbox(photos, i)`, with no id-coupled markup and with keys / swipe / full screen / share / download / scroll-lock + restore.

## In scope

- `web/src/lib/stores/lightbox.svelte.ts` — state, navigation, share, download (new).
- `web/src/lib/components/Lightbox.svelte` — the overlay (new).
- `web/src/lib/scroll-lock.ts` — **byte-identical copy of S21's module** (see NOTES "Landmines" 1).
- `web/src/routes/kit/lightbox/+page.svelte` + `web/static/kit/lightbox/foto-{1..4}.svg` — showcase.
- `web/tests/unit/lightbox.test.ts`, `web/tests/component/Lightbox.test.ts`, `web/tests/e2e/kit-lightbox.spec.ts`.

## Out of scope (do NOT touch)

- Legacy `js/components/lightbox.js`, `galeria/album/index.html`, `css/pages/galeria.css` — still live, untouched.
- The gallery surfaces themselves (S29 public album, S46 admin gallery) — they are the consumers.
- Thumbnail strips, pinch-zoom, slideshow, `goTo` UI — the store exposes `goToPhoto` for S29/S46; no UI here.
- `vitest.config.ts` / `package.json` / `svelte.config.js` / `app.html` — unchanged from the S13+S15 state.

## Prereqs (read before writing code)

- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010/G-018/G-019, current state) and `CLAUDE.md`.
- [x] Confirmed the dependency sessions' deliverables (S11, S12, S13, S15) and layered them into the harness.
- [x] Legacy source of truth: `js/components/lightbox.js:1-183`, `galeria/album/index.html:191-209`, `css/pages/galeria.css:649-796`, `js/pages/galeria/album.js:85-90`, `js/lib/gallery.js:75-91,179-183`.
- [x] Specs: `docs/migration/DESIGN-SYSTEM.md` §4.2 Lightbox + §6.1/§6.2 checklists, `docs/migration/ROADMAP.md` S20, `docs/migration/PORT-DEBT.md` S46 (the gallery row that consumes this), `docs/admin-ux.md`.
- [x] Fixture / golden: none — this is a UI primitive, not a pure function. Legacy parity is asserted as behaviour (wrap-around, the one-photo no-op, the clamped start index, the ignored empty list, the swipe distances).

## Steps

1. Read the legacy component, its markup block and its CSS; census the one call site (`album.js:90`) and the photo row shape (`gallery_photos`).
2. Write the store: `LightboxPhoto`, `openLightbox/closeLightbox/next/prev/goTo`, `photoSrc/photoAlt/photoFilename/shareUrl`, `sharePhoto`, `downloadPhoto`.
3. Write the component: dialog + scrim button + nav + stage + bottom bar; one `$effect` owning the key handler, the focus trap, the scroll lock and the focus return; neighbour preloading; swipe handlers.
4. Port the CSS with S11 tokens (fixed-dark surface: `--static-black` scrim, `--static-white` ink), house easing, reduced-motion guard, 640px layout.
5. Showcase route + four static placeholder photos (landscape / portrait / square / panorama, one uncaptioned, one long caption).
6. Tests: 28 unit + 20 component + 8 Playwright; run the gate.

## Acceptance criteria

- [x] `openLightbox(photos, i)` opens the viewer on photo `i`; no element ids anywhere in the component.
- [x] Keys: ← / → wrap, Escape closes, F toggles full screen, Tab is trapped; Ctrl/⌘/Alt combinations are left to the browser.
- [x] Swipe: >50px horizontal changes photo, >80px down closes (legacy distances, asserted).
- [x] Full screen: `requestFullscreen({navigationUI:'hide'})` / `exitFullscreen`, the button label follows the real state, and closing the viewer leaves full screen.
- [x] Share: Web Share API → clipboard → error toast; a cancelled share is not treated as a failure; the shared link is absolute.
- [x] Download: `fetch` → `Blob` → object URL → `<a download>` → revoke. A real Chromium download event fires with `foto-1.svg` as the filename, and the viewer stays open (the legacy navigated away).
- [x] Scroll-lock + restore: reference-counted; the page underneath does not move and `body.style.overflow` goes back to what it was (`overflow-x: clip` from `base/reset.css` survives).
- [x] Focus moves into the dialog on open and returns to the tile that opened it on close.
- [x] Live URLs unaffected — nothing outside `web/` is touched.
- [x] No console errors on the showcase smoke.

## Verification gate

```
VERIFICATION GATE  —  run in a scratch copy of web/ from migrate/S09-pdf
                      + the S11 / S12 / S13 / S15 deliverables layered on top

[x]  1. Install clean       npm ci                                  → exit 0, 303 packages, lock unchanged
                                                                       (audit: 4 pre-existing advisories from the S09 lock,
                                                                        untouched by this session)
[x]  2. Typecheck           npm run check                           → 486 FILES, 0 ERRORS, 0 WARNINGS
[x]  3. Lint / format       npm run lint                            → prettier clean + eslint 0 problems
[x]  4. Unit tests          npm run test                            → 24 files passed | 1 skipped, 568 passed | 2 skipped
                                                                       (baseline before this session: 520 passed → +48)
[–]  5. Golden parity       npm run test:golden                     → n/a: no pure function is ported. Legacy parity is
                                                                       asserted behaviourally (see Acceptance criteria).
[x]  6. Build               BASE_PATH=/app npm run build            → adapter-static wrote build/, 0 errors;
                                                                       /app/kit/lightbox/ + the four SVGs prerendered
[x]  7. Preview smoke       npx playwright test tests/e2e/kit-lightbox.spec.ts
                                                                    → 8 passed (Chromium, vite preview), 0 console errors
[x]  8. Legacy untouched    git diff --stat                         → only web/ files added; no legacy file modified
[x]  9. Parity walk         legacy /galeria/album/ vs /kit/lightbox/ → differences are the listed, deliberate ones
[–] 10. SEO diff            n/a — /kit/* is a noindex staging page
[–] 11. SW cache bumped     n/a — no cutover
[x] 12. Secrets/PII clean   no keys, no PII; placeholder photos are generated SVGs
[ ] 13. Ledger updated      MIGRATION.md — owed by the merging session (see NOTES "Open for the parent")
```

Browser evidence (Chromium 1234 headless via `@playwright/test`, `vite preview` of the build):
computed `.lightbox` background is `color(srgb 0 0 0 / 0.92)` and `z-index: 10000` in **both** themes;
`.lightbox__counter` ink is `rgb(255, 255, 255)` in both; download fires a real download event named
`foto-1.svg`; at 360px `documentElement.scrollWidth - innerWidth <= 0` with the long caption;
`animation-name` is `none` on the dialog and the photo under `prefers-reduced-motion: reduce`.
Screenshots taken at 1280×900 (light + dark) and 360×740 (long caption, single photo).

## How to resume if interrupted

- Branch: `migrate/S20-lightbox`. Last known-good commit: see PR.
- Done so far: store, component, showcase + 4 static photos, 28 unit + 20 component + 8 e2e tests, all four gates green.
- Next concrete action: nothing outstanding in scope — merge, then let S29 (public album) and S46 (admin gallery) mount `<Lightbox />` and call `openLightbox`.
- Landmines: `$lib/scroll-lock.ts` is shared with S21 and must stay byte-identical (NOTES 1); the focus-trap
  selector must exclude `[tabindex="-1"]` on **every** clause or Tab wraps onto the invisible scrim (NOTES 2);
  jsdom has no Touch Events, so the swipe tests build the event by hand (NOTES 3).

## On completion

- [ ] Update `MIGRATION.md`: status board, Current state, Next up, the new D-xxx/G-xxx candidates in NOTES.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
