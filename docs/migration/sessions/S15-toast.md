# Session S15 — Unified Toast

**Stream:** design-system
**Depends on:** S13 (`Icon`, component testing), S12 (`$lib/reduced-motion`, base reset, global focus ring), S11 (tokens, `--static-white`, `svelte()` in vitest)   **PR:** <#___>   **Branch:** `migrate/S15-toast`
**Status:** 🟦 PR open

## Goal (one sentence)
Ship the one toast system — a runes store (`$lib/stores/toast.svelte`) callable from non-component code plus a `<ToastHost>` renderer — retiring **both** legacy systems (`js/lib/toast.js` `showToast` on the public site and `js/pages/admin/ui.js` `toast()` in the panel) with success/error/info/undo variants, auto-dismiss + manual close, `role=alert` for errors, stacking, and a reduced-motion guard.

## In scope
- `web/src/lib/stores/toast.svelte.ts` (new — the store: variants, lifecycle, timers, `undo`/action)
- `web/src/lib/components/ToastHost.svelte` (new — the only renderer)
- `web/src/routes/kit/toast/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/tests/unit/toast.test.ts` (new — the store with no DOM in the loop)
- `web/tests/component/Toast.test.ts` (new — `<ToastHost>` under jsdom)
- `web/tests/e2e/kit-toast.spec.ts` (new — real-browser proof; not in the CI gate)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `js/lib/toast.js`, `js/pages/admin/ui.js`, `css/components/toast.css`,
  `css/pages/admin/buttons.css`, `admin/index.html` (live; DUAL-MAINTENANCE governs).
- The `alert()` at `js/pages/admin/report-builder.js:407` — a call-site fix owed by S55, not a
  component change. The unified Toast is what it will call.
- `src/routes/+layout.svelte` — S23 (public chrome) and S37 (admin shell) mount `<ToastHost />`;
  mounting it globally now would collide with both.
- Modal / ConfirmDialog (S16), ActionSheet (S17), Lightbox (S20), Button (S14).
- **Alert/Callout** — the DESIGN-SYSTEM appendix files it under S15, but it is blocked on a token
  gap and deferred with a recommendation (NOTES "Open for the parent").
- Tokens, `vitest.config.ts`, `package.json`, `svelte.config.js`, `app.html` — unchanged from S13.
- DB / RLS / edge functions.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010),
      `CLAUDE.md` §4/§5, `DESIGN-SYSTEM.md` §1/§2/§4.2 Toast/§5.3/§6.1/§6.2, `PORT-DEBT.md` S15 + S38,
      `docs/admin-ux.md`, `ROADMAP.md` S15, `VERIFICATION.md`.
- [x] S11 + S12 + S13 deliverables applied to the harness (S09 base + S11 + S12 + S13 + this).
- [x] Legacy source of truth: `js/pages/admin/ui.js:4-19`, `admin/index.html:1546`,
      `css/pages/admin/buttons.css:87-117`, `js/lib/toast.js:1-103`, `css/components/toast.css:1-213`;
      call-site census (131 admin + 10 public) in NOTES.
- [x] Fixture / golden: none — there is no legacy output to diff (the port changes the markup on
      purpose: one system replacing two, plus a manual close, roles per type, and a cap).

## Steps
1. Read both legacy systems and their CSS; census the call sites and the per-type role/duration behaviour.
2. `toast.svelte.ts`: runes module state, the `schedule → leaving → removed` lifecycle, pausable
   countdowns, the stack cap, `undo`/action, `clear()`; prerender-safe (no timers without a `document`).
3. `ToastHost.svelte`: one element per item, role per variant, message interpolated as text, `<Icon>`
   glyphs, a named close control, token-only CSS, house easing + reduced-motion guard, ≤640px full-width.
4. Fix the two AA failures the inherited spec would have shipped (`--static-white` ink; composited
   success fill) — see NOTES decisions 2 and 3.
5. Tests: `tests/unit/toast.test.ts` (fake timers, no DOM) and `tests/component/Toast.test.ts`
   (`@testing-library/svelte` + `flushSync`).
6. `/kit/toast/` showcase; e2e spec; browser smoke at 1280 and 360, light/dark, reduced motion; gate.

## Acceptance criteria
- [x] `toast.success/error/info(msg, opts)` render, from **module code** with no component involved
      (every jsdom and browser assertion drives the store from outside the component).
- [x] Errors carry `role="alert"`; success / info / undo carry `role="status"` (jsdom + browser).
- [x] Auto-dismiss at 4 s (8 s for `undo`), `duration: 0` stays until closed, and a named
      **Cerrar** button closes any toast early — closing only the one it belongs to.
- [x] Toasts stack bottom-right (full width ≤640px) and the stack is capped at 4, oldest evicted.
- [x] The message is rendered as **text** — a `<img src=x onerror=…>` payload produces no element
      (no `{@html}` anywhere in the component, D-005).
- [x] `undo` shows an action button; it runs once, closes the toast, and a throwing handler is logged
      as `[toast] action failed:` and still closes it.
