# Session S16 — Modal + ConfirmDialog

**Stream:** design-system
**Depends on:** S15 (`$lib/stores/` + the host pattern), S14 (`Button`), S13 (`Icon`, component testing), S12 (`$lib/reduced-motion`, base reset, global focus ring), S11 (tokens, `--static-black`/`--static-white`, `--z-modal`)   **PR:** <#___>   **Branch:** `migrate/S16-modal-confirm`
**Status:** 🟦 PR open

## Goal (one sentence)
Ship the one `Modal` — retiring all three legacy overlay systems (`.modal-backdrop`/`.modal` + `ui.js` `openModal`/`closeModal`, the designer `.dz-modal`, and `.wizard-backdrop`/`.wizard`) — plus a promise-returning `confirm()` singleton and `<ConfirmHost>` callable from non-component code, with `bind:open`, Escape/scrim close, a **reference-counted** scroll lock that restores the previous body overflow, focus trap + return, and a confirm that stacks above an open modal.

## In scope
- `web/src/lib/scroll-lock.ts` (new — the reference-counted body lock + `has-floating-popup`)
- `web/src/lib/focus-trap.ts` (new — the stacked trap; also answers "am I topmost?" for Escape)
- `web/src/lib/components/modal.ts` (new — variants, block, the spacer class, the close label)
- `web/src/lib/components/Modal.svelte` (new — the one overlay)
- `web/src/lib/stores/confirm.svelte.ts` (new — the queued promise singleton)
- `web/src/lib/components/ConfirmHost.svelte` (new — the one renderer; a `variant="confirm"` Modal)
- `web/src/routes/kit/modal/+page.svelte` (new — prerendered staging smoke page, noindex)
- `web/tests/component/fixtures/ModalHarness.svelte` (new — a parent that actually binds `open`)
- `web/tests/component/Modal.test.ts` · `web/tests/component/ConfirmDialog.test.ts` (new)
- `web/tests/unit/scroll-lock.test.ts` (new — the counting rules with no component in the loop)
- `web/tests/e2e/kit-modal.spec.ts` (new — real-browser proof; not in the CI gate)
- `MIGRATION.md` status board / Current state / this session file (same PR)

## Out of scope (do NOT touch)
- Legacy `js/pages/admin/ui.js`, `css/pages/admin/modal.css`, `css/pages/admin/wizard.css`,
  `admin/index.html` (the `#confirmModal` block and the two duplicate `id="presetModal"` blocks),
  `js/components/CalendarGrid.js` — all live; DUAL-MAINTENANCE governs.
- The **full** duplicate-preset-id fix: this session makes the collision *inexpressible*; rewiring
  the two preset screens is S47's job (PORT-DEBT §14).
- `src/routes/+layout.svelte` — S23 (public chrome) and S37 (admin shell) mount `<ConfirmHost />`
  next to `<ToastHost />`; mounting it globally now would collide with both.
- ActionSheet (S17), Lightbox (S20), RichTextEditor (S18), FormWizard (S21) — they must **consume**
  `$lib/focus-trap` and `$lib/scroll-lock`, not re-implement them.
- **IconButton / Badge / Avatar** — still unbuilt (S14 "Open for the parent" #1). The modal's ×
  button is hand-rolled here, matching S15's toast close.
- Tokens, `vitest.config.ts`, `package.json`, `svelte.config.js`, `eslint.config.js`, `app.html`,
  `playwright.config.ts` — unchanged from the S13 state.
- DB / RLS / edge functions.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010/G-018/G-019),
      `CLAUDE.md` §4/§5, `DESIGN-SYSTEM.md` §1/§2/§4.2 Modal + ConfirmDialog/§6.1/§6.2,
      `PORT-DEBT.md` S16 (+ the S46/S53 rows that consume it), `docs/admin-ux.md`,
      `ROADMAP.md` S16, `VERIFICATION.md`, `SESSION-TEMPLATE.md`.
- [x] S11 + S12 + S13 + S14 + S15 deliverables applied to the harness (S09 base + those + this).
- [x] Legacy source of truth: `js/pages/admin/ui.js:24-57` (`confirm`, `initConfirm`, `openModal`,
      `closeModal`), `admin/index.html:1361-1373` (`#confirmModal`) and `:1283`/`:1376` (the two
      `id="presetModal"` blocks), `css/pages/admin/modal.css:1-84`, `css/pages/admin/wizard.css:5-41`,
      `js/components/CalendarGrid.js:350-361` (`has-floating-popup` + the day-sheet lock).
- [x] Fixture / golden: none — there is no legacy output to diff. The port deliberately replaces
      three divergent systems with one and **adds** behaviour legacy does not have (focus
      management, Escape on two of the three, a counted lock, a queue instead of one resolver).

