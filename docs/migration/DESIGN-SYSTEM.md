# Design system specification — the admin component library

> The build-against spec for the design-system sessions **S11–S21**. Read
> [`../../MIGRATION.md`](../../MIGRATION.md) (§0, §2 decisions, §3 gotchas) and the
> [`ROADMAP.md`](ROADMAP.md) row for your session first, then this file. Append-only:
> strike through, never delete. Any change to a locked shape (token name, prop
> signature, state contract) is a Decision in `MIGRATION.md §2`, not a silent edit.
>
> Last updated: 2026-07-13 · by: design-system-spec · Status: **spec only, nothing built**

The roadmap rows for S11–S21 say *"Button + Card"*, *"Modal + ConfirmDialog"*, *"ActionSheet"*,
*"Disclosure + DataTable + FormWizard"* — a **"done when"** but no picture of what to build. This
file is the picture. A fresh session that has never opened `/admin` must be able to build its
primitive from this file alone: variants, prop shape, the full state matrix, a11y, responsive
behaviour, and what the legacy got wrong and must **not** be ported.

Everything here is distilled from the legacy code and from **PART 0 (Master Context Block)** of
[`.claude/REDESIGN-ADMIN.md`](../../.claude/REDESIGN-ADMIN.md), which is the aesthetic contract. The
redesign brief is **requirements input to the migration, not a work order against the legacy panel**
(the migration governs — see [`DUAL-MAINTENANCE.md`](DUAL-MAINTENANCE.md)). Nothing in this file
lands in the frozen legacy admin.

**How to read a component entry:** each names its **session**, what legacy systems it **retires**,
its **variants**, **props/API**, the **state matrix**, **a11y**, **responsive** behaviour, and a
**do-not-port** list. Numbers in `monospace` are the legacy baseline you are matching or improving.

---

## Table of contents

