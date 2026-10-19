# Design system architecture

> Snapshot 2026-10-18 · repo `f3b8c94`. This page is the **architecture**: token taxonomy, theming,
> styling strategy, component conventions. Component appearance, variants and state matrices stay
> in [`docs/migration/DESIGN-SYSTEM.md`](../migration/DESIGN-SYSTEM.md). The public «La veta» spec
> (`docs/migration/PUBLIC-DESIGN.md`, D-024/D-025) exists only on the unmerged branch
> `migrate/S23-S36-public-site`. Admin UX rules: [`docs/admin-ux.md`](../admin-ux.md). Legacy CSS
> rules: root `CLAUDE.md` §4. Decision: [ADR-0003](architecture-decisions/ADR-0003-design-tokens.md) (D-031).

## 1. Church Center constraints on styling

None on our pages: a link-out page is ours end to end (ADR-0001). Church Center's theme can't be
inherited — there is no theme API or CSS exposure (R14). The browser chrome around our page belongs
to the Church Center app. Optionally, an org admin can set the Church Center logo (any plan) and theme
colors (paid plans) to match the irdlex.org palette, so the hand-off feels continuous. That is manual
configuration, not code.

## 2. What the system has to cover (real usage)

| Pattern in the live site | Port component | State |
|---|---|---|
| `.ird-btn` family, teal/secondary/danger buttons | `Button` | built (S14) |
| Dashboard cards, event cards, KPI cards | `Card` (+ `site/EventCard`, S23 branch) | built |
| Admin modals, calendar modal, wizard modals | `Modal`, `ConfirmHost` | built (S16) |
| Kebab menus — four legacy implementations | `ActionSheet` (popover ≥ 641px, bottom sheet ≤ 640px) | built (S17) |
| Two toast systems (admin `toast`, public `showToast`) | one `ToastHost` + `toast` store | built (S15) |
| Registration, discipleship and admin wizards | `FormWizard` (shared step machine) | built (S21) |
| Treasury and registrations tables | `DataTable` (cards ≤ 1100px, no horizontal scroll) | built (S21) |
| Gallery lightbox | `Lightbox` + store | built (S20) |
| Admin rich text + public rendering | `RichTextEditor`, `RichText` | built (S18) |
| Waiver signature | `SignaturePad` | built (S19) |
| Collapsible admin panels | `Disclosure` | built (S21) |
| Font Awesome + SVG sprite | `Icon` | built (S13) |
| `.loading` / `.empty-state` markup | State components | **owed** (S12; S23's `StateBox` covers part) |
| Status pills, role chips | `Badge` | **owed** (S14) |
| Icon-only buttons (close, kebab) | `IconButton` | **owed** (S14) |
| Inline notices | `Alert` / `Callout` | **owed** (S15) |
| Form fields with label, hint, error | `FormField` vocabulary | **owed** |
| Toggles, segmented filters, multi-select, password, code entry | `Switch`, `SegmentedControl`, `MultiSelect`, `PasswordField`, `CodeInput` (S39) | **owed** |
| Calendar grid + day sheet, gallery year picker | port with S27/S48 and S29 | **owed** |

## 3. Token architecture (`web/src/lib/styles/tokens/*`)

Three layers, all CSS custom properties, existing names kept (DESIGN-SYSTEM §2).

### 3.1 Foundation — raw values; components don't use them directly

| Family | Tokens |
|---|---|
| Color palettes | teal ramp `--color-0…100`, `--orange-*`, `--gray-*`; non-reversing `--static-black/white` |
| Typography | `--fs-xxs…4xl`, `--fs-btn` (one fluid 360→1280px ramp, monotonic — D-015/D-022); font families |
| Spacing | `--pd-*`, `--mg-*`, `--gap-*` (fluid) |
| Sizing | `--size-*` (legacy static scale — not for type, D-015), layout sizes |
| Radius | `--radius-xs…full` |
| Elevation | `--shadow-rgb` primitive (D-020) |
| Layering | `--z-*` |
| **Motion (new, D-031)** | `--ease-standard` = `cubic-bezier(0.22, 1, 0.36, 1)`; `--dur-fast` 120ms · `--dur-base` 180ms · `--dur-slow` 300ms; all collapse to `0.01ms` under `prefers-reduced-motion: reduce` |
| Responsive conventions | **Constants, not tokens:** 768 / 640 / 600 / 480, plus 900 (admin drawer) and 1100 (table collapse), desktop-first `max-width` (DESIGN-SYSTEM §4). Fluid tokens first; a breakpoint only when layout must change |

### 3.2 Semantic — the only color and elevation tokens components may use

| Role | Tokens today | Rule |
|---|---|---|
| Page and raised surfaces | `--color-bg-light`, `--color-surface` | `--color-surface` reverses with the theme; pair it with `--color-text` |
| Body and dimmed ink | `--color-text`, `--color-muted` | the only text tokens on reversing surfaces |
| Fixed dark surface / fixed light ink | `--color-dark` (surface), `--color-white` (ink) | never `--color-dark` as text on the page; never `--color-white` as a panel |
| Focus | `--color-focus` | every interactive element; never `outline: none` alone |
| Status | `--color-danger/success/warn/info`, `--status-*` (+`-bg`) | `--color-success` is a fill, not ink (D-023); status pairs icon + label |
| Money | `--money-pos/neg/warn` (+`-bg`) | D-016; no money hex literals |
| Categories | `--cat-*`, `--cat-*-t` | event categories |
| Accent | `--color-secondary`, `--color-accent`, `--gold-bright` (decorative only) | fills; admin overrides these to slate (D-014) |
| Accent ink | `--color-accent-ink` | accent as TEXT, AA in both themes and both surfaces (D-038) |
| Elevation | `--shadow-sm/md/lg` | the only shadows (D-020) |
| Roles to add only with a consumer | `--color-border`, `--color-link`, `--color-scrim`, `--cta-fill/--cta-ink` | S23 adds `--color-link` and `--cta-*` |

Interactive hover, active and disabled states are derived inside components from these roles; they are
not global tokens. Hover moves toward `--color-text`, never toward `--color-dark`.

### 3.3 Component tokens

Custom properties declared at a component's root (`--modal-max`, `--act-ink-*`), named
`--<block>-<property>`, read only inside that component. Parents may override them to make a variant.
They are never declared in token files.

## 4. Theming

Two independent axes; no runtime brand switching beyond them:

| Axis | Values | Mechanism |
|---|---|---|
| Color scheme | system / light / dark | `prefers-color-scheme` guarded by `:root:not([data-theme=…])`, plus `:root[data-theme="dark"]`, only in `tokens/colors.css` (D-017); persisted as `ird.theme` (D-022) |
| Surface | public / admin | `[data-surface="admin"]` on the admin layout root overrides the accent roles to slate (D-014, D-021) |

- **Add `color-scheme`** (D-031): `light dark` under system, and `light` / `dark` under the forced
  themes, so native controls, date pickers and scrollbars match. None is declared today.
- **Resolved by D-038 (2026-10-19):** admin routes use their own key (`ird.app.admin.theme`) and the boot script picks the key by path. *Was:* the no-FOUC boot script in `web/src/app.html` applies
  `ird.theme` on every route, so a theme forced in the admin would also force public pages. The
  public site is meant to follow the system (PUBLIC-DESIGN §6 on the S23 branch). The session that
  ships an admin appearance switch (S45) owes a D-022 amendment that scopes the key to the admin.
- **One brand.** A single church; `[data-surface="admin"]` is the only brand variant. The public
  identity is whatever D-024 settles once the S23 branch merges.

## 5. Styling strategy

- **Global CSS** through `app.css` in a fixed cascade — tokens → base → layout → utilities, enforced
  by `tokens.test.ts`. **Component CSS** lives in Svelte scoped `<style>`. No Sass, no CSS-in-JS, no
  Tailwind (ADR-0003).
- **BEM** inside components (`ird-btn__label`, `ird-btn--danger`); `ird-` for primitives.
- **No CSS nesting for now.** The port uses none, and native nesting needs Safari 16.5+ while the
  build target is Safari/iOS 16.4. Allow it only after S05b proves the build lowers it.
- **Every animation** uses the motion tokens and honors reduced motion.
- **Touch and pointer:** hover is an enhancement inside `@media (hover: hover)`; nothing is reachable
  only by hover.

## 6. Component conventions

- **API:** Svelte 5 runes. `$props()` typed by a `Props` type in the sibling `.ts` file (the existing
  `button.ts`, `modal.ts` pattern). Snippets for content regions. `bind:` only for genuinely two-way
  state (`open`, `value`). Callbacks named `onX`. IDs from `$props.id()`, never global IDs (G-009).
- **Overlays:** every overlay — Modal, ConfirmHost, ActionSheet, FormWizard, Lightbox — joins **one**
  focus-trap stack and the reference-counted scroll lock. Today ActionSheet, FormWizard and Lightbox
  keep their own handling, so a nested overlay can pull focus back or close two layers at once; S12b
  unifies them. Full-screen overlays integrate with history (shallow routing,
  [target-architecture.md §4](target-architecture.md#4-routing-and-navigation)).
- **Mobile behavior:** fixed bottom UI pads `env(safe-area-inset-bottom)`; full-height overlays use
  `dvh` with a `vh` fallback (Modal and FormWizard still use `vh`); text inputs compute ≥ 16px on
  phones (enforced for inputs by `css-baseline.test.ts`).
- **Accessibility expectations:** visible focus on every control; names for icon-only controls; error
  text wired with `aria-invalid` + `aria-describedby` (FormWizard fields lack this today); DataTable's
  card mode keeps table semantics for screen readers (it doesn't today); SignaturePad gets a typed-name
  alternative (WCAG 2.5.7 Dragging Movements; owed by S33).
- **Targets:** ≥ 44px for primary controls, checkboxes, radios and toggles (DESIGN-SYSTEM); never
  below WCAG 2.5.8's 24px minimum, with spacing.
- **No business logic in primitives:** no repos, no Supabase (layer rules in
  [target-architecture.md §3](target-architecture.md#3-layers-and-dependency-rules-web)).

## 7. Accessibility libraries

Keep the built primitives: they're tested and match the spec. For the remaining complex widgets with
intricate keyboard and ARIA behavior — `CodeInput`/pin input, `MultiSelect`/combobox — prefer a
headless state machine over hand-rolling:

- `@zag-js/svelte` 1.46.0 (peer `svelte >= 5`; npm 2026-10-18). Zag is **already in production**:
  legacy `js/lib/captcha.js` uses `@zag-js/vanilla` + `@zag-js/pin-input` 1.44.0.
- Bits UI 2.19.5 is the alternative if a widget needs styled defaults.

Adopt per widget, pinned, with component tests — not as a wholesale UI kit.

*2026-10-19 (PR-C2):* `CodeInput` didn't need one — it is a single native `<input autocomplete="one-time-code">` drawn as six boxes, which serves code autofill, password managers, paste and screen readers better than six inputs, with no dependency.

## 8. Enforcement (S11b)

| Check | Today | Target |
|---|---|---|
| Hex literals | `tokens.test.ts` scans CSS files only | also `.svelte` style blocks (on `main`, the 7 hex mentions in primitives are all in comments) |
| Raw palette use in primitives | 14 references in 4 primitives | ratchet allowlist that only shrinks |
| `var(--x, #hex)` fallbacks | none in primitives | disallowed in `web/` (a fallback hides a missing token) |
| `--color-dark` (16 uses) / `--color-white` (5 uses) | unclassified | each use checked against the surface/ink rule |
| Contrast | AA checks for money/status (D-023) | semantic text and focus pairs in both themes (4.5:1 text, 3:1 non-text) |
| Breakpoints | convention | test: `@media` widths only from the canonical list |
| Motion | literals | `--ease-standard` / `--dur-*` only; reduced-motion test |

## 9. Migration of styles

Legacy CSS is not migrated. It is deleted with each surface's cutover and finally in S65. The port's
token restructure is one small session, S11b, after the S23 branch merges, so «La veta»'s additive
tokens land first.