## Steps
1. Read all three legacy systems, their CSS and the two ways body overflow gets set; census the
   `#confirmModal` markup and the duplicate-id collision (G-009).
2. `scroll-lock.ts`: count the locks, remember and **restore** the prior `body.style.overflow`,
   own `body.has-floating-popup`; idempotent releases; prerender-safe.
3. `focus-trap.ts`: a stack of containers, one document-capture `keydown` (Tab wrap) + `focusin`
   (pull back) while any trap is open, `isTopmostTrap()` so Escape closes only the top overlay.
4. `Modal.svelte`: `bind:open`, four width variants, header/body/footer snippets, a `role="alert"`
   error region, a per-instance `$props.id()` header id, one `$effect` that pairs
   lock → trap → focus-in with untrap → unlock → focus-back.
5. `confirm.svelte.ts` + `ConfirmHost.svelte`: a **queued** promise singleton (legacy overwrote its
   single resolver and hung the first caller) rendered as a `variant="confirm"` Modal, focus on the
   safer button, `<Button>` for both actions.
6. Tests: `tests/unit/scroll-lock.test.ts`, `tests/component/Modal.test.ts`,
   `tests/component/ConfirmDialog.test.ts` (+ the `ModalHarness` fixture that binds `open`).
7. `/kit/modal/` showcase; e2e spec; browser smoke at 1280 and 360, light/dark, reduced motion; gate.

