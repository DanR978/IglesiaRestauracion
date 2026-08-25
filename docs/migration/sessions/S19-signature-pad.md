# Session S19 — SignaturePad

**Stream:** design-system
**Depends on:** S12 (global baseline: the `canvas { display:block; max-width:100% }` reset, the
button reset, the global `:focus-visible` ring, `.sr-only`), S11 (tokens — `--static-white`,
`--gray-*`, `--fs-*`, `--radius-*`, `--btn-pd-*`), S13 (`Icon.svelte` + the component-test harness)
**PR:** <#___>   **Branch:** `migrate/S19-signature-pad`
**Status:** 🟦 PR open

## Goal (one sentence)
Port `js/components/signature-pad.js` verbatim-typed to `web/src/lib/signature-pad.ts` and wrap it in
`SignaturePad.svelte`, so the pad draws at the device pixel ratio, `toDataURL()` returns a trimmed
transparent PNG, and `clear` / `loadDataURL` / `isEmpty` are exposed to the waiver and account flows.

## In scope
- `web/src/lib/signature-pad.ts` (new — the ported canvas controller + the export size cap helpers)
- `web/src/lib/components/SignaturePad.svelte` (new — the component, `framed` / `bare`)
- `web/tests/unit/signature-pad.test.ts` (new — 34 controller tests)
- `web/tests/component/SignaturePad.test.ts` (new — 13 component tests)
- `web/tests/helpers/canvas-mock.ts` (new — jsdom fakes for the 2D context / `Image` / pointer events)
- `web/src/routes/kit/signature-pad/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/tests/e2e/kit-signature-pad.spec.ts` (new — real-browser proof; not in the CI gate)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `js/components/signature-pad.js`, `js/pages/eventos/registro-wizard.js`, `js/lib/waiver.js`,
  `js/pages/admin/special-events-tab.js`, `css/pages/discipulado-wizard.css` — all live, DUAL-MAINTENANCE.
- The waiver step itself, the draw/type mode toggle, the honeypot/captcha and the **submit-side**
  signature check (all S33). This session ships the producer-side cap and its helpers only.
- Button/IconButton (S14) — `.sigpad__clear` is hand-rolled until then (NOTES, open items).
- `package.json`, `vitest.config.ts`, `svelte.config.js`, `app.html`, `app.css` — S19 changes none.
- DB / RLS / edge functions.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-005/D-009/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010/G-018/G-019),
      `CLAUDE.md` §4/§5, `DESIGN-SYSTEM.md` §1/§2/§4.3 SignaturePad/§6.1, `PORT-DEBT.md`,
      `docs/admin-ux.md`, `VERIFICATION.md`, `SESSION-TEMPLATE.md`.
- [x] Confirmed S11/S12/S13 deliverables applied to the harness before writing a line.
- [x] Legacy source of truth: `js/components/signature-pad.js:1-181`; consumers
      `js/pages/eventos/registro-wizard.js:21,57,151-153,341-359,367-383,461-462`,
      `js/lib/waiver.js:105-110,146-161,303`, `js/pages/admin/special-events-tab.js:1004-1014`;
      styling `css/pages/discipulado-wizard.css:630-636,645-660`.
- [x] Fixture / golden: none. Canvas pixels are explicitly out of scope for golden diffing
      (VERIFICATION, "Do NOT unit-test … Fabric canvas pixels"); parity is pinned as **geometry** —
      arc radius, stroke settings, backing-store maths, the `6 × dpr` trim box, the fit-and-centre
      placement — against the legacy formulas.
- [x] PORT-DEBT has no row on this surface (grepped `signature|firma|sig_`).

## Steps
1. Read the legacy module and every consumer; derive the real prop shape from the wizard's usage.
2. `signature-pad.ts`: same arithmetic, typed; drop the DOM building; add the `onChange` reason,
   promise-returning `resize`/`loadDataURL`, the `ResizeObserver`, the no-op resize guard, the
   context null-check, full listener teardown, and the `maxBytes` export cap + `dataUrlByteLength`.
