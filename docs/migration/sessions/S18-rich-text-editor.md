# Session S18 — RichTextEditor + the `{@html}` rule

**Stream:** design-system
**Depends on:** S13, S14 (and S11/S12 for tokens + the CSS baseline; `sanitize-html.ts` from S07)
**PR:** #\_\_\_ **Branch:** `migrate/S18-rich-text`
**Status:** 🟦 PR open

## Goal (one sentence)

Port `js/lib/rich-text.js` to `RichTextEditor.svelte` on top of `$lib/sanitize-html`, add the render-side
`RichText.svelte` so stored markup is sanitized on save **and** on render, and turn MIGRATION.md D-005
into a CI lint rule that blocks raw `{@html}`.

## In scope

- `web/src/lib/components/RichTextEditor.svelte` — the editor (toolbar, colour, links, paste/drop).
- `web/src/lib/components/RichText.svelte` — the render half (`.rich-content`), the ONE sanctioned `{@html}`.
- `web/src/lib/components/rich-text.ts` — toolbar/swatch data, the value guards, `RichTextEditorApi`.
- `web/eslint-rules/no-raw-html.js` + its registration in `web/eslint.config.js`.
- `web/src/routes/kit/rich-text/+page.svelte` — the staging showcase.
- Tests: `tests/component/RichText{,Editor}.test.ts`, `tests/unit/no-raw-html.test.ts`,
  `tests/fixtures/no-raw-html/{allowed,forbidden}.svelte`, `tests/e2e/kit-rich-text.spec.ts`.

## Out of scope (do NOT touch)