## Acceptance criteria
- [x] `bind:open` is two-way: the fixture's own value flips to `false` when the child closes itself
      (trigger → open → × → the **parent's** `data-open` reads `false`).
- [x] Escape closes; a scrim click closes; a click **inside** the dialog does not; a press that
      starts inside and ends on the scrim (a text drag) does not; `closeOnEscape` /
      `closeOnBackdrop` opt out and were verified in both jsdom and Chromium.
- [x] Scroll lock **saves and restores**: with `body.style.overflow = 'auto'` before opening, it is
      `hidden` while open and back to `'auto'` — not `''` — on close.
- [x] Reference-counted: two open modals → depth 2; closing one leaves the page locked; a confirm
      over a modal goes 1 → 2 → 1 and only reaches 0 when the modal beneath closes too.
      `body.has-floating-popup` follows the same count.
- [x] Focus moves into the dialog on open (the container by default, or `initialFocus`), Tab and
      Shift+Tab wrap at both ends, a stray Tab is pulled back in, and focus **returns to the
      trigger** on close (Chromium: `toBeFocused()` on the original button).
- [x] `role="dialog"` + `aria-modal="true"` + an accessible name from the title (or `ariaLabel`
      with a custom header); the × button is named **Cerrar**.
- [x] `await confirm(title, msg, opts)` resolves `true` only for the affirmative button; No, ×,
      Escape, scrim and `cancelAll()` all resolve `false` — every call made from **plain module
      code**, never a component event handler.
- [x] Queue: two confirms raised back-to-back both settle, in order (the legacy hung the first).
- [x] The confirm **stacks above** an open Modal: `z-index: calc(var(--z-modal) + 10)` computes
      higher than the modal's `100` in Chromium; Tab cannot reach the modal underneath; Escape
      closes only the confirm; the modal survives, keeps the lock and takes focus back.
- [x] Focus lands on the **safer** (cancel) button; `danger` is the default and `danger: false`
      renders `ird-btn--primary`, not `ird-btn--danger`.
- [x] Title and message are **text** — an `<img src=x onerror=…>` payload renders as characters and
      produces no element (no `{@html}` anywhere in this path, D-005).
- [x] Every instance owns its ids: two modals on one page have different `aria-labelledby` values;
      there is no element id in the markup that a second instance could collide with (G-009).
- [x] Token-only CSS (no hex literal, no px/raw-rem font-size), no `prefers-color-scheme`, no inline
      `style=`, no `window.__*`/inline `onclick`, canonical breakpoint (480) only; both animations
      carry a `prefers-reduced-motion` guard, verified with `emulateMedia` (`animation-duration`
      ≤ `1e-05s`, per S14 landmine 5).
- [x] Measured in Chromium, both themes: panel ink **9.91:1** light / **14.11:1** dark; the
      `role="alert"` error region **5.74:1** / **5.14:1** over its composited tint; the × glyph
      **5.36:1** / **5.74:1**; × target **36×36**; panel radius **16px** (`--radius-lg`); title
      **20px** (`--fs-md`); scrim `color(srgb 0 0 0 / 0.4)` + `blur(3px)` — dark in **both** themes.
- [x] `secondary` inside `[data-surface="admin"]` computes slate `rgb(71, 85, 105)` — the same
      component, no palette written into it (D-014).
- [x] No horizontal scroll at 360px with a confirm stacked over a wide modal
      (`documentElement.scrollWidth <= innerWidth`), and no console/page errors on the smoke page.
- [ ] No change to still-live legacy files — verify on the real branch (`git diff --stat` outside
      `web/` + docs must be empty).

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md` boxes 1–4, 6, 7, 8, 12 in a clean harness
      (`MSYS_NO_PATHCONV=1 git archive migrate/S09-pdf web | tar -x` + the S11, S12, S13, S14, S15
      deliverables + this, `npm ci`, `web/.env` stubbed, line endings normalised to LF **including
      the dotfiles** — S13 landmine 2 / S14 landmine 10, `.prettierrc` fails the gate otherwise):
  - `npm run check` → `503 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`
  - `npm run lint` → `All matched files use Prettier code style!`, eslint 0 problems
  - `npm run test` → `27 passed | 1 skipped (28)` files, `603 passed | 2 skipped (605)` tests
    (S16 adds **40**: `tests/component/Modal.test.ts` 20 + `tests/component/ConfirmDialog.test.ts`
    14 + `tests/unit/scroll-lock.test.ts` 6; the S11–S15 baseline in this same harness was 563)
  - `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` → `✔ done`; `build/kit/modal/index.html`
    prerendered with **no** `role="dialog"` in it, which is correct — every overlay is client state
  - `npx playwright test tests/e2e/kit-modal.spec.ts` (Chromium headless shell 1234, against
    `vite preview` of the base-`''` build, on a dedicated port per S14 landmine 3) → **7 passed**
    in 12.2 s
  - a throwaway Chromium script for the computed colours, contrast, sizes and the admin surface →
    the numbers quoted in the acceptance list
- Box 5 (golden) **N/A** — no legacy output to diff. Three systems collapse to one and the port
  adds behaviour legacy lacks; the deliberate divergences are itemised in NOTES decisions 1–10.
- Box 7 note: the first e2e run failed **7/7** with "element(s) not found" — a harness mistake, not
  a product one. The `build/` in the harness was the `BASE_PATH=/app` artifact from the CI gate,
  so `vite preview` at `/` served a page whose every asset 404'd (G-019). Rebuilding without
  `BASE_PATH` inside the webServer command made it 7/7 green. **Never point a preview at a
  `BASE_PATH=/app` build.**

## How to resume if interrupted
- Branch: `migrate/S16-modal-confirm` (on top of S15). Last known-good commit: see PR.
- Done so far: everything in this scratch dir is final and gate-green in the harness with
  S11 + S12 + S13 + S14 + S15 applied. Eleven new files, no edits to any existing file.
- Next concrete action: apply S11 → S12 → S13 → S14 → S15, copy `s16/web/**`, then
  `cd web && npm ci && npm run check && npm run lint && npm run test && MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`,
  open the PR.
- Landmines: NOTES.md — `$props.id()` must be its own declaration initializer; no Svelte
  `transition:` under jsdom; a focusable-element filter must not use geometry (jsdom has none);
  `import.meta.url` is not a `file:` URL inside a vitest test file; `open={expr}` needs `onclose`;
  a preview must never serve a `BASE_PATH=/app` build; port 4173 is shared across sessions.

## On completion
- [ ] Update `MIGRATION.md`: status board (S16 → 🟦), Current state (`/app/kit/modal/` in staging;
      `confirm()` callable from module code exists for S38), Next up (S17).
      Candidate ledger entries (parent decides):
      **D-xxx** every overlay in `web/` locks the page through `$lib/scroll-lock` and traps focus
      through `$lib/focus-trap` — no component sets `body.style.overflow` or installs its own key
      handler (binds S16, S17, S20, S21 and the S59–S63 designer docks);
      **D-xxx** `confirm()` **queues**; a second request never discards the first one's resolver;
      **D-xxx** the scrim colour is `--static-black`, not `--color-black` (which reverses to
      `#dfdedc` and would produce a white wash in dark mode);
      **G-xxx** `$props.id()` is only legal as a top-level variable-declaration initializer;
      **G-xxx** `vite preview` against a `BASE_PATH=/app` build 404s every asset — an e2e suite
      then fails with "element(s) not found" and looks like a product bug (G-019's sibling).
- [ ] Amend `DESIGN-SYSTEM.md` §4.2 Modal / ConfirmDialog with the shipped prop tables (NOTES
      "Prop-shape contracts") and the divergences: `tool` fixed at 420px, the 480px radius token
      (`--radius-md`, not a literal 12px), the ×'s 36px target, the body-only scroll,
      `initialFocus` as a selector, `danger` defaulting to `true`, and the confirm **queue**.
- [ ] Decide whether **IconButton** lands before S17 (S14 open question #1) — the modal × and the
      action-sheet triggers are both hand-rolled without it.
- [ ] Close the `PORT-DEBT.md` S16 row except the two call-site halves it cannot own: the duplicate
      preset screens (S47) and the day-sheet's `has-floating-popup` consumer CSS (S23/S48).
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