1. [The aesthetic contract](#1--the-aesthetic-contract)
2. [Tokens (S11)](#2--tokens-s11)
3. [Dark mode (S11)](#3--dark-mode-s11)
4. [The component sheet](#4--the-component-sheet)
   - 4.1 Primitives — Icon · Button · IconButton · Badge · Avatar · Card
   - 4.2 Overlays — Modal · ConfirmDialog · ActionSheet · Toast · Lightbox
   - 4.3 Forms — the field vocabulary · special fields · Alert/Callout
   - 4.4 Composites — Disclosure · DataTable · FormWizard · SectionNav · SignaturePad
5. [The state system (S12) — the highest-value item](#5--the-state-system-s12)
6. [Acceptance checklist](#6--acceptance-checklist)

---

## 1 · THE AESTHETIC CONTRACT

Distilled verbatim-in-spirit from `.claude/REDESIGN-ADMIN.md` PART 0. This is the north star for
**every** S11–S63 session. When a choice is ambiguous, this section decides.

**Who uses this.** A Spanish-speaking church's volunteers and pastors. Often on a phone. Often **not**
power users. The tool must be **calm, legible, high-contrast, restrained, and obviously clickable.**

**The palette is neutral slate.** `--color-dark` (`#394548`) is the primary surface/brand. The admin
deliberately neutralises the public site's gold/teal to slate (see §2). Semantic color
(success/danger/warn, money +/-, category tints) is used **sparingly and meaningfully**, never
decoratively.

| DO NOT produce | DO aim for |
|---|---|
| neon, glows, glassmorphism | calm flat surfaces, one radius scale, one shadow scale |
| gratuitous gradients | solid slate fills; tint only for semantic meaning |
| purple/indigo SaaS-template chrome | the restrained slate palette in `palette.css` |
| stat cards with fake sparklines, "AI dashboard" aesthetics | real KPI tiles with honest scope labels |
| gold/amber/orange/teal as an admin accent | slate accents; semantic color only where it *means* something |
| a decorative flourish you were "tempted by" | a **mid-range type step** (see §2 — the scale currently jumps 0.7rem labels → 1.85rem/800 numbers with nothing between) |
| hover-only affordances (invisible on touch) | generous touch targets, everything reachable by tap and keyboard |
| `outline: none` with no replacement | a **visible focus-visible ring** on every interactive control |

> ⚠️ **The repo's own legacy `.claude/CLAUDE.md` says the UI uses "neon styling." That is STALE AND
> WRONG.** PART 0 says so explicitly: *"Any older instruction in this repo mentioning 'neon styling'
> is stale and wrong — the real house style is a restrained slate/AA-contrast-tuned palette."* Do not
> take design cues from that file. This document and PART 0 are the aesthetic authority.

**Accessibility is a requirement, not a nice-to-have.** AA contrast against the actual surface behind
the element; visible focus rings; no hover-only affordances; an accessible name (`aria-label`) on
every icon-only control; ≥16px effective input font-size on mobile (iOS no-zoom, `docs/admin-ux.md`
§5); no screen scrolls horizontally at 360px (`docs/admin-ux.md` §2).

**House easing:** `cubic-bezier(0.22, 1, 0.36, 1)`, used ~100× in the legacy. Match it. **Every**
animation carries a `@media (prefers-reduced-motion: reduce)` guard.

---

## 2 · TOKENS (S11)

Ports to `web/src/lib/styles/tokens/*` → `app.css` (roadmap S11). Same custom-property names as
today so consumers read `var(--…)` unchanged. `var()` is illegal in a media query and there are **no
breakpoint tokens and no motion tokens** — do not invent them.

### 2.1 Families that carry over as-is

| Family | Tokens | Source | Note |
|---|---|---|---|
| Surface/brand | `--color-dark` `#394548`, `--color-text` (auto-reversing), `--color-muted`, `--color-white`, `--color-black` | `tokens/colors.css` | `--color-text` reverses for dark; use it for body/heading text. `--color-dark` is a **fixed** slate surface. |
| Grays | `--gray-0 … --gray-160` | `colors.css` | `--gray-50` `#E0E0E0` is the house control-border gray. |
| Semantic status | `--color-success` `#16a34a`, `--color-danger` `#dc2626`, `--color-warn` `#d97706` | `colors.css` | The only non-slate color allowed in the admin, because it *means* something. |
| Category tints | `--cat-{servicio,estudio,oracion,evangelizacion,especial,otro}` + each `-t` text variant | `colors.css` | AA-tuned bg/text pairs. **The single source of truth for event-category color** — see 2.6. |
| Radius | `--radius-xs 4px · sm 6px · md 10px · lg 16px · xl 24px · full 9999px` | `tokens/radius.css` | Cards/controls = `--radius-md` (10px). Modals = `--radius-lg` (16px). Pills = `--radius-full`. |
| Spacing | `--pd-*` (padding), `--mg-*` (margin), `--gap-*` (gap) | `tokens/spacing.css` | **Fluid** (`calc()`/`clamp()`+`vw`). Reach for a token before a breakpoint. |
| Z-index | `--z-menu 10 · --z-overlay 50 · --z-modal 100 · --z-max 999 · --z-fullscreen 9000 · --z-action-backdrop 9990 · --z-action-sheet 9991 · --z-lightbox 10000` | `tokens/z-index.css` | Preserve the numeric stacking exactly — components depend on the order. |

### 2.2 The admin slate override — reproduce it, scoped to admin routes

`css/pages/admin/palette.css` overrides four tokens so gold/teal never appear as an admin accent. The
SvelteKit port must reproduce these **scoped to the `(admin)` route group** (they must not reach the
public site):

| Token | Public value | **Admin value** | Was |
|---|---|---|---|
| `--color-secondary` | `#9a6a2c` (brand gold) | **`#475569`** (slate-600) | brand gold |
| `--color-accent` | `#be660e` (vivid orange) | **`#475569`** (slate-600) | vivid orange |
| `--gold-bright` | `#c89858` | **`#64748b`** (slate-500) | bright gold — **decorative only, fails text contrast** |
| `--color-info` | `#2d4e57` (teal) | **`#334155`** (slate-700) | teal |

> **Do not reintroduce gold, amber, orange, or teal as the admin's accent.** The residual amber that
> must die: the topbar brand dot's `box-shadow: rgba(200,152,88,.6)` (`shell.css:57-65`) is the last
> gold accent in a slate panel — drop it. The dashboard `.dash-card` amber hover-wipe
> (`::before` uses `--color-secondary` and an amber icon-tile) is the same violation — reconcile to slate.

### 2.3 What the legacy got wrong — must NOT be ported

| Defect | Where | Rule for the port |
|---|---|---|
| **`--color-primary` does not exist** | referenced in stale docs | Use `--color-dark`. It was intentionally removed. Do not re-add it. |
| **Non-monotonic type scale** | `tokens/typography.css` | `--fs-2xl` max is `2rem`, which is **smaller than** `--fs-xl`'s max `2.1875rem`; `--fs-lg` and `--fs-2xl` share the same `2rem` max. **Re-tune the clamps to be monotonic — do not port the scale as-is.** |
| **Two competing type scales** | `--fs-*` (fluid, `typography.css`) vs `--size-*` (static rem, `tokens/sizes.css`) | Pick **`--fs-*`** as the admin scale and add the missing **mid-range step** the aesthetic contract demands (labels are ~`0.7rem`, KPI numbers ~`1.85rem`/800 — nothing between). `.ird-btn` currently uses `--size-base` while `--fs-btn` exists — reconcile to `--fs-btn`. |
| **Duplicate shadow tokens** | `--btn-shadow`/`--container-shadow`/`--image-shadow` defined in **both** `tokens/colors.css` **and** `tokens/shadows.css` | Consolidate to **one** definition. `shadows.css` is effectively dead in forced-dark (its `@media` block never fires under `data-theme`). Define shadows in **one** token file. |
| **`font-size` in px / raw rem** | scattered | Never. Always `var(--fs-*)`. |
| **Hard-coded money hexes** | see 2.4 | Replace with semantic money tokens. |
| **Category hex map in JS** | `state.js:79-86` `CAT_COLORS`, consumed as inline `style="background:${color}"` | Delete — see 2.6. No admin JS ships a category hex literal. |

### 2.4 NEW — semantic money tokens (feeds S08 `money.ts`, consumed by S53/S56)

Treasury hard-codes money colors as hexes across files (`#1e6b61`/`#1c7a52` two different greens,
`#b02030` red, `#a05a10` amber) and uses `!important` on `.pos`/`.neg`. Replace with a semantic set
in `tokens/colors.css` (so they reverse correctly in dark via the token override, never a
component-level media query). **The two greens collapse to one.**

```css
/* Money semantics — AA-contrast-tuned, reverse in the [data-theme="dark"] block.
   The ONE place non-slate color is intentional in the admin: +/- is meaning, not decoration. */
--money-pos:      /* one green — collapses legacy #1e6b61 + #1c7a52 */ ;
--money-pos-bg:   /* faint tint for a "paid"/positive pill */ ;
--money-neg:      /* one red  — was #b02030 */ ;
--money-neg-bg:   /* faint tint for a negative/overdue pill */ ;
--money-warn:     /* one amber — was #a05a10, for pending/due-soon */ ;
--money-warn-bg:  /* faint tint */ ;
```

Money cells right-align with `font-variant-numeric: tabular-nums`. `.pos`/`.neg` semantic classes
consume `var(--money-*)` with **no `!important`**.

### 2.5 Honest status vocabulary (feeds S53/S54, DataTable, Badge)

The legacy reuses **3 pill variants** (`paid`/`pending`/`owe`) to mean Sí/No, Abierto, and
Restringido — semantics carried by variant reuse. Define an honest status token/variant set that maps
each real state to a distinct, AA-safe appearance:

`paid · pending · open · overdue · active · inactive · restricted · closed · completed · finished`

Two legacy examples the port must fix: `statusBadge` maps 4 event lifecycle states
(open/closed/completed/finished) to only 2 classes so 3 render identical gray; the users role badges
render `admin`/`ministry_leader`/`treasurer` as **byte-identical** slate
(`users.css:108-119`) so "you cannot scan the list and see who the admins are."

### 2.6 Category color — one source of truth

Event-category color is encoded **three ways that drift**: (a) CSS classes `cat--*`/`dot--*`
(`CalendarGrid.js` `CATS`), (b) a JS hex map `CAT_COLORS` (`state.js:79-86`) used as inline
`style="background:${color}"`, (c) the `--cat-*`/`--cat-*-t` tokens. **S11 establishes the tokens as
the ONE source; the JS hex map and inline background styles are deleted.** Testable: no admin JS
ships a category hex literal.

### 2.7 The one-off green to re-theme (not delete)

The wizard "step done" progress dot is green `#72BB72` (`--color-add`), a color that appears nowhere
else in the slate admin (`wizard.css:56`). It is **live** — `form-wizard.js:66` emits `.done` on
completed steps — so **re-theme it to a slate/neutral "done" token**, do not delete it as dead.

---

## 3 · DARK MODE (S11)

**One mechanism only: a token override keyed on `data-theme` on `<html>`.** The admin forces
`<html data-theme="dark|light">`; every component consumes `var(--color-*)` and reverses for free.
`tokens/colors.css` is the **only** file that mentions `data-theme`.

`theme.ts` (S11) must expose a **settable** store (`light`/`dark`/`system`) plus a **no-FOUC pre-paint
inline script** — the legacy reads `ird.admin.prefs` and sets `data-theme` before first paint to
avoid a palette flash. Reimplement that as the SvelteKit `theme.ts`, not a copied `<script>` tag.

> ⚠️ **~27 `@media (prefers-color-scheme: dark)` blocks exist in legacy component/section/page files.
> They are BUGS, not precedent.** A component-level `prefers-color-scheme` query silently defeats the
> admin's forced-theme override (a user who forced light on a dark-OS device gets dark components).
> **Never add one outside `tokens/colors.css`.** The only legitimate `@media (prefers-color-scheme)`
> is inside the token files (`colors.css`, `shadows.css`), and even there it must opt out of forced
> themes with `:root:not([data-theme="light"]):not([data-theme="dark"])` (as `colors.css` already
> does). Port that pattern; do not port the 27 component-level ones.

`reduce-motion` is honored **globally at the token/base level** (S12), never a bespoke
`body.adm-reduce-motion *{…!important}` block (that legacy plumbing is dead — see §5).

---

## 4 · THE COMPONENT SHEET

Canonical breakpoints (desktop-first, `max-width`) — **reuse these, invent none**:
`768 / 640 / 600 / 480`, plus admin additions `900` (shell nav drawer) and `1100` (DataTable
card-collapse, `docs/admin-ux.md` §2). The account section-nav's stray `860` breakpoint should be
reconciled toward `900`. State matrix legend: **●** required · **—** N/A for this component.

### 4.1 Primitives

---

#### Icon — S13

**Retires:** `load-icons.js` (sprite injection). **Purpose:** the single icon component. Font Awesome
6.5 is already loaded — **do not add a second icon set**. Also renders the trusted static SVG sprite.

| Prop | Type | Notes |
|---|---|---|
| `set` | `'fas' \| 'far' \| 'sprite'` | which glyph source |
| `name` | string | FA name or sprite id |
| `label` | string? | **present → `aria-label`** (meaningful icon); **absent → `aria-hidden="true"`** (decorative) |

**a11y:** every icon-only control in the shell (burger, bell, logout, kebab) passes an accessible name
via the hosting control (see IconButton) — Icon itself toggles `aria-label` vs `aria-hidden`.
**Do-not-port:** rendering an untrusted string through the sprite; peer/DB values as icon names.

---

#### Button — S14

**Retires:** the ad-hoc inline busy() spinner swaps in `auth.js`, `form-wizard.js`, `event-form.js`,
gallery save. **Purpose:** the one button. Keep the `.ird-btn` class names for coexistence during the
port (roadmap S14). Legacy baseline: `.btn` `padding .65rem 1.25rem`, `--radius-md`, `font-weight
600`, transition on `filter/transform/box-shadow/border-color/color`.

**Variants:** `primary` (`--color-dark`) · `secondary` (`--color-secondary` = slate via palette) ·
`danger` (`--color-danger`) · `ghost` (white, `1px --gray-50` border). **Sizes:** `default` · `sm` ·
`full` (100% width). Optional leading `icon`. `href` → renders `<a>`, else `<button>`.

| State | Req | Appearance |
|---|---|---|
| default | ● | solid variants carry `0 1px 2px rgba(0,0,0,.12)`; ghost is bordered |
| hover | ● | solid: `filter: brightness(1.08)` + raised shadow `0 3px 9px rgba(0,0,0,.16)`; ghost: `border-color`→`--color-dark`, text→`--color-dark` |
| focus-visible | ● | visible ring (**not** `outline:none` alone) |
| active | ● | `transform: scale(0.97)` |
| disabled | ● | `opacity: .5`, `cursor: not-allowed` — **load-bearing** (e.g. "Agregar ingreso" disabled until income categories exist) |
| loading | ● | spinner replaces label, button disabled + `aria-busy="true"`, **width preserved** (no layout shift). Owned by the component via a `loading` prop — no screen hand-rolls `btn.innerHTML='<i fa-spinner fa-spin> Guardando…'` |
| empty/error | — | |

**a11y:** icon-only usage is IconButton, not Button. **Responsive:** `full` for stacked mobile action
bars. **Do-not-port:** hand-rolled loading spinners; `window.__*` + inline `onclick=` wiring.

---

#### IconButton — S14

**Retires:** the **two** near-identical legacy names `.icon-btn__admin` **and** `.adm-icon-btn` →
**one** component. **Purpose:** the 32–34px square icon control (row kebabs, PDF-download, close, eye,
lock, top-bar chrome). Baseline: `32px`, `--radius-sm`, `1.5px --gray-50` border, muted icon,
hover→`--color-dark`.

**Variants:** `default` · `warn` · `success` · `danger` (each tints the **hover** border+icon).
**States:** default / hover / focus-visible (**add — legacy has none on `.dz-ic`, `.dz-tool`,
`.dz-mini`, `.dz-layer__btn`**) / active / disabled. A **pressed/toggle** mode via `aria-pressed` for
persistent on/off controls (tool-rail `is-active`, text-style `bold/italic/underline`, layer
eye/lock).

**a11y — hard requirement:** an icon-only button **MUST** take an accessible name (`aria-label`). The
legacy top-bar `.dz-ic` and card `.dz-mini` set only `title=`, invisible to screen readers and on
touch — **fix on port.** **Do-not-port:** `title=`-only controls; hover-only reveal of the control
itself.

---

#### Badge — S14

**Retires:** `.role--*`, `.dscp-card__status--*`, `.dscp-int__status--*`, `.dscp-int__chip--*`,
`statusBadge`, `cat-badge`, the always-green "Activa" literal. **Purpose:** one data-driven pill.
Baseline: `.role-badge`/`.cat-badge` — `font-weight 700`, `2px 8-9px`, `--radius-full`, uppercase,
`letter-spacing .04em`.

**Variants:** `neutral · info · success · warn · danger` + `tinted` (bg+fg derived from an arbitrary
per-object hex — preset/ministry color — via a CSS custom property like `--tint`, with an
**automatically AA-safe** text color) + role variant (`admin/treasurer/ministry_leader/pastor`) +
status variant (the honest vocabulary, 2.5). **Non-interactive** (default state only) but every
variant must be **visually distinct** and pair **icon + text**, never color alone.

**Testable anti-patterns to prohibit:** no badge label/color is a **literal in the template
independent of data** (kills the hard-coded always-green "Activa" badge rendered twice in the account
page); `admin`/`ministry_leader`/`treasurer` must **not** render identically. **Do-not-port:** the
per-object color reaching a `style` attribute **unescaped/unvalidated**.

---

#### Avatar — S13/S14

**Retires:** `paintAvatar`, `.adm-avatar`. **Purpose:** photo (`background-image: cover`) **or**
2-letter initials on a colored disc, with **one** initials algorithm shared across the sidebar footer,
account hero, account profile, users list, and (new) the Actividad actor. **Sizes:** `36 / 38 / 78px`.
`pending` variant (paper-plane glyph, for invited-not-joined). **a11y:** `alt`/`aria` handling.
Uploader behaviour (image-only, ≤5MB, square, upload-progress-on-button, remove) is account-specific
→ AvatarUploader in S45, not this primitive.

---

#### Card — S14

**Retires:** `.dash-card` (the outlier), `.acct-card`, `.se-evcard` (borrowed cross-feature),
`.dscp-card`, `.trez-card`, project cards, gallery album cards, `.dz-card`. **Purpose:** one card with
**one** radius (`--radius-md` 10px) and **one** shadow token as the system default.

**Variants:** `static` (non-interactive container) · `interactive` (renders as `<button>`/`<a>`,
focus-visible ring, hover uses the **slate** accent — never amber). **KPI tile** sub-variant: icon +
big number + label; needs the mid-range type step (2.3) between the `~0.7rem` label and the
`~1.85rem/800` number; must **expose its scope honestly** (Resumen mixes month-scoped tiles with an
all-time "Por pagar" tile that looks identical).

| State | Req | Note |
|---|---|---|
| default / hover / focus-visible / active | ● (interactive only) | hover = slate accent, static = no hover |
| disabled / loading | — | loading is the **skeleton** (§5) |

**The false-affordance rule (hard):** a card that **looks** clickable **must do the primary thing on
click.** Today the upcoming `.se-evcard` is styled clickable but clicking it just re-fires the hidden
kebab (`events-tab.js wireEventCards`), and the dashboard `.dash-next` rows have hover wash + hairlines
but **no** click handler. **Pick one:** whole-card → primary action (with a distinct control for the
menu) **or** a static card. Never reproduce the fake affordance. Design-library cards are
`role="button" tabindex="0"` but have **only** a click listener (`index.js:104/85`) — Enter/Space do
nothing; render a real `<button>`/`<a>` or wire `keydown`.

**Do-not-port:** `.dash-card`'s 16px radius, amber `::before` hover-wipe, amber icon-tile, and 3px
lift; the `autoBalance()`/`grid-balance.js` JS resize hack that mutates `grid-column` to fill a short
last row (**use a pure-CSS grid** — `repeat(auto-fit, minmax(180px,1fr))` or a fixed column count;
no component may set `element.style.gridColumn` at runtime).

### 4.2 Overlays

---

#### Modal — S16

**Retires the THREE legacy modal systems:** `.modal-backdrop`/`.modal` (standard), `.dz-modal`
(designer), `.wizard-backdrop`/`.wizard`. **Baseline (`modal.css`):** centered; `max-width 500px`;
`--radius-lg`; backdrop `rgba(0,0,0,.4)` + `blur(3px)` at `--z-modal`; `padding 1.75rem`; header
flex space-between with a round `.modal__close` (30px); footer flex `gap .75rem` right-aligned with a
top border. Open transition: `transform: translateY(16px) scale(.97)` → settled, `0.22s` on the house
easing.

**Variants:** `standard` (~500px, default) · `wide` (~760px — tables & designer tools, replacing
`.dz-modal--wide`'s 6px-radius/black-CTA look) · `confirm` (~360px, see ConfirmDialog) · `tool`
(designer property/layer docks). Additional max-widths in live use: `360/420/480/520px`.

**Props/API:** `bind:open`; header/body(scrollable)/footer slots; a footer **spacer** utility (legacy
uses a raw `<span style="flex:1">`) and a **danger** action slot; an error region that is
`role="alert"`.

| Behaviour (testable) | Req |
|---|---|
| Escape closes | ● (legacy `.dz-modal`/wizard **lack** this) |
| backdrop click closes | ● |
| **reference-counted** scroll-lock: save & **restore** the prior `document.body.style.overflow` on close | ● (legacy hard-clears to `''`, so a confirm-over-modal close unlocks the page while the outer modal is still open) |
| focus moves **into** the dialog on open, **returns to the trigger** on close, **focus trap** while open | ● (legacy does **NONE** of these) |
| `role="dialog"` `aria-modal="true"`, close button `aria-label="Cerrar"` | ● |
| a `confirm` modal stacks **above** a base modal | ● (`#confirmModal` = `calc(var(--z-modal)+10)` — preserve) |
| each instance owns local state — **no global element IDs** | ● (legacy has **two** modals sharing `id="presetModal"`; `getElementById` returns the first, so the second is unreachable and its Save button carries two handlers — the port must make this impossible) |
| toggle `body.has-floating-popup` (fades the WhatsApp FAB / mobile bar) on open, un-toggle on close | ● (day-sheet path) |

**Token-only color; no `@media prefers-color-scheme` (data-theme drives dark).** **Responsive:**
full-bleed-ish under `480` (`border-radius 12px`, `max-width 100%`). **Do-not-port:** `.dz-modal`;
shared global IDs; hard-clearing `overflow`.

---

#### ConfirmDialog — S16

**Retires:** `ui.js` `confirm`. **Purpose:** a **promise-returning singleton** + `<ConfirmHost>`,
callable from **non-component code** (used by `notifications.clearAll` and **every** destructive
action across treasury, discipleship, events, gallery, ministries, users, presets, designer).

**API:** `await confirm(title, message)` → `boolean`. `title`/`message` set as **text** (never
`{@html}`). Optional `{ danger }` variant so a non-destructive confirm doesn't render a red primary.

| Behaviour | Req |
|---|---|
| Yes → `true`; No / × / Escape / backdrop → `false` | ● |
| default focus lands on the **safer (cancel)** button on open | ● |
| danger-styled confirm button when `danger` | ● (default per legacy markup: "Sí, continuar") |
| stacks **above** any open Modal, with its own scroll-lock/focus-trap that **restores to the modal beneath** on close | ● (e.g. deleteRegistration confirms while the registrant modal is still open) |
| default / hover / focus-visible on both buttons | ● |

**Consumers must keep an explicit confirm:** logout, 2FA-reconfigure, unsaved-profile guard, and
**every** treasury/discipleship/events/gallery delete. **New required consumer (port debt, not a
legacy patch):** the Settings "Modo mantenimiento" toggle should confirm before taking the public
site down.

---

#### ActionSheet — S17

**Retires FOUR menu implementations:** the shared `showActionSheet` (`js/components/action-sheet.js`)
**plus** three bespoke ones — `.se-menu__pop` (registrations Opciones), `.dscp-member-pop`
(discipleship member popover), `.dz-pop` (designer align/order/export). **Port the
`action-sheet.js` contract exactly.**

**API:**
```
showActionSheet({
  trigger,                 // the element it anchors to / returns focus to
  title?, subtitle?,       // optional header
  actions: [{ label, icon, variant: 'default'|'warn'|'danger', onClick,
              disabled?, group? }],   // group + a section label + divider (see below)
  cancelLabel = 'Cancelar'
})
```

| Behaviour | Req |
|---|---|
| **Desktop:** anchored popover — measure, then **flip up** when it would overflow the viewport bottom; clamp **12px** inside both horizontal gutters; **reposition on scroll + resize** | ● |
| **Mobile ≤640px:** bottom sheet sliding from `translateY(110%)`, with an explicit **Cancelar** row | ● |
| `role="menu"` on the sheet, `role="menuitem"` on rows; roving tabindex + Up/Down/Home/End | ● |
| Escape closes; backdrop click closes; **only one open at a time** (`closeActionSheet` before opening) | ● |
| **focus moves into the sheet on open, returns to the trigger on close** | ● (legacy does neither) |
| **grouped** items: section label + divider + an empty-section fallback | ● (member menu = "Mover a otro grupo" listing every other group, divider, then a danger "Remover") |
| contextual **extra** actions injected per row (e.g. "Marcar pagado" only when status=open) | ● |
| actions run on a short **defer** so the close animation can start | ● |
| reduced-motion guard on the slide/scale transitions | ● |

**Row color:** the legacy default row is **iOS blue `#0a84ff`** — the new component uses the **slate
admin tokens** (`--color-dark` for default; keep `warn`/`danger`). **z-index:** backdrop
`--z-action-backdrop` (9990), panel `--z-action-sheet` (9991). **This primitive is what replaces the
`kebab-is-delete` bug** (project-treasury movements kebab wired straight to delete) — **all** row
kebabs route through it, with `Editar` + `Eliminar` where an edit path is needed.

---

#### Toast — S15

**Retires BOTH legacy toast systems:** admin `toast(msg, type)` (`ui.js`) **and** public
`showToast`. **Baseline (`buttons.css`):** `#toast` fixed bottom-right, `gap .5rem`, `--z-max`;
`.toast-item` `padding .75rem 1.1rem`, `--radius-md`, `font-weight 600`, white text, `slideIn 0.25s`.

**Variants:** `success` (`--color-success`) · `error` (`--color-danger`) · `info` (`--color-dark`) ·
**`undo`** (NEW, S15 — an action button, for destructive actions that today have only a confirm and
no undo). **API:** `toast` store + `<ToastHost>`; auto-dismiss ~4s + manual close; `undo` carries
`{ label, onAction }`.

| Contract | Req |
|---|---|
| message rendered as **TEXT, not HTML** (legacy builds with `textContent`+DOM append so error strings/emails can't inject markup — **never `{@html}` a toast body**, D-005) | ● |
| `role="alert"` for `error`; `role="status"` / `aria-live="polite"` otherwise (legacy sets role per type — preserve) | ● |
| `slideIn` keyframe guarded by `prefers-reduced-motion` | ● |
| bottom-right stack; multiple stack | ● |

**Callable from module (non-component) code** (S38). **Do-not-port:** `alert()` for errors (the
report-builder export uses a raw `alert()` — route through Toast); rendering a raw Postgres string as
a toast body.

---

#### Lightbox — S20

**Retires:** the id-coupled gallery overlay markup. **Purpose:** full-screen photo viewer + store,
`openLightbox(photos, i)`. Keys / swipe / fullscreen / share / download. `--z-lightbox` (10000, topmost).
Scroll-lock + restore (same reference-counted rule as Modal). **a11y:** `role="dialog"`, Escape close,
focus trap, arrow-key nav; reduced-motion guard on transitions. **Do-not-port:** id-coupled DOM;
hover-only controls.

### 4.3 Forms

The port collapses **FOUR form vocabularies** (`.form-group`/`.form-row` standard · `.wiz-field` ·
`.rb-*` report-builder · `.settings-field`) plus the dead `.trez-field` into **ONE**. Baseline =
`.form-group`: uppercase micro-label (`~0.8rem`, weight 600, muted), `1.5px --gray-50` control border,
`--radius-md` control, focus → `border --color-dark` + 3px focus ring.

**FormField base (all controls):** label + control + hint + **inline error slot**. Effective font-size
**≥16px on mobile** (iOS no-zoom). Visible focus ring. Distinct **disabled** vs **read-only** styling.
`invalid` → `aria-invalid` + `aria-describedby` → the error. Dirty-state exposed so a form can guard
navigation. **Every** control ships a designed default / hover / focus-visible / disabled / **error**
state. **`.form-row` is a 2-col grid collapsing to 1-col at ≤640px.**

> **Eliminate inline `style="…"` strings from generated markup** (pervasive: age-group rows, grouped
> header dividers, checkbox labels, wizard badges, action bars, the reginfo footer's
> `<span style="flex:1">`). Inline styles fight token theming — replace with classes/`--custom-props`.

**The field-type contract (one union, driven by FormWizard and DataTable editors):**

| Field type | Session | Spec highlights |
|---|---|---|
| `text` / `textarea` | S21 | base FormField; textarea auto-grows, no cursor jump |
| `select` | S21 | native `<select>`, ≥16px, styled chevron |
| `number` | S21 | `inputmode=numeric` |
| `money` | S21 | `$`-prefixed, `min 0`, `step 0.01`, `inputmode=decimal`, ≥16px, right-aligned tabular-nums. **Escape `value` consistently** — legacy `form-wizard.js:89` interpolates `value="${v ?? ''}"` without `esc()` (non-exploitable today, numeric-only; still fix) |
| `date` | S21 | keep dates as `YYYY-MM-DD` strings (G-002); native picker |
| `color` (**ColorInput**) | S11/S14 | `<input type=color>` wrapper; the stored hex becomes a **validated/escaped** `--tint` custom-prop that Badge/Card/icon-tile consume as an AA-safe fill+text pair. **Never** the raw hex into a `style` attribute unescaped |
| `checkbox` / `radio` | S21 | real inputs; label association; ≥44px hit target |
| `toggle` (**Switch**) | S12/S21 | iOS-style switch backed by a real checkbox; variants `default` + `danger` (red track when on, `settings-flag--danger`); a **`consequential`** mode requiring confirmation before commit; states default/checked/focus-visible/disabled/saving; ≥44px target |
| `multi-select` (**MultiSelect**) | S21 | button + checkbox popover; label summarises ("Sin ministerio" / single name / "N ministerios"); `aria-haspopup`/`aria-expanded`/`aria-controls`; **opens upward when it would overflow the containing modal**; outside-click + keyboard |
| `file` / `dropzone` | S21 | drag + click; **per-file + overall progress** with cancel (legacy gallery upload is text-only, sequential, no bar, no cancel); image-only/≤5MB validation surfaced inline; **always-visible controls (no hover-only)** |
| `rich-text` (**RichTextEditor**) | S18 | see below |
| `icon-picker` (**IconPicker**) | S21 | scrolling grid of the curated FA set (~42 icons); single-select `is-selected`; **keyboard-navigable** (arrows + Enter); each option an accessible name |
| `segmented` (**SegmentedControl**) | S21 | see below |
| `password` (**PasswordField**) | S21/S39 | see below |
| `code` (**CodeInput/OTP**) | S39 | see below |
| `readonly` (**ReadonlyField**) | S45 | see below |

---

#### RichTextEditor — S18

Mountable editor exposing `mount / getHtml / setHtml / placeholder`, reusing `sanitize-html.ts`.
**Sanitize on BOTH save and render** (`htmlIsEmpty` guard) — the registrations form mounts two
(Descripción, Información) whose output is stored and re-rendered on the public event page, so both
directions go through the allowlist (D-005). No cursor jump on input. `{@html}` is forbidden unless
the value is `sanitizeHtml()`/`renderRichText()` output (CI lint rule, S18).

---

#### SegmentedControl / SectionNav — S21

**Purpose:** single-select button group where exactly one is `on`. **Two consumers:** (1) the report
builder's Período control (2×2 wrapped grid Semana/Mes/Trimestre/Año + a nested T1–T4 quarter
control) — spec it here so the report rail stops being a **third** independent form vocabulary; (2)
**SectionNav** — a vertical item list on desktop that collapses to a **horizontally-scrollable pill
bar** below the breakpoint **without the page scrolling horizontally** (the bar scrolls, not the
body), used by the account sections and the Usuarios sub-tabs. **a11y:** roving focus + arrow-key nav,
active state, ≥16px hit target, accessible names retained when icons hide, focus-visible ring.

---

#### PasswordField — S21/S39

**Variants:** with/without **show-hide toggle**, with/without **strength meter**. The show/hide is a
real `<button>` (`aria-pressed`, toggles `type=password/text`, accessible name) — **never hover-only.**
On new-password flows (invite/reset, change-password) a strength indicator (weak/ok/strong) and a live
mismatch check between the two fields. Legacy has **neither** a toggle nor a meter on any password
field including invite/reset where it matters most.

---

#### CodeInput (OTP) — S39

6-digit one-time-code input: `inputmode=numeric`, `autocomplete=one-time-code`, digits-only filtering,
**segmented** visual treatment (legacy is a single text box with letter-spacing). States
default/focus/filled/error/disabled; **pasting a full 6-digit code distributes across segments**;
error clears on edit.

---

#### ReadonlyField — S45

A first-class **"this is your data but an admin owns it"** pattern: label + **static, non-focusable**
value (+ optional lock note, e.g. "El correo lo gestiona un administrador."), **visually distinct from
an editable control.** The account page renders five immutable facts (Usuario, Correo, Departamento,
Zona horaria, Idioma) as `<input disabled>` — a wall of greyed boxes that reads as broken. The library
offers this so the port **stops using disabled inputs for immutable data.**

---

#### Alert / Callout (inline) — S15

An **in-flow** (not transient) message box, distinct from Toast. **Variants:** `error` (`role=alert`)
· `success`/`info` (`role=status`) · `warn`. Icon + message rendered as **text** (never `innerHTML`).
Replaces `.auth-error`/`.auth-ok`/`.acct-error`. The `error` variant accepts **human copy, not a raw
backend string.**

---

#### SignaturePad — S19

Wraps the ported canvas controller. Draws hi-DPI; `toDataURL()` returns a trimmed PNG; exposes
`clear / loadDataURL / isEmpty`. Consumed by the account/waiver flows. Preserve the size-cap on the
signature payload (SEC-09 rides along in S33). **Do-not-port:** any redesign of the drawing math
(D-009 — preserve, don't redesign).

### 4.4 Composites

---

#### Disclosure — S21

**Retires:** `.se-collapse`/`wireCollapse()` and every per-namespace collapse. **Purpose:** the one
expand/collapse. `docs/admin-ux.md` §1 mandates secondary controls (QR/share, Filtros, bulk/config)
start **collapsed** behind a labeled toggle.

**API/behaviour:** trigger is a real `<button>` with `aria-expanded` + `aria-controls`, panel uses the
`hidden` attribute; Enter/Space operate it; height/opacity transition **guarded by
`prefers-reduced-motion`**; chevron rotation. States collapsed/expanded/disabled. **Must expose
`refresh()`** so content can be updated programmatically **without re-toggling** (kills the
discipleship `reopenMembers()`-calls-`openMembersInline()`-**twice** hack). **The active state must be
visible when COLLAPSED** — the filter panel today only hints via a count badge; surface applied
filters without requiring expansion. **Do-not-port:** default-collapsed-and-styled-as-a-filter for a
panel that is the **primary** control of the screen (report-builder "Secciones").

---

#### DataTable — S21

**Purpose:** the financial/registration tables (Ingresos, Gastos, Recurrentes, Por pagar, movements,
registrant list). **Hard requirement:** **card-collapse below `1100px`** (`docs/admin-ux.md` §2) —
`display:block` the parts, hide `thead`, render each cell as `label : value` via `td[data-label]` +
`td::before{content:attr(data-label)}`. **No horizontal scroll at 360px** (the legacy `overflow-x:auto`
strip is explicitly rejected). Give the table **its own class** — don't reuse another table's
nth-child card rules.

| Feature | Req |
|---|---|
| numeric/money columns **right-aligned**, `tabular-nums`; header cell right-align flag | ● |
| money cells semantic +/- via `--money-*` tokens (2.4), never hardcoded hex, no `!important` | ● |
| per-row **status pill** slot (honest vocabulary, 2.5) | ● |
| **system-generated row** treatment (icon/badge) for auto-inserted rows (recurring, mirrored payables) — treasurer view has none today; the leader view marks with a lock | ● |
| **overdue** row emphasis (Por pagar) | ● |
| sortable columns where sort state **actually drives render order** (legacy tracked `sortKey`/`sortDir` that nothing reads); sort control has default/hover/focus-visible + asc/desc/active indicator | ● |
| built-in **loading / empty / error** row states (see §5) | ● |
| search / filter / paging slots (a 200-child VBS or multi-year ministry list is unusable without them) | ● |

**Do-not-port:** `overflow-x:auto` as the mobile strategy; the dead sortable-table CSS surface
(`.se-reg-table`, `.se-th-sort`, `.se-sort`, `.se-filter-bar`, `.se-switch`, `.se-detail__meta`); the
orphaned `sortKey`/`sortDir` state; a screen hand-rolling its own sortable table on top of this.

---

#### FormWizard — S21

**Retires** the **three** hand-rolled wizards (event, discipleship, gallery) — one config-driven
engine, the ported `form-wizard.js`. **Config:**
```
{ title, icon, submitLabel, data,
  steps: [{ label, hint, fields: [<field-type union, 4.3>] }],
  onSubmit(data) -> { error } | ok,
  onDone }
```
Field types include `choice` (big tappable cards, `options:[{value,label,desc,icon}]`) and everything
in the 4.3 union.

| Behaviour | Req |
|---|---|
| **progress indicator ADAPTS to step count** — `total = steps.length + 1` (review). **Never a hard-coded 4-dot strip** (legacy hard-codes 4-dot strips in `admin/index.html:1446-1502`) | ● |
| per-field **required** validation + per-field **`showIf(data)`** re-evaluated **every render** (recurring "ministry vs person", report "month vs year" depend on it) | ● |
| per-step validation with **focus-to-first-invalid** + inline error region (not a toast) | ● |
| **ONE** auto-generated review step with a **single** review renderer listing only `showIf`-visible fields, type-aware (money→USD, choice/select→option label, date→localized). **Legacy has three divergent review renderers** | ● |
| submit shows the spinner + "Guardando…", disables; on `{error}` **re-enables and shows the error inline** (does **not** close) | ● |
| Escape closes; backdrop-click closes; **reference-counted** body scroll-lock + restore | ● |
| card-picker `choice` step is **keyboard-operable** (legacy level cards are click-only non-focusable `<div>`s) | ● |
| nav (Back/Next/Cancel) wired via **listeners/component events** | ● |

**Re-theme** the `.done` progress dot from `#72BB72` to a slate/neutral token (2.7). **Do-not-port:**
`window.__wizBack`/`__dwizBack`/`__gwizBack` globals + inline `onclick=` (CLAUDE.md §10); the
4-dot strips; the three review renderers; `window.__dscpPendingPicks` global stash (pass selection
through wizard state).

---

## 5 · THE STATE SYSTEM (S12)

**The highest-value item in this file.** Today: **every** loading state in the app is the identical
hard-coded string; there are **no skeletons anywhere**; **every** error state prints the **raw
Postgres message** to a church volunteer; and **there is no retry affordance anywhere in the panel.**
CLAUDE.md §5 already mandates all three states on every async view — this section makes them real and
uniform so ports don't re-diverge. **Library-owned components — no screen hand-rolls these.** This is
a **hard acceptance criterion for every S41–S63 session.**

The legacy strings to replace (match no longer — these are what you are retiring):
```
loading  <div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
empty    <div class="empty-state"><i class="fas fa-…"></i><p>No hay …</p></div>
error    <div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${e.message}</p></div>  ← RAW BACKEND STRING
```

### 5.1 Loading — skeletons per component shape

**Not** one spinner string reused everywhere (lists jump on load). A skeleton matched to the shape it
replaces, so layout is stable before data lands:

| Shape | Skeleton |
|---|---|
| `card-grid` | N placeholder cards at the real card dimensions (dashboard KPIs, gallery library, presets, ministries) |
| `table` | header + M shimmer rows at row height (treasury tables, registrant list) |
| `list` | stacked shimmer rows (notifications, activity, discipleship groups/interests) |
| `detail` | title bar + field-row placeholders (registrant detail, account) |

Shimmer animation **guarded by `prefers-reduced-motion: reduce`** (static placeholder when reduced).
Specific gaps to close: the **calendar month grid** has no loading state (it pops in — add a grid
skeleton); the **notifications panel** is blank until first fetch (render a list skeleton into the
panel before the first fetch resolves).

### 5.2 Empty — calm, with a primary-action slot

Icon + **one** line of human Spanish copy, in a calm box. **A primary-action slot where one exists**
(e.g. "Crear", "Nuevo diseño", "Nuevo álbum") so the empty state is a starting point, not a dead end.
Unify the one-offs: the treasury Config empty is a bare inline-styled `<p class="muted">`; the designer
library empty is a one-liner — both fold into this component.

### 5.3 Error — human copy + a RETRY button, never a raw backend string

**This is the marquee fix.** Every error state:

- renders **human Spanish copy** (e.g. "No pudimos cargar los datos. Revisa tu conexión."), **never**
  `error.message` / a raw Postgres string;
- exposes a **Retry** button (re-runs the failed fetch) — there is **no retry anywhere** in the panel
  today;
- is **visually distinct from empty** (warning-triangle icon, error tone) — several legacy views
  collapse a *failed* fetch into the neutral empty state (gallery `fetchAlbums` returns `[]` on error →
  "Aún no hay álbumes"; ministries swallows the error → "No hay ministerios todavía"), so a failure is
  indistinguishable from "nothing here." Distinguish them.

**Testable contract:** the Error component **cannot** render an untrusted string as its primary copy,
and **always** exposes a retry. Force a query error → error state with retry renders (not empty). Slow
query → skeleton (not blank).

### 5.4 Component names & emitted markup

Specify exact class names and emitted markup in S12 so ports don't re-diverge, e.g.
`<StateLoading shape="table" rows={6} />`, `<StateEmpty icon message action />`,
`<StateError message onRetry />`. Every async view in S41–S63 consumes these three — hand-rolled
state strings fail the acceptance checklist.

### 5.5 A worked example (notifications bell, S43 — all FIVE states)

The bell panel must design **loading / empty / error / unread / read**. Legacy has empty (bell-slash)
but **no loading** (blank until first fetch) and **no error** (a failed fetch early-returns leaving
the list blank/stale; a failed **badge count** query resolves to `0` and **hides the badge**, so the
user believes there are no unread items). Port: list skeleton before first fetch; error state with
human copy + retry; and **distinguish a failed count from zero** (don't hide the badge on error).

---

## 6 · ACCEPTANCE CHECKLIST

Copy the relevant block into your session PR. A component/session is **not done** until every
applicable box is green. This composes with — does not replace — [`VERIFICATION.md`](VERIFICATION.md).

### 6.1 Every S11–S21 component

```
[ ] Token-only: no hardcoded hex, no px/raw-rem font-size, no literal radius/shadow
[ ] Dark mode via data-theme token override ONLY — zero @media(prefers-color-scheme:dark) in the component
[ ] Slate accent — no gold/amber/orange/teal reintroduced (semantic success/danger/warn/money only)
[ ] House easing cubic-bezier(0.22,1,0.36,1); every animation has a prefers-reduced-motion:reduce guard
[ ] Full state matrix implemented: default / hover / focus-visible / active / disabled (+ loading where async)
[ ] Visible focus-visible ring on every interactive element (never outline:none alone)
[ ] Every icon-only control has an accessible name (aria-label); no hover-only affordance
[ ] Inputs compute ≥16px effective font-size on mobile; no horizontal scroll at 360px
[ ] No inline style="…" strings in emitted markup (use classes / --custom-props)
[ ] No window.__* globals, no inline onclick= (event listeners / component events only)
[ ] Reuses canonical breakpoints (768/640/600/480, +900 drawer / +1100 table) — no invented ones
[ ] Retires its named legacy system(s); the four/three duplicate impls collapse to this one
[ ] Golden/parity check where it ports a legacy behaviour (VERIFICATION §5)
```

### 6.2 Overlays (Modal / ConfirmDialog / ActionSheet / Toast / Lightbox)

```
[ ] Escape closes AND backdrop-click closes
[ ] Reference-counted scroll-lock: saves & restores prior body overflow (confirm-over-modal safe)
[ ] Focus moves in on open, focus-trapped while open, returns to trigger on close
[ ] role=dialog/aria-modal (Modal/Lightbox) · role=menu+menuitem (ActionSheet) · role=alert/status (Toast/Alert)
[ ] Confirm stacks above an open Modal; ActionSheet uses --z-action-* ; Lightbox --z-lightbox
[ ] Message bodies are TEXT, never {@html} (Toast/Confirm/Alert) — D-005
[ ] Each instance owns local state — no shared global element IDs
[ ] ActionSheet: desktop popover flips up on overflow + repositions on scroll/resize; ≤640px bottom sheet
```

### 6.3 Every async view (mandatory — S41–S63)

```
[ ] Renders a LOADING skeleton matched to its shape (card-grid/table/list/detail) — not the legacy spinner string
[ ] Renders an EMPTY state with a primary-action slot where one exists
[ ] Renders an ERROR state: human Spanish copy + a RETRY button — NEVER a raw backend/Postgres string
[ ] Error is visually distinct from empty (a failed fetch never looks like "nothing here")
[ ] Force-error → error+retry renders (not empty); slow query → skeleton (not blank)
```

### 6.4 Tokens (S11 only)

```
[ ] Admin slate override reproduced, scoped to the (admin) route group (never reaches public)
[ ] Type scale re-tuned monotonic; a real mid-range step exists between labels and KPI numbers
[ ] One shadow-token definition (colors.css/shadows.css duplication removed)
[ ] Semantic --money-* tokens defined (two legacy greens collapsed to one), AA-tuned, dark-reversing
[ ] Category color has ONE source (tokens); no admin JS ships a category hex literal
[ ] theme.ts exposes a settable light/dark/system store + a no-FOUC pre-paint set (no palette flash)
```

---

### Appendix — session → primitive map

| Session | Roadmap row | Primitives specified here |
|---|---|---|
| S11 | Design tokens + theme | §2 Tokens, §3 Dark mode, ColorInput, money/category/status tokens, `theme.ts` |
| S12 | Global CSS baseline + a11y | §5 State system, reduced-motion, ≥16px inputs, Switch/Toggle base |
| S13 | Icon | Icon, Avatar |
| S14 | Button + Card | Button, IconButton, Badge, Avatar, Card (+ KPI tile) |
| S15 | Unified Toast | Toast (incl. `undo`), Alert/Callout |
| S16 | Modal + ConfirmDialog | Modal (standard/wide/confirm/tool), ConfirmDialog |
| S17 | ActionSheet | ActionSheet |
| S18 | RichTextEditor + `{@html}` rule | RichTextEditor |
| S19 | SignaturePad | SignaturePad |
| S20 | Lightbox | Lightbox |
| S21 | Disclosure + DataTable + FormWizard | Disclosure, DataTable, FormWizard, the form field vocabulary, SegmentedControl/SectionNav, MultiSelect, IconPicker, PasswordField, ReadonlyField |
| S39 | Auth flows | CodeInput (OTP) (auth-driven, library-owned) |
| S45 | Account + prefs | ReadonlyField, AvatarUploader (account-specific) |

*Downstream (S37–S63) consumes these; each of those sessions must tick §6.3 for its async views and
route every kebab/menu/modal/confirm/toast/state through the primitive above — no re-implementation.*