- Every legacy file. `js/lib/rich-text.js`, `css/pages/admin/rich-text.css` and
  `css/pages/rich-content.css` stay live and untouched (VERIFICATION gate #8).
- `$lib/sanitize-html.ts` — the allowlist is the D-005 security contract; this session **consumes** it
  and adds a second call site, it does not change a line of it.
- The registrations screen that will mount two of these (S57), the FormWizard field union (S21),
  Modal/ActionSheet (S16/S17), DB/RLS.

## Prereqs (read before writing code)

- [x] Read `MIGRATION.md` (§0, §2 D-005/D-014/D-015/D-016/D-017, §3 G-001/G-009/G-010/G-018/G-019),
      `CLAUDE.md` §4/§5, `DESIGN-SYSTEM.md` §4.3 (`rich-text`, the form-field contract),
      `PORT-DEBT.md` S18, `docs/admin-ux.md`, `VERIFICATION.md`.
- [x] Dependency sessions: S11, S12, S13, S14 deliverables copied into the harness and imported
      exactly as they will exist in the repo.
- [x] Legacy source of truth: `js/lib/rich-text.js:1-222`, `css/pages/admin/rich-text.css:1-133`,
      `css/pages/rich-content.css:1-21`, `js/pages/admin/special-events-tab.js:186-193,287-308,449-455`.
- [x] Fixture / golden: reused `tests/fixtures/sanitize-html.json` (S07's 73-vector XSS corpus) as the
      render-path corpus; new lint fixtures under `tests/fixtures/no-raw-html/`.

## Steps

1. Read the legacy editor and its two consumers; catalogue every command, icon, label and swatch.
2. Build `rich-text.ts` (toolbar description + `isHexColor`/`safeHexColor`/`normalizeLinkUrl` + the API type).
3. Build `RichTextEditor.svelte` with the contenteditable managed imperatively behind a `lastEmitted`
   echo guard; sanitize on the way in (value/setHtml/paste/drop) and out (getHtml/value/onchange).
4. Build `RichText.svelte` — `renderRichText()` + `htmlIsEmpty()`, `.rich-content` ported to tokens.
5. Write `eslint-rules/no-raw-html.js`; register it and turn `svelte/no-at-html-tags` off.
6. Tests: the lint rule through the real config (fixtures + inline table + tree invariants), the two
   components under jsdom, the showcase, and a browser spec for what jsdom cannot answer.
7. Run the four gates in a clean harness built from `migrate/S09-pdf` + S11–S14.

## Acceptance criteria

- [x] **Sanitized on save AND on render (D-005).** In: initial `value`, `setHtml()`, paste, drop. Out:
      `getHtml()`, the bound `value`, `onchange`. `RichText.svelte` sanitizes again at render — proven
      against all **73 XSS vectors**, asserted inert in the live DOM (no script/img/svg element, no
      `on*` attribute, no `javascript:`/`data:` URL, no `url()` in a style).
- [x] **The caret does not jump while typing.** The surface's `innerHTML` is written only by
      `applyHtml()`, and only for a value that is not this component's own echo. Asserted two ways:
      under jsdom by **node identity + live selection offset** across a run of keystrokes *and* across
      the value echo a bound parent pushes back; in Chromium by typing mid-word with
      `page.keyboard.type()` and reading the caret back (offset 12 → 15, text lands mid-word).
- [x] **Raw `{@html X}` is blocked by lint** unless `X` is `sanitizeHtml()`/`renderRichText()` output,
      an `html\`\`` template, static literal markup, or the `?raw` sprite asset. The rule also covers
      `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, or the tag would be one line from
      bypassable. A fixture `.svelte` with `{@html foo}` fails; one with `{@html sanitizeHtml(x)}` passes.
- [x] The full legacy toolbar is ported verbatim (8 commands + the colour control, same execCommand
      ids, same icons, same Spanish labels, same six swatches).
- [x] Live legacy URLs unaffected — nothing outside `web/` is touched.
- [x] No console errors on the showcase; no horizontal scroll at 360px; ≥16px surface on mobile;
      44px toolbar targets on a phone; reduced-motion guard; dark mode via tokens only.

## Verification gate

```
VERIFICATION GATE  —  observed in a clean harness (git archive of migrate/S09-pdf + S11–S14
                      deliverables + this session's files), web/.env stubbed

[x]  1. Install clean       npm ci                                    → 0 vulnerabilities blocking, exit 0
[x]  2. Typecheck           npm run check                             → 498 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format       npm run lint                              → prettier clean, eslint 0 problems
[x]  4. Unit tests          npm run test                              → 25 files passed | 1 skipped,
                                                                        670 passed | 2 skipped
                                                                        (+139 new: 31 lint-rule,
                                                                         86 RichText, 22 RichTextEditor)
[x]  5. Golden parity       npm run test:golden                       → unchanged; S07's sanitize-html
                                                                        golden is re-used as the render
                                                                        corpus, not regenerated
[x]  6. Build               BASE_PATH=/app npm run build              → adapter-static wrote build/,
                                                                        0 errors, /app/kit/rich-text/
                                                                        prerendered
[x]  7. Preview smoke       tests/e2e/kit-rich-text.spec.ts           → 10/10 in Chromium against
                                                                        `vite preview` of the real build
                                                                        (dedicated port 4188; NOT in the
                                                                        CI gate)
[x]  8. Legacy untouched    deliverables are web/** only              → no legacy file in the patch
[x]  9. Parity walk         legacy /admin editor vs /kit/rich-text/   → same commands/labels/swatches;
                                                                        the deliberate differences are
                                                                        listed in NOTES "Decisions"
[ ] 10. SEO diff            n/a — no public route ported here
[ ] 11. SW cache bumped     n/a — not a cutover
[x] 12. Secrets/PII clean   no keys, no PII; .env is the stub pair
[ ] 13. Ledger updated      MIGRATION.md edit is the parent's (see NOTES "Open for the parent")
```

## How to resume if interrupted

- Branch: `migrate/S18-rich-text`. Deliverables are complete; nothing is half-applied.
- Done so far: all six files + five test files, four gates green, 10/10 browser spec.
- Next concrete action: open the PR, paste the gate block, and apply the MIGRATION.md/DESIGN-SYSTEM.md
  amendments listed in `NOTES.md` → "Open for the parent".
- Landmines: see `NOTES.md` — especially that `eslint.config.js` is a **shared file** (merge with
  S11's version, do not overwrite), and that `RichText` renders nothing during prerender because the
  sanitizer needs `DOMParser` (G-001).

## On completion

- [ ] Update `MIGRATION.md`: status board, Current state, Next up; record the D-005 amendment
      (the lint rule + its four permitted shapes) and the new gotchas.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