3. `SignaturePad.svelte`: `bind:value` + `bind:this` exports, `framed`/`bare`, the permanently-light
   paper, the built-in clear button, the `role="status"` announcement, the no-context fallback.
4. `tests/helpers/canvas-mock.ts` (2D context recorder with a settable alpha plane, fake `Image`,
   `MouseEvent`-based pointer events); the unit + component suites.
5. `/kit/signature-pad/` showcase; the e2e spec; run the gate at 1×/2×/3× and 360px, light and dark.

## Acceptance criteria
- [x] **Draws hi-DPI.** Backing store = CSS size × `devicePixelRatio`, clamped to 3× and floored at 1×;
      `setTransform(dpr,0,0,dpr,0,0)`; stroke `2.2` / `round` caps+joins / `#0e2d38` applied once.
      Browser-verified on the kit page: `dsf=1 → 542×170`, `dsf=2 → 1084×340`, `dsf=3 → 1626×510`
      for the same `542×170` CSS box.
- [x] **`toDataURL()` returns a TRIMMED PNG.** Alpha-plane bounding box + `round(6 × dpr)` padding,
      clamped to the canvas edges, re-encoded from an offscreen crop; `''` while empty or blank;
      untrimmed fallback on a tainted canvas. Browser: a mid-pad stroke on a 542×170 pad exported
      `149×43` (1×) / `299×85` (2×) / `449×127` (3×) — 2.5 kB / 5.8 kB / 9.0 kB.
- [x] **`clear` / `loadDataURL` / `isEmpty` exposed** — on the controller and as component exports
      through `bind:this`, plus `toDataURL` and `resize`. Driven end-to-end from the kit page's
      buttons in the browser.
- [x] Round trip: draw → export → clear → `loadDataURL(url)` reports inked again, fitted and centred
      (`scale = min(w/iw, h/ih, 1)`).
- [x] A pointer sequence flips `isEmpty`; a tap alone leaves a dot; `pointerleave`/`pointercancel`
      end the stroke; a stray `pointerup` is not a second change; nothing draws after `destroy()`.
- [x] Export stays under `SIGNATURE_MAX_BYTES` (128 kB) — the crop re-encodes at 0.75× steps if not
      (SEC-09 producer side; S33 owns the submit-side rejection).
- [x] Token-only CSS (the single hex, `SIGNATURE_INK`, is raster ink in the TS module and documented),
      no `prefers-color-scheme`, no gold/amber/teal, house easing with a reduced-motion guard,
      `:hover`/`:active`/`:disabled` + the global `:focus-visible` ring, no `window.__*`, no inline
      `onclick=`, canonical breakpoints only.
- [x] **Dark mode:** the paper stays `rgb(255,255,255)` under `data-theme="dark"` while `body` goes
      `rgb(18,28,31)`, so the fixed dark ink is never invisible; hint ink `#313537` on white.
- [x] No horizontal scroll at 360px (`scrollWidth − clientWidth = 0`); the clear button measures 44 px
      tall; `touch-action: none` on the pad so a touch drag signs instead of scrolling.
- [x] A browser with no 2D context degrades to a Spanish `role="alert"` pointing at the typed
      e-signature, with a `console.warn` — it does not throw.
- [ ] No change to still-live legacy files — verify on the real branch (`git diff --stat` outside
      `web/` + docs must be empty).

## Verification gate
Ran `docs/migration/VERIFICATION.md` boxes 1–4, 6, 7, 8, 12 in a clean harness
(`MSYS_NO_PATHCONV=1 git archive origin/migrate/S09-pdf web | tar -x`, + S11 + S12 + S13 deliverables
+ this session, `npm ci`, `web/.env` stubbed, line endings normalised to LF):

- [x] **1. Install clean** — `npm ci` exit 0.
- [x] **2. Typecheck** — `npm run check` → `485 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`.
      (First run: 17 `'ctx' is possibly null` + 1 a11y warning on `<canvas role="img">` — both fixed,
      NOTES landmines 2 and 4.)