- [x] Reduced motion: entry `animation-name` computes to `none` and dismissal is immediate
      (`motionMs(TOAST_EXIT_MS) === 0`), verified with `emulateMedia`.
- [x] AA contrast against the actual fill, measured in Chromium: success **5.09:1** light /
      **5.55:1** dark · error **4.83:1** / **4.83:1** · info+undo **9.91:1** / **12.39:1**.
- [x] No horizontal scroll at 360px with a 130-character Postgres string in the body; the toast fits
      the viewport and the close target is 36×36.
- [x] Token-only CSS (no hex literal, no px/raw-rem font-size), one reduce-guarded animation, no
      `prefers-color-scheme`, no inline `style=`, no `window.__*`/inline `onclick`, canonical
      breakpoint (640) only — the S11/S12 hygiene suites stay green over the new files.
- [x] Visible focus ring on both toast controls, in the toast's own ink
      (`solid 2px rgb(255,255,255)`, `:focus-visible=true`) rather than the invisible page ring.
- [ ] No change to still-live legacy files — verify on the real branch (`git diff --stat` outside
      `web/` + docs must be empty).

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md` boxes 1–4, 6, 7, 8, 12 in a clean harness
      (`MSYS_NO_PATHCONV=1 git archive origin/migrate/S09-pdf web | tar -x` + S11 + S12 + S13
      deliverables + this, `npm ci`, `web/.env` stubbed, line endings normalised to LF —
      including the dotfiles, see NOTES/S13 landmine 2):
  - `npm run check` → `484 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`
  - `npm run lint` → `All matched files use Prettier code style!`, eslint 0 problems
  - `npm run test` → `24 passed | 1 skipped (25)` files, `543 passed | 2 skipped (545)` tests
    (S15 adds 32: `tests/unit/toast.test.ts` 19 + `tests/component/Toast.test.ts` 13; the S13
    baseline in this same harness was 511 passed)
  - `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`; `build/kit/toast/index.html`
    prerendered (the host renders as an empty `.toast-host`, which is correct — the stack is
    client state)
  - `npx playwright test tests/e2e/kit-toast.spec.ts` (Chromium headless shell 1234, against
    `vite preview` of the base-`''` build) → **8 passed** in 13.8 s
  - a throwaway Chromium script covering the same ground plus computed-colour contrast, the focus
    ring, dark mode and 360px → **29/29 checks passed** (numbers quoted in the acceptance list)
- Box 5 (golden) **N/A** — no legacy output to diff. The port deliberately replaces two divergent
  systems with one: it adds a manual close to the admin toast, an assertive role to the public one,
  a cap, an undo affordance, and AA-correct fills. The three colour changes are itemised in NOTES
  decisions 2–3 for the ledger.
- Box 7 note: the first e2e run failed on a **spec** bug (`Cerrar` also matched the kit page's
  "Cerrar todos (N)" button) — fixed with `exact: true`, not a product change.

## How to resume if interrupted
- Branch: `migrate/S15-toast` (on top of S13). Last known-good commit: see PR.
- Done so far: everything in this scratch dir is final and gate-green in the harness with
  S11 + S12 + S13 applied. Six new files, no edits to any existing file.
- Next concrete action: apply S11 → S12 → S13, copy `s15/web/**`, then
  `cd web && npm ci && npm run check && npm run lint && npm run test && MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`,
  open the PR.
- Landmines: NOTES.md — no Svelte `transition:` under jsdom; `TOAST_EXIT_MS` is declared twice;
  fake timers must leave `queueMicrotask` alone and must fake `Date`; `flushSync()` in component
  tests; `toast.clear()` between tests; `prefer-svelte-reactivity` vs plain `Map`; the ambiguous
  `Cerrar` locator; stale `vite preview` ports on Windows.

## On completion
- [ ] Update `MIGRATION.md`: status board (S15 → 🟦), Current state (`/app/kit/toast/` in staging;
      a toast store callable from module code exists for S38), Next up (S16).
      Candidate ledger entries (parent decides):
      **D-xxx** the toast store owns the exit phase and no library component uses a Svelte
      `transition:` (jsdom cannot run `element.animate()`);
      **D-xxx** `--color-success` may not carry white body text (3.3:1) — a filled success surface
      composites onto `--color-dark`, or S11 adds `--color-success-fill`;
      **D-xxx** overlay ink on a fixed-dark fill is `--static-white`, not `--color-white`;
      **G-xxx** `eslint-plugin-svelte`'s `prefer-svelte-reactivity` errors on a plain `Map`/`Set`
      in any `.svelte.ts`.
- [ ] Amend `DESIGN-SYSTEM.md` §4.2 Toast: `--static-white` ink, the composited success fill,
      `action` as a generic option (not undo-only), the 8 s undo window, `TOAST_MAX`, pause-on-hover.
- [ ] Decide the Alert/Callout token question (NOTES "Open for the parent") and re-slot the component.
- [ ] Close the `PORT-DEBT.md` S15 row except the `report-builder.js:407` `alert()`, still owed by S55.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