- [x] **3. Lint / format** — `npm run lint` exit 0: `All matched files use Prettier code style!`,
      eslint 0 problems.
- [x] **4. Unit tests** — `npm run test` → `24 passed | 1 skipped (25)` files,
      `558 passed | 2 skipped (560)` tests. S19 adds **47**: `tests/unit/signature-pad.test.ts` 34 +
      `tests/component/SignaturePad.test.ts` 13. Baseline before this session was 511/22.
- [x] **6. Build** — `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`;
      `build/kit/signature-pad/index.html` prerendered (the pad server-renders its paper and hint;
      the controller mounts on the client, as designed).
- [x] **7. Preview smoke** — `npx playwright test tests/e2e/kit-signature-pad.spec.ts` against the
      real `playwright.config.ts` webServer → **5 passed** (8.0 s), 0 console errors / 0 page errors.
      Covers the dpr backing store, mouse-drawn stroke → trimmed PNG under the cap, the four exposed
      methods, dark-mode paper, and 360px/`touch-action`/44px. First run caught a **spec** bug
      (`#h-framed ~ .kit__note` matched the intro paragraph), not a product bug.
- [x] **8. Legacy untouched** — everything delivered is under `web/`; no legacy file was opened for
      write. Re-confirm with `git diff --stat` on the branch.
- [x] **12. Secrets/PII clean** — no keys, no PII; the only fixture payloads are
      `data:image/png;base64,AAAA` and synthetic alpha planes. The e2e draws with a mouse, never
      submits, and touches no Supabase project.
- Box 5 (golden) **N/A** — canvas pixels are excluded from golden diffing by VERIFICATION; parity is
  asserted as geometry (see Prereqs). Boxes 9–11, 13 belong to the PR/branch, not the harness.

## How to resume if interrupted
- Branch: `migrate/S19-signature-pad` (on top of S13). Last known-good commit: see PR.
- Done so far: everything in this scratch dir is final and gate-green in the harness with
  S11 + S12 + S13 applied.
- Next concrete action: apply S11 + S12 + S13 (S13's `package.json`, `package-lock.json`,
  `vitest.config.ts`, `tests/setup.ts`, `svelte.config.js`, `app.html` supersede the earlier ones),
  copy `s19/web/**`, then `cd web && npm ci && npm run check && npm run lint && npm run test &&
  MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`, and open the PR.
- Landmines: NOTES.md — the raster-ink hex; `role="img"` belongs on the wrapper, not the `<canvas>`;
  strict narrowing of the 2D context; the `untrack`/`applied` pair that stops the value effect
  looping; testing-library queries are body-scoped; CRLF from `git archive`.

## On completion
- [ ] Update `MIGRATION.md`: status board (S19 → 🟦), Current state (`/app/kit/signature-pad/` in
      staging; SignaturePad available to S33/S45), Next up. Candidate ledger entries (parent decides):
      **D-xxx** a component whose pixels are archived and re-printed (the signature today) renders on a
      **permanently light surface with fixed ink** — the one sanctioned exception to "every surface
      reverses via the token override", and the reason `SIGNATURE_INK` is a literal, not a token.
      **D-xxx** `SIGNATURE_MAX_BYTES = 128 kB` is the agreed signature payload ceiling (SEC-09);
      the producer cap ships in S19, the submit-side rejection in S33.
      **G-xxx** `<canvas>` cannot carry `role="img"` under svelte-check (`a11y_no_interactive_element_
      to_noninteractive_role`) — name the wrapper instead; and a narrowed `getContext('2d')` const does
      not stay narrowed inside the controller's closures under `strict`.
- [ ] Amend `DESIGN-SYSTEM.md` §4.3 SignaturePad with the prop table, the `framed`/`bare` variants and
      the wrapper-name rule (NOTES, "Open for the parent").
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
