# Port debt — the bugs the rewrite must NOT re-implement

> **A port that faithfully reproduces the legacy's bugs is a FAILED port. Before porting a
> surface, read your session's row here.**
>
> The [`ROADMAP.md`](ROADMAP.md) tells a session *which* screen to port. It never tells it which
> parts of that screen are **broken** and must be dropped on the floor. [`.claude/REDESIGN-ADMIN.md`](../../.claude/REDESIGN-ADMIN.md)
> is the only document that knows — but the migration governs, so the brief is **not** a work order
> against the legacy admin. It is **design & requirements input**. This file is the bridge: the
> brief's diagnosis, verified against the real code, filed per porting session.
>
> Last updated: 2026-07-13 · by: initial-plan · Status: **reference (append-only)**

---

## How this plugs into the protocol

Add one step to the [`README.md`](README.md) **SESSION START protocol**, between "read `CLAUDE.md`
+ the session file" (step 3) and `git status` (step 4):

> **3.5 — Read your session's row in [`PORT-DEBT.md`](PORT-DEBT.md).** Fold its *MUST FIX ON PORT*
> items into your acceptance criteria and its *DO NOT PORT* items into your out-of-scope list. A
> port that reproduces a listed bug does not pass review.

**What "port debt" is and is not:**

- Every item here is **UX / architecture / a11y / correctness debt** the legacy carries. It is fixed
  **in the port**, not in the live legacy code — per [`DUAL-MAINTENANCE.md`](DUAL-MAINTENANCE.md),
  redesigns and nice-to-haves wait for the new site.
- The **one exception** is a single qualifying security fix (unescaped DB values →
  `.innerHTML` in the discipleship interests list, **S51**). It lands in the frozen legacy admin **and**
  is mirrored into its port as a `dual-fix` with a reproducing check. It is called out in the S51 row.
- Several brief claims were **rejected on verification** (over-stated, or actually live code). Those
  corrections are recorded inline so a port doesn't act on a wrong premise. The four biggest:
  `autoBalance()`/`grid-balance.js` is **live**, not dead (§13/Appendix); the `#72BB72` "done" dot is
  **reachable**, re-theme don't delete (§18); `#view-form` is **reachable via edit**, only the
  create-new entry is dead (§5); the project-treasury `⋮`-delete **is** gated by `confirm()` — it is
  a bad affordance, not an unconfirmed delete (§10).

**Traceability.** Every bullet cites the brief section (`§n`) and/or the legacy `file:line` it came
from. The dead-code table carries the grep/read proof that confirmed unreachability.

---

## Session index

| Session | Screen | Brief | The debt in one phrase |
|---|---|---|---|
| S11 | Tokens + theme | §1/§4/§8/§17 | slate admin palette; one source of category & money color; drop residual amber |
| S12 | Global CSS + state system | §18 | real loading/empty/error(+retry); skeletons; kill the one `Cargando…` string |
| S13 | Icon | §1/§7 | every icon-only control gets an accessible name; no `title=`-only affordances |
| S14 | Button + Card + Badge + Avatar | §3/§5/§14/§17/§18 | loading-button prop; one card radius; data-driven badges; no false-affordance cards |
| S15 | Toast | §18/§9 | one text-only toast store; add `undo`; route `alert()` through it |
| S16 | Modal + ConfirmDialog | §4/§6/§11/§14/§18 | one modal; ref-counted scroll-lock + focus trap; confirm stacks; no duplicate global IDs |
| S17 | ActionSheet | §4/§6/§8/§10/§11 | one menu replacing four; route every kebab through it; grouped items; slate not iOS-blue |
| S18 | RichTextEditor | §6 | sanitize on save AND render; two editors on the registrations form |
| S21 | Disclosure + DataTable + FormWizard + fields | §8/§9/§11/§18/Appendix | one wizard/one form vocabulary; adaptive progress; card-collapsing tables; kill `window.__*`+`onclick` |
| S37 | Admin shell / drawer | §1 | fix missing page titles; drawer focus-trap + Escape; nav count slot; drop amber dot |
| S38 | State stores / hosts | §1 | `perms.tabs` is UX-only; RLS is the guard (D-006) |
| S39 | Auth + MFA | §2 | **enforce MFA (aal2 RLS)**; CodeInput; password show/hide+meter; preserve anti-enumeration |
| S40 | Admin repos | §16 | `pause_invites` is cosmetic — enforce or drop |
| S41 | Dashboard (Inicio) | §3 | human error+retry; kill grid-balance hack; reconcile `.dash-card`; false-affordance rows |
| S42 | Activity + Settings | §15/§16 | paginate audit log; confirm+group the maintenance flag; card independence; enforce/remove flags |
| S43 | Notifications bell | §1 | add loading + error(+retry); fix the count-failure-looks-like-zero badge |
| S44 | Ministries | §13 | add error state; escape fields; CSS grid (no grid-balance) |
| S45 | Account + prefs | §17 | ReadonlyField wall; kill the always-green badge & synthetic feed; build or delete prefs UI |
| S46 | Gallery | §12 | touch-reachable photo actions; touch reorder; real upload progress; error≠empty |
| S47 | Users + presets | §14 | carry preset color+icon to the badge; isolate the preset modal (no shared IDs); search/sort |
| S48 | Events A: CalendarGrid + calendar | §4 | kill `window.__*`+inline-onclick day-sheet; one kebab path; `--cat-*` tokens; grid skeleton |
| S49 | Events B: upcoming + form | §5 | fix card-click→kebab false affordance; stop borrowing `.se-evcard`; human error; drop dead table/bulk |
| S50 | Discipleship groups | §11 | unify two creation paths; ActionSheet member menu; honest "Enviar mensaje" copy |
| S51 | Discipleship interests | §11 | **escape preferred_day/time (dual-fix)**; bounded card; drop `#dscpPoolHint` write |
| S52 | Treasury repo | §8/§9 | range-pushdown; integer cents (D-003) |
| S53 | Treasury Resumen/Ingresos/Gastos | §8 | honest month scope; `pay.error` guard; funds-as-select; card-collapsing tables |
| S54 | Treasury Recurrentes/Por pagar/Notas/Config | §8 | idempotent materialize + system-row marker; weekly/yearly or remove; `active` toggle; overdue emphasis |
| S55 | Treasury Reportes (over-verify) | §9 | distinct loading≠error; prominent Secciones; delete dead config; preview==download |
| S56 | Project treasury | §10 | kebab→ActionSheet+edit; error states everywhere; explicit budget-tab creation |
| S57 | Registraciones list/form | §6 | 4 distinct status badges; classed age-group rows; count-fetch error≠"0 inscritos" |
| S58 | Registraciones detail (over-verify) | §6 | promote minors' medical data; add search/filter/sort; realtime teardown; waiver from frozen row |
| S59 | Designer engine | §7 | drop dead `dz-dark`; wrap Fabric engine (D-011); golden serialization |
| S60 | Designer templates | §7 | real template thumbnails (not CSS wireframes); byte-identical event QR URL (D-001) |
| S61 | Designer panels/history | §7 | **fix duplicate Opacity slider**; preserve live/commit bus; z-order translation; a11y |
| S62 | Designer collab (over-verify) | §7 | resolve undo-disabled-under-collab; verify private-channel RLS actually applied; no leaked channel |
| S63 | Designer library/chooser/share | §7 | keyboard-activatable cards; error+retry+skeleton; unified Modal |

---

## Phase 1 — Shared foundations (design system) · S11–S21

*These primitives are consumed by every admin screen. A defect designed into a primitive is
re-inherited by 20 ports. The brief's §18 SHARED COMPONENTS is the state-matrix the roadmap
(S11–S21) never wrote down.*

### S11 — Design tokens + theme · §1 / §4 / §8 / §17

**Legacy source of truth:** `css/pages/admin/palette.css`, `css/tokens/colors.css`, the inline
pre-paint theme script in `admin/index.html`, `js/pages/admin/state.js` (`CAT_COLORS`).

**MUST FIX ON PORT**
- Reproduce the admin **neutral-slate** palette overrides scoped to admin routes so gold/teal never
  reappear as an admin accent: `--color-secondary #475569`, `--gold-bright #64748b`,
  `--color-accent #475569`, `--color-info #334155` (§1).
- Dark mode is a **token override only** (`data-theme` on `<html>`) — never a component-level
  `@media (prefers-color-scheme: dark)`, which silently defeats the admin's forced theme (§1, CLAUDE.md §4).
- Theme applied **pre-paint** via a no-FOUC `theme.ts` (equivalent of the legacy inline script that
  reads `ird.admin.prefs`), and `theme.ts` must expose a **settable** store (light/dark/system) so the
  account Preferences UI (S45) can flip it (§1/§17).
- Establish `--cat-{servicio,estudio,oracion,evangelizacion,especial,otro}` (each with a `-t` text
  variant) as the **one** source of event-category color; components consume the token/class (§4).
  Testable: **no admin JS ships a category hex literal**.
- Establish semantic **money tokens** (`--money-pos` / `--money-neg` / `--money-warn`) replacing the
  hardcoded hexes duplicated across treasury files (`#1e6b61`/`#1c7a52` green, `#b02030` red,
  `#a05a10` amber) and the `!important` on `.pos`/`.neg`; the two greens collapse to one; add an
  **honest status vocabulary** (paid / pending / open / overdue / active / inactive / restricted), all
  AA-contrast and reversing via the `colors.css` dark override (§8).

**DO NOT PORT**
- The residual **amber glow** on `.topbar__title::before` (`shell.css:57-65` — the `background` is slate
  via palette but the `box-shadow rgba(200,152,88,.6)` is still literal amber). Drop the last gold
  accent in the slate panel (§1).
- The `CAT_COLORS` JS hex map (`state.js:79-86`) and every inline `style="background:${color}"`.
- The one-off green `#72BB72` "done" dot (`wizard.css:56` ← `--color-add`) — **re-theme to slate**, do
  not import the public green. (Note: this is **live** code, `form-wizard.js:66` emits ` done` — not a
  deletion.)
- The private `--dz-*` designer token set disconnected from the admin palette (`designer.css:7-24`) —
  re-map to design-system tokens, don't carry a parallel scale.

### S12 — Global CSS baseline + state system · §18

**Legacy source of truth:** the single `<div class="loading"><i fa-spinner fa-spin> Cargando…</div>`
string reused by every async view; `.empty-state`; `css/pages/admin/account.css:220-232`.

**MUST FIX ON PORT**
- A real state system consumed by **every** async view (all three are mandatory per CLAUDE.md §5):
  - **LOADING** = skeletons per component shape (card-grid / table / list / detail), **not** the single
    legacy string (lists jump on load). Reduced-motion guard on the skeleton shimmer.
  - **EMPTY** = calm box (icon + one line) **with a primary-action slot** where one exists (e.g. "Crear").
  - **ERROR** = **human Spanish copy + a RETRY button** — never the raw backend/Postgres string the
    legacy prints verbatim to volunteers (`.empty-state` + warning triangle + `error.message`, no retry
    anywhere).
  - Specify **exact class names and emitted markup** for each so ports don't re-diverge.
- Honor `prefers-reduced-motion` **globally** at the token/base level, not via a bespoke
  `body.adm-reduce-motion *{…!important}` block (§17).
- Mobile inputs compute **≥16px** effective font-size (iOS no-zoom).

**DO NOT PORT**
- The single `Cargando…` string as the only loading state.
- Raw backend error strings shown to volunteers.
- The dead `body.adm-density-compact` / `body.adm-reduce-motion` CSS hooks (`account.css:220-232`) — see
  dead-code table; do not carry them inert (they only become live if S45 builds the prefs UI).

### S13 — Icon · §1 / §7

**Legacy source of truth:** Font Awesome 6.5 (already loaded — do **not** add a second set); the shell
already sets `aria-label` on burger/bell/logout.

**MUST FIX ON PORT**
- Single `Icon` component; a `label` prop toggles `aria-label` (meaningful) vs `aria-hidden=true`
  (decorative). Every icon-only control in the shell must keep its accessible name — the port must not
  regress the burger/bell/logout labels (§1).
- The designer top-bar `.dz-ic` (~15 buttons) and card `.dz-mini` actions set **only** `title=` —
  invisible to screen readers and on touch. Give them real accessible names (§7).

**DO NOT PORT**
- `title=`-only as an accessible name for any interactive control.

### S14 — Button + Card (+ IconButton, Badge, Avatar, KPI tile) · §3 / §5 / §14 / §17 / §18

**Legacy source of truth:** the inline `busy()`/spinner hand-rolling in `js/pages/admin/auth.js` and
`js/pages/admin/form-wizard.js`; `.icon-btn__admin` + `.adm-icon-btn`; `.dash-card`;
`css/pages/admin/users.css:108-137`; `paintAvatar` in `js/pages/admin/account.js`.

**MUST FIX ON PORT**
- Button hierarchy (primary `--color-dark` / secondary slate / danger `--color-danger` / ghost) with
  **states as real props**: default, hover, `:active` scale(.97), `:disabled` (load-bearing — Ingresos
  "Agregar ingreso" is disabled until income categories exist), `focus-visible` ring, and a **LOADING**
  state (spinner + disabled + preserved width). Legacy hand-rolls loading inline
  (`btn.innerHTML='<i fa-spinner fa-spin> Guardando…'`) in auth / form-wizard / gallery / calendar —
  make it a prop so no screen re-implements it (§18/§2/§8).
- **One** IconButton replacing the two near-identical legacy names `.icon-btn__admin` and
  `.adm-icon-btn`; icon-only buttons **must** take an `aria-label` (§18).
- **Card:** one radius (`--radius-md`, 10px) + one shadow token as the system default. `.dash-card` is
  the outlier (16px radius + amber hover-wipe + 3px lift) and must **not** become the system.
  Interactive variant renders `<button>`/`<a>` with a `focus-visible` ring and a **slate** hover, never
  amber (§3/§17).
- **Card must resolve the false-affordance bug:** a card that *looks* clickable *does* the primary
  action on click. Today the upcoming `.se-evcard` re-fires the hidden kebab (§5) and the dashboard
  `.dash-next` rows have a hover wash but no handler (§3). Offer an explicit clickable variant (whole
  card → primary action, distinct control for the menu) vs a static variant — pick one, don't fake it.
- **Badge:** data-driven only. Role variant + status variant that **reflects real state** — prohibit
  the hard-coded always-green "Activa" badge (§17). Role badges must be **visually distinct per role**
  (`users.css:108-119` renders `ministry_leader` and `treasurer` byte-identically). Add a **tinted**
  variant deriving an AA-safe fg/bg from an arbitrary per-object hex (preset / ministry color) via a
  CSS custom property, never an inline `style` attribute (§14).
- **Avatar:** one image-or-initials component, one initials algorithm, kept in sync after an edit;
  used in the sidebar footer, account hero, profile, and (new) the Actividad actor (§14/§15/§17).
- **KPI tile:** add a real mid-range type step (the current `0.7rem`-label → `1.85rem/800`-number jump
  has nothing between) and expose the tile's **scope honestly** (Resumen mixes month-scoped tiles with
  an all-time "Por pagar" tile that looks identical) (§8).

**DO NOT PORT**
- The two divergent icon-button names.
- `.dash-card`'s 16px radius, amber hover-wipe (`::before` ← `--color-secondary`), amber icon-tile
  hover, and 3px lift.
- The always-green hard-coded "Activa" badge (both occurrences, `account.js:122` and `:395`).
- The all-slate `.role--admin` / `.role--ministry_leader` / `.role--treasurer` sameness.
- Per-object color as an inline `style="background:${color}"` (also an unescaped sink — see S44/S48).

### S15 — Unified Toast · §18 / §9

**Legacy source of truth:** admin `toast(msg,'success'|'error'|'info')` in `js/pages/admin/ui.js`;
public `showToast`.

**MUST FIX ON PORT**
- One toast store + `<ToastHost>` retiring **both** legacy systems. Bottom-right stack, auto-dismiss
  ~4s + manual close. Message rendered as **text, not HTML** — the legacy builds with `textContent`
  precisely so error strings / emails can't inject markup; under Svelte **never `{@html}` a toast body**
  (D-005). `role=alert` for error, `role=status`/`aria-live=polite` otherwise. `slideIn` keyframe guarded
  by `prefers-reduced-motion`.
- Add the roadmap's **`undo` variant** (action button) for destructive admin actions that today have
  only a confirm and no undo.
- Report-builder export failure uses a raw `alert()` (`report-builder.js:407`) — route through the
  unified Toast (§9).

**DO NOT PORT**
- `{@html}` on any toast body.
- `alert()` for user-facing errors.

### S16 — Modal + ConfirmDialog · §4 / §6 / §11 / §14 / §18

**Legacy source of truth:** THREE modal systems — `.modal-backdrop`/`.modal` (`modal.css`), the
designer `.dz-modal`, and `.wizard-backdrop`/`.wizard`; `openModal`/`closeModal` in `ui.js`;
`#confirmModal`; the duplicate `id="presetModal"` blocks in `admin/index.html:1274` and `:1367`.

**MUST FIX ON PORT**
- **One** Modal replacing all three. Variants: standard (~500px) / **wide** (tables + designer tools,
  retiring `.dz-modal`'s 6px-radius/black-CTA look) / **confirm** (360px). `bind:open`. Opens with
  `translateY(16px)+scale(.97)`→settled on house easing `cubic-bezier(0.22,1,0.36,1)`; Escape closes;
  backdrop click closes; `role=dialog` + `aria-modal=true`.
- **Scroll-lock must save and RESTORE** the prior `document.body.style.overflow`, not hard-clear to `''`
  — must be **reference-counted** so closing a confirm nested inside a modal doesn't unlock the page
  while the outer modal is still open (legacy `openModal`/`closeModal` and each opener set body overflow
  independently) (§4/§6/§11).
- **Focus trap + return:** focus moves into the dialog on open and returns to the trigger on close —
  legacy does **neither** (new requirement) (§1/§18).
- **ConfirmDialog:** a promise-returning `confirm(title, msg)` singleton store + `<ConfirmHost>`,
  callable from **non-component code** (`notifications.clearAll` and every destructive action). Resolves
  `false` on No / × / Escape / backdrop. Default action is the **danger** button per legacy markup, but
  expose a variant so non-destructive confirms don't render a red primary. **Stacks above** an open
  Modal (preserve `#confirmModal`'s `z-index: calc(var(--z-modal)+10)`); focus lands on the **safer**
  (cancel) button on open. Title/message set as text (never `{@html}`).
- Make **duplicate global-ID collisions impossible**: legacy has two modals sharing `id="presetModal"`
  (+ `presetModalSave/Title/Error/Close/Cancel`), so `getElementById` returns the first and the second
  modal is unreachable with a double-bound Save. Each instance owns local state (§14 — full fix at S47).
- Toggle `body.has-floating-popup` for the calendar day-sheet (fades the WhatsApp FAB / mobile bar) and
  un-toggle on close (§4).

**DO NOT PORT**
- The three separate modal systems / the `.dz-modal` bespoke system.
- Hard-clearing `body.style.overflow` to `''` on close.
- The duplicate `id="presetModal"` markup and the double-bound `presetModalSave` handler.

### S17 — ActionSheet · §4 / §6 / §8 / §10 / §11

**Legacy source of truth:** FOUR menu implementations — the shared `showActionSheet`
(`js/components/action-sheet.js`), the `.se-menu__pop` Opciones overflow
(`special-events-tab.js` `wireOptionsMenu` 79-101), the `.dscp-member-pop` member popover
(`discipleship-tab.js` `toggleMemberMenu` 483-572), and the designer `.dz-pop` toolbar menus.

**MUST FIX ON PORT**
- **One** ActionSheet replacing all four. Port the `action-sheet.js` contract exactly:
  `showActionSheet({trigger, title, subtitle, actions:[{label, icon, variant:'default'|'warn'|'danger',
  onClick}], cancelLabel})`. Desktop = anchored popover that **measures then flips up** on
  viewport-bottom overflow, clamps 12px inside both horizontal gutters, and repositions on
  scroll + resize; mobile ≤640px = bottom sheet from `translateY(110%)` with an explicit **Cancelar**
  row. `role=menu` + `role=menuitem`; Escape + backdrop close; **only one open at a time**; **focus into
  the sheet on open, return to the trigger on close** (legacy does neither); reduced-motion guard on the
  slide/scale.
- Support **grouped items**: a section label + divider + an empty-section fallback (the member menu
  renders a "Mover a otro grupo" section listing every other group, then a divider, then a danger
  "Remover" — a flat action list is insufficient) (§11).
- Support **contextual per-row extra actions** (e.g. "Marcar pagado" only when `status=open`) (§8/§10).
- **Route ALL row kebabs through it** — this is what fixes the §10 project-treasury kebab-is-delete
  affordance and unifies every table/card menu.

**DO NOT PORT**
- The legacy row default color **iOS blue `#0a84ff`** — use slate `--color-dark` for default (keep
  warn/danger).
- The `.se-menu__pop` / `.dscp-member-pop` / `.dz-pop` bespoke menus, and any menu that doesn't
  reposition within the viewport (`.dz-pop`).

### S18 — RichTextEditor · §6

**Legacy source of truth:** `mountRichText` mounting two editors (Descripción, Información) in
`special-events-tab.js:186-187`; `js/lib/sanitize-html.js`.

**MUST FIX ON PORT**
- Mountable editor (`mount`/`getHtml`/`setHtml`/`placeholder`) that sanitizes on **both save and
  render** (with an `htmlIsEmpty` guard). The registrations form's two editors store to
  `special_events` and re-render on the **public** event page, so **both directions** go through the
  sanitizer allowlist (D-005). No cursor jump on input.

### S21 — Disclosure + DataTable + FormWizard + form vocabulary · §8 / §9 / §11 / §18 / Appendix

**Legacy source of truth:** `js/pages/admin/form-wizard.js` (the real engine) + three hand-rolled
wizards (event, discipleship, gallery); FOUR form vocabularies (`.form-group`/`.form-row`, `.wiz-field`,
`.rb-*`, `.settings-field`) + the dead `.trez-field`; the hard-coded 4-dot progress strips in
`admin/index.html:1446-1502`; the financial `DataTable` surface in `treasury-tab.js`.

**MUST FIX ON PORT — FormWizard**
- **One** config-driven wizard = the ported `form-wizard.js` engine, used everywhere; retire the
  event/discipleship/gallery hand-rolled duplicates. Config
  `{title, icon, submitLabel, data, steps:[{label, hint, fields}], onSubmit→{error}|ok, onDone}`.
- **Field-type contract:** text · textarea · number · money · date · select · choice — **extended** per
  §18 to also cover color · checkbox · radio · toggle · multi-select · file/dropzone · rich-text ·
  icon-picker · segmented. Per-field **required** validation + per-field **`showIf(data)`** re-evaluated
  each render (treasury "ministry vs person", report "month vs year" depend on it).
- **Auto-generated review step with a SINGLE review renderer** (legacy has three); the review lists only
  `showIf`-visible fields with type-aware formatting (money→USD, choice/select→option label,
  date→localized).
- **Progress indicator adapts to step count** (`steps.length + 1`) — never a hard-coded 4-dot strip.
- Escape + backdrop close; body scroll-lock + restore. Submit shows the spinner + disables and
  **re-enables on `{error}` without closing**, surfacing the error inline (not a toast). money field:
  `$`-prefixed, `min 0`, `step 0.01`, `inputmode=decimal`, ≥16px.
- The **choice / card-picker** step is **keyboard operable** — the discipleship level cards are
  click-only, non-focusable `<div>`s with no role today (§11).

**MUST FIX ON PORT — form vocabulary**
- **One** vocabulary replacing the four + the dead `.trez-field`. Baseline `.form-group`: uppercase
  micro-label (0.8rem/600/muted), 1.5px `gray-50` border, `--radius-md` control, focus → `--color-dark`
  border + 3px ring. ≥16px effective mobile font. `.form-row` = 2-col grid → 1-col at ≤640px. Every
  control specifies default/hover/`focus-visible`/disabled/error + an inline error slot. **Eliminate
  inline `style="…"` strings** from generated markup (pervasive in age-group rows, grouped headers,
  checkbox labels, wizard badges, action bars).

**MUST FIX ON PORT — DataTable**
- The 4–6 column financial tables **card-collapse below the admin breakpoint** (no horizontal scroll at
  360px — the legacy `overflow-x:auto` is explicitly rejected by admin-ux). Numeric/money columns
  right-aligned with `tabular-nums`; money cells carry semantic +/- via tokens; per-row status-pill
  slot; a **system-generated row treatment** (icon/badge) for auto-inserted rows (recurring, mirrored
  payables — the treasurer view has none); overdue-row emphasis; built-in loading/empty/error rows (§8).
- **Column sorting where the sort state actually drives render order** — the legacy special-events table
  shipped a full sortable CSS surface + `sortKey`/`sortDir` module state that nothing reads (Appendix).

**MUST FIX ON PORT — Disclosure / SegmentedControl / and the unnamed primitives**
- **Disclosure** must refresh its content programmatically **without re-toggling** (the discipleship
  Miembros panel is refreshed by calling `openMembersInline()` twice — expose `refresh()`); `aria-expanded`,
  animated height + reduced-motion guard, chevron. It also replaces the hand-rolled `.se-collapse` +
  `wireCollapse()`, and the report "Secciones" group — which must **not** be collapsed-by-default styled
  as a filter; it is the primary control (§9/§11/Appendix).
- **SegmentedControl** (unnamed in the roadmap): the report Período control (Semana/Mes/Trimestre/Año +
  nested T1–T4) and the account SectionNav / Usuarios sub-tabs — single-select, arrow-key operable,
  `focus-visible`, ≥16px, collapses to a horizontally-scrollable pill bar below 860px **without the body
  scrolling** (§9/§17).
- **MultiSelect** checkbox popover (unnamed): the Users invite ministries/equipos picker
  (`users.js:202-251`) — `aria-haspopup`/`expanded`/`controls`, opens upward on overflow, closes on
  outside click, keyboard operable (§14).
- **IconPicker** (unnamed): the preset editor's 42-icon grid (`role-presets.js:59-67`) — single-select
  `is-selected`, arrow + Enter, accessible names (§14).
- **ColorInput** (unnamed): a labeled `<input type=color>` wrapper **and** a documented mechanism to turn
  a stored per-object hex into a safe tinted Badge/Card via a CSS custom property (`--preset-color`), with
  the raw hex **escaped/validated before it reaches a `style` attribute** (§13/§14).

**DO NOT PORT**
- The `window.__wizBack` / `__dwizBack` / `__gwizBack` globals and `onclick="window.__…()"` attributes
  (do-not-extend per CLAUDE.md §10).
- The hard-coded 4-dot progress strips (`admin/index.html:1446-1502`).
- The three divergent review renderers.
- The one-off green `#72BB72` "done" dot — use a slate/neutral token.
- Inline `style="…"` strings in generated markup.
- The dead `.trez-field` styles (see dead-code table).
- `form-wizard.js:89` money field `value="${v ?? ''}"` **without `esc()`** (every other branch escapes) —
  escape consistently even though the current numeric-only path is non-exploitable (port hygiene).

---

## Phase 3 — Admin shell + auth · S37–S40

### S37 — Admin shell & routing skeleton (topbar / sidebar / drawer) · §1

**Legacy source of truth:** `css/pages/admin/shell.css`, `platform.css`; the boot path in
`js/pages/admin/index.js`; the sidebar footer render in `js/pages/admin/account.js`.

**MUST FIX ON PORT**
- Reproduce the shell: fixed 60px dark sticky topbar (`var(--z-menu)`) + fixed 238px white sidebar with
  grouped nav (Principal / Eventos / Finanzas / Comunidad / Administración), active item = solid
  `--color-dark` pill with white text, account footer pinned to the bottom (36px avatar photo-or-initials
  + name + **Spanish** role + a separate logout). Below 900px the sidebar becomes a 264px slide-in
  drawer (max 82vw) behind a burger with a dimmed backdrop; content panels drop their left margin.
- **Resolve the missing-page-title problem:** Inicio and Mi cuenta have **no title anywhere** because
  the topbar hosts none. Pick topbar-hosts-title **or** page-owns-title and apply it consistently across
  all screens (§1).
- **Drawer focus management the legacy lacks:** trap focus inside the drawer while open and restore
  focus to the burger on close; **close on Escape** (`index.js` wires only backdrop-click + tab-pick).
- Provide a **nav badge/count slot** so pending work (unread notifications, pending discipleship
  interests) surfaces in the nav instead of only on navigation.
- Keep `body.is-admin` / `is-finance` / `is-treasurer` **strictly as UX gating**; the port derives
  `perms.tabs` (S38) but the guard stays **RLS** (D-002/D-006) — a client class must never become an
  authorization decision.

**DO NOT PORT**
- The amber brand dot + hardcoded amber glow on `.topbar__title::before` (`shell.css:57-65`) — the last
  gold accent in a deliberately-slate panel.
- The orphaned `.topbar__user` / `.topbar__logout` CSS (see dead-code table) — the account chip + logout
  moved to the sidebar footer; do not recreate a topbar user chip, and do not port the 640px
  `.topbar__user` rule (`shell.css:464`) that styles a non-existent element.
- The forced-theme flash-guard as a copied inline `<script>` tag — reimplement as the no-FOUC
  `theme.ts` (S11).

### S38 — State stores + UI primitive hosts · §1

**Legacy source of truth:** `js/pages/admin/state.js`; the role-gating body classes.

**MUST FIX ON PORT**
- `session` / `ministries` / `perms` rune stores; `perms.tabs` derives from the profile. It is **UX
  only** — the real guard is RLS (D-006). Its negative cases (leader ≠ treasury; treasurer ≠
  registrations/PII) are **tests**, not comments.
- `confirm` / `toast` callable from non-component (module) code — the notifications and repo layers
  need them.

### S39 — Auth flows + MFA enforcement + guards · §2

**Legacy source of truth:** `js/pages/admin/auth.js` (`routeAfterLogin` :124, `boot` steps 0–2,
`busy()`, `setErr()`), `js/pages/admin/mfa.js`, the auth `<form>`s in `admin/index.html`.

**MUST FIX ON PORT**
- **ENFORCE MFA.** Legacy is password-only: `routeAfterLogin()` (`auth.js:124`) calls `bootApp()` and
  **never challenges**, even for accounts with a verified factor (documented in the `mfa.js` header). The
  port MUST gate `/admin` on an MFA challenge/enroll **and** enforce `auth.jwt()->>'aal'='aal2'` in RLS
  (D-010, the S39 `aal2` migration). Client gating alone is bypassable — **the RLS migration is the real
  fix.** This is the single behaviour a faithful port must not reproduce.
- Give the 6-digit MFA entry a real **CodeInput** (currently one text box with letter-spacing):
  `inputmode=numeric`, `autocomplete=one-time-code`, digits-only filtering, segmented, paste distributes
  across segments, error clears on edit.
- Add a **show/hide toggle** (a real `<button aria-pressed>`, never hover-only) + **password-strength**
  feedback on the invite/reset set-password flow (`submitSetPassword`) and login — neither exists today.
- Make error/success first-class via the **Alert** primitive (`role=alert` on error). **Keep the
  `setErr()` `textContent` path** (no `innerHTML`).
- Split the MFA card's two jobs — **enroll** (teach / QR / secret) vs **challenge** (verify) — into
  properly-hierarchied states rather than one card doing double duty.

**DO NOT PORT**
- The optional-MFA shortcut (`routeAfterLogin` → `bootApp` with no challenge).
- Inline `onsubmit="return false"` on the auth `<form>`s — use real submit handlers / `preventDefault`.
- The fragile `.auth-card` ↔ `auth-animation.css` shared-selector coupling.

**PRESERVE (do not "fix away") — these are security-positive:**
- The deliberately non-committal forgot-password message **"Si la cuenta existe…"** (no account
  enumeration).
- The `token_hash` + `verifyOtp` **scanner-safe** invite/reset flow and expired-link handling
  (`boot()` steps 0–2) — survives email-scanner prefetch.

### S40 — Data-layer repos F3 (admin-support) · §16

**Legacy source of truth:** the inline `sb.from()` calls across the admin tabs; `supabase/functions/admin-invite/index.ts`.

**MUST FIX ON PORT**
- Typed `repos/{profiles, ministries, settings, notifications, activity, newsletter, admin}.ts`;
  `admin-invite` edge-fn contract byte-compatible.
- **`pause_invites` is cosmetic** — `admin-invite/index.ts:224-294` never reads it (grep of
  `supabase/functions` for `pause`/`invites`/`app_settings`/`features` returns nothing). Either enforce
  it in the ported invite flow or drop the toggle (feeds S42/S47). Do not carry a control that persists a
  value nothing reads.

---

## Phase 4 — Admin CRUD tabs · S41–S51

### S41 — Dashboard (Inicio) · §3

**Legacy source of truth:** `js/pages/admin/dashboard.js`; `js/pages/admin/grid-balance.js`.

**MUST FIX ON PORT**
- The **error state must not render the raw error**: `dashboard.js:106-108` renders `${e.message}` into
  an empty-state box. Replace with human copy + a retry affordance. (It is auto-escaped by the `html`
  tagged template, so this is UX/port-debt, not an XSS hole.)
- Resolve the **false affordance** on the next-events rows: `.dash-next` rows have a hover wash +
  hairlines but **no click handler and no `data-goto`** (verified). Either make them navigate or remove
  the interactive styling.
- **Delete the `autoBalance`/`grid-balance.js` hack** (called at `dashboard.js:80`) — use a fixed-column
  responsive grid (`repeat(auto-fit, minmax(180px, 1fr))`).
- Reconcile `.dash-card` to the Card system: drop the 16px radius, the amber hover-wipe
  (`.dash-card::before` ← `--color-secondary`), the amber icon-tile hover, and the 3px lift.
- Give the KPI grid **hierarchy** — only "Discipulado pendiente > 0" (`dash-card--alert`) is ever
  actionable; it should not be one of five identical shapes.

**DO NOT PORT**
- `grid-balance.js` / `autoBalance()` — the layout hack (it is **live**, not dead — replace, don't just
  drop).
- The amber accent on hover (`::before` scaleX, amber icon-tile).
- Rendering `e.message` as the error body.

### S42 — Activity + Settings · §15 / §16

**Legacy source of truth:** `js/pages/admin/activity-tab.js`, `js/pages/admin/settings-tab.js`,
`js/lib/maintenance.js`.

**MUST FIX ON PORT — Actividad (audit log)**
- Remove the hard **100-row ceiling** with no pagination (`activity-tab.js:54`) — add load-more / keyset
  pagination.
- Add **filtering** (actor / action / entity type / date) and **day-grouping** so the user isn't parsing
  relative timestamps to find yesterday.
- Add an **actor avatar** (every other screen has avatars; recognizing a person at a glance matters here).
- **Keep and unit-test** the Spanish ACTION verb / ENTITY phrase map and `timeAgo()`
  (`activity-tab.js:10-43`) — user-facing strings, a golden candidate.
- Keep it strictly **read-only**.

**MUST FIX ON PORT — Configuración**
- **Gate "Modo mantenimiento" behind a confirmation** and separate it visually from the public-page
  flags — it takes the **entire public site down** (`maintenance.js` overlays the whole site for
  non-staff) yet sits in the same flat list as "show the gallery" and is saved **instantly on toggle**
  (`settings-tab.js:84-85, 107-117`). Group flags by consequence. (Verdict note: filed here as port debt,
  **not** a legacy fix — it is a working feature that could be misused, and the flag already carries
  `danger:true` red styling; the confirm-on-destructive-toggle is the S42/S16 job.)
- **Make the two cards independent.** A failed feature-flag toggle calls `loadSettings()`
  (`settings-tab.js:113`), which re-renders the whole tab and **destroys any unsaved text** typed into the
  church-info form above it. One card must not wipe the other.
- Add **dirty-state tracking** to the church-info form (Guardar is always enabled; navigating away loses
  edits silently).
- **Type the inputs** (tel/email), add validation/placeholders, and give "Horario de servicios" a
  structured/multiline input.
- **Actually enforce the public-page flags** (discipulado/galeria/eventos/donaciones are **cosmetic**
  today — no reader on the public site; only `maintenance` has a real consumer) or remove them, so the
  toggles don't lie. Same for `pause_invites` (S40).

**DO NOT PORT**
- Instant, unconfirmed commit of the maintenance flag.
- The toggle-failure → full-tab reload that clobbers sibling form state.
- `type="text"` for phone/email and a single-line box for service times.
- Feature-flag toggles that persist a value nothing reads.
- The `fin_budgets` entity mapping (`activity-tab.js:28`) **only after** verifying no historical
  `audit_log` rows reference it (see unverified list).

### S43 — Notifications bell + dropdown · §1

**Legacy source of truth:** `js/pages/admin/notifications.js`.

**MUST FIX ON PORT**
- Add a **LOADING** state: render a skeleton/spinner into `#notifList` before the first fetch resolves —
  today it is **blank until data lands** (`refresh()` sets nothing beforehand).
- Add an **ERROR + retry** state: `fetchPage()` returning `null` makes `refresh()` early-return
  (`notifications.js:76-83`), leaving the panel blank or showing a stale list on a failed realtime
  refresh. Human copy + a retry button.
- **Fix the misleading badge on a failed count:** `refreshBadge()` maps a failed/undefined count to `0`
  and hides the badge (`notifications.js:86-96`), so a fetch failure looks identical to "no unread".
  Distinguish error from zero.
- Design all **five** states (loading / empty / error / unread / read). Rows = 32px type-icon tile +
  title + optional body + relative time (`ahora`/`N min`/`N h`/`N d`), unread rows tinted, paginated
  20/batch via "Cargar más", realtime-subscribed. 360px desktop / full-width fixed panel ≤640px; header
  "Notificaciones" + "Marcar leídas" / "Limpiar".
- Keep "Limpiar" behind its confirm (`notifications.js:167-179`) and keep `esc()` on every rendered
  field; never `{@html}` an untrusted notification body.

**DO NOT PORT**
- The silent early-return-on-error pattern (no user-visible feedback).
- Reliance on the badge as the only signal — carry the count into the nav badge slot (S37).

### S44 — Ministries · §13

**Legacy source of truth:** `js/pages/admin/ministries.js`, `js/pages/admin/filters.js`,
`js/pages/admin/grid-balance.js`.

**MUST FIX ON PORT**
- Add a **real ERROR state.** `loadMinistries` (`ministries.js:14`) destructures only `{ data }` and
  ignores the Supabase error, so a failed fetch calls `setMinistries([])` and renders the "No hay
  ministerios todavía" empty state — a failed request is indistinguishable from "this church has no
  ministries". Branch on error → the error State view.
- **Escape ministry fields at every render site** — the color, and (in the shared filter panel) the
  **name**. `ministries.js:39` emits `style="background:${m.color || '#888'}"` unescaped; `filters.js`
  interpolates `m.name`/`m.color`/`m.id` raw (fixed as part of S48/S49; see the escaping note there).
  (Verdict: **not** a qualifying legacy security fix — admin-only render of admin-authored data, no
  cross-privilege exploit — but the port must escape from the start.)
- Render the ministry list with **pure CSS** (grid/table) so `grid-balance.js` is unnecessary.

**DO NOT PORT**
- `autoBalance()` / `grid-balance.js` (`ministries.js:8, 45`) — replace with CSS (it is **live**, not
  dead).
- The unescaped `style="background:${m.color}"` interpolation (`ministries.js:39`).
- The 14px-dot + name + kebab card as the intended spec — it is the debt, not the target (§13).

### S45 — Account + prefs (Mi cuenta) · §17

**Legacy source of truth:** `js/pages/admin/account.js`, `js/pages/admin/prefs.js`.

**MUST FIX ON PORT**
- Stop rendering the **five immutable fields** (Usuario, Correo, Departamento, Zona horaria, Idioma) as
  `<input disabled>` (`renderProfileSection`) — use the **ReadonlyField** "admin-owned value" pattern
  (label + static non-focusable value + optional lock note). The disabled-input wall reads as broken.
- **Fix the hard-coded green "Activa" badge:** it is a literal in `renderHero()` (`account.js:122`) **and**
  `renderAccountSection()` (`account.js:395`) and can never be false. Wire to real status or remove.
- **Make "Actividad" real or cut it:** `wireActivitySection()` always emits exactly **four synthetic
  rows** from auth fields (`account.js:529-538`). Filter the real audit log to this user or drop the
  section.
- **Add a page title** — the account page has none and is not in the nav, so the user can't tell what
  screen they're on.
- **Deduplicate:** email appears 3× (hero sub, Perfil field, Cuenta row) and role 2× (hero badge, Cuenta
  row). Show each once.
- **Rewrite leaky error copy:** `saveProfile()` surfaces "Aún no se ha aplicado la actualización de la
  base de datos (`set_my_display_name`)…" (`account.js:320-322`) to end users.
- **BUILD the Preferences UI** (theme light/dark/system, density, reduce-motion, landing tab) — this is
  S45's natural home, and the theme setter comes from S11's `theme.ts`. Today `setPref()` /
  `landingOptions()` exist with **zero callers** and the `body.adm-density-compact` /
  `body.adm-reduce-motion` CSS is unreachable (see dead-code). **Either implement the control OR delete
  the dead plumbing — do not port it inert.**
- **Password change** (`changePassword`, `account.js:445`) needs current-password confirmation, strength
  feedback, and show/hide via the PasswordField primitive.
- **Avatar uploader:** keep image-only + ≤5MB + square validation and the upload-progress-on-button state
  (`onAvatarPick`), routed through the shared Avatar/AvatarUploader and the image-optimizer.

**DO NOT PORT**
- The disabled-input wall for immutable data.
- The always-green hard-coded "Activa" badge (both occurrences).
- The synthetic 4-row "Actividad" timeline dressed as a feed.
- The `set_my_display_name` migration-detail error string.
- The dead prefs plumbing (`setPref`, `landingOptions`, `applyLandingPref`, and the
  `adm-density-compact` / `adm-reduce-motion` CSS) if the Preferences UI is not built.

### S46 — Gallery · §12

**Legacy source of truth:** `js/pages/admin/gallery-tab.js`, `js/lib/gallery.js`,
`css/pages/admin/gallery.css`.

**MUST FIX ON PORT**
- Photo action buttons (set-as-cover, delete) are **hover-only and invisible on touch**:
  `gallery.css:299` `.gal-adm-photo__actions{opacity:0}` revealed only by `.gal-adm-photo:hover`
  (`:312`). Setting a cover and deleting a photo are **impossible on a phone/tablet.** Make these controls
  always visible / tap-reachable.
- **Drag-to-reorder is desktop-only** HTML5 DnD with no touch fallback and no affordance beyond the
  cursor (`gallery-tab.js:426-449`). Provide a touch-capable reorder (pointer long-press, or explicit
  move/up-down controls).
- **Upload feedback** is text-only, sequential, no progress bar, no cancel (the queue steps
  "Preparando…"→"Optimizando…"→"✓ Subida", `gallery-tab.js:331-353`, one at a time). Give real per-file +
  overall progress (and ideally cancel/parallelism).
- **Distinguish error from empty:** `fetchAlbums` swallows errors and returns `[]` (`gallery.js:60`), so a
  failed load renders "Aún no hay álbumes" (`gallery-tab.js:135-142`). Add a real error state + Retry.
- Pick **one namespace** (legacy mixes `gal-admin__*`, `gal-adm-card`/`gal-adm-photo`/`gal-adm-grid`,
  `gal-dropzone`/`gal-upload-item`, `gwiz-*`).
- Wire the editor's delete/confirm to **stack above** the open album-editor Modal (S16).
- Add a `prefers-reduced-motion` guard to the hover-reveal transition (`gallery.css:309`) and the
  240ms action-sheet close.

**DO NOT PORT**
- The hover-only reveal pattern for photo actions.
- HTML5 drag-and-drop as the only reorder mechanism.
- The dead `.gal-dropzone__hint` CSS rule (see dead-code table).
- The three-stacked-blocks layout (dropzone / queue / grid) unchanged — evaluate a single continuous
  surface.

### S47 — Users + role presets · §14

**Legacy source of truth:** `js/pages/admin/users.js`, `js/pages/admin/role-presets.js`,
`js/pages/admin/presets.js`, `css/pages/admin/users.css`, the modal blocks in `admin/index.html`.

**MUST FIX ON PORT**
- **Carry the preset's color AND icon onto the user's access badge.** Today the preset picks a color +
  icon (shown on the preset card, `role-presets.js:138`) but the user row falls back to a generic slate
  `role--*` badge (`users.js:75-77`) — the one piece of per-object identity is dropped exactly where
  scanning matters.
- **Give the access-preset editor its own isolated component.** In legacy it shares `id="presetModal"`
  and `id="presetModalSave"` with the calendar-preset modal; both `initSmartPresets` (`presets.js:349`)
  and `initRolePresets` (`role-presets.js:278`) bind click handlers to the same first-in-DOM Save button,
  so saving an access preset also fires the calendar-preset `_savePreset` (it early-returns only because
  `pmName` happens to be empty). **No shared global IDs.**
- Make role badges **visually distinct per role** (`users.css:108-119` renders leader/treasurer
  identically).
- Replace the **flat unsorted user list** with search + filter + sort + count (data already available
  from `callAdmin('list')`) — a church with 40 volunteers cannot find anyone.
- **Surface WHICH pages** an account can open, not just a bare count ("N páginas", `users.js:88-90`) —
  reuse the preset chip treatment.
- Either **enforce `pause_invites`** in the new invite flow or **drop the toggle** — it is cosmetic (S40).

**DO NOT PORT**
- The duplicate `id="presetModal"` markup and the double-bound `presetModalSave` handler.
- The all-slate `.role--admin` / `.role--ministry_leader` / `.role--treasurer` sameness.
- The flat, unsearchable, unsortable, uncounted account list.
- Dropping the preset color/icon on the user badge.

### S48 — Events A: CalendarGrid + calendar view · §4

**Legacy source of truth:** `js/components/CalendarGrid.js`, `js/pages/admin/calendar-tab.js`,
`js/pages/admin/filters.js`, `js/pages/admin/state.js` (`CAT_COLORS`).

**MUST FIX ON PORT**
- Replace the day-sheet action buttons — built as **string-concatenated inline `onclick` with a
  hand-rolled JS-string escaper** (`CalendarGrid.js:246-283`: the `safeTitleJs` `replace()` dance and
  `onclick="…window.__gridDelete('${ev.id}','${safeTitleJs}')…"`) — with Svelte event handlers bound to
  the event object. CLAUDE.md §10 forbids extending the `window.__*` + inline-`onclick` pattern; a
  faithful port would carry the app's riskiest anti-pattern into new code.
- **Collapse the THREE implementations** of the same edit/cancel/delete vocabulary into one
  ActionSheet/Confirm path: (a) day-sheet labeled buttons (`CalendarGrid.js`), (b) calendar two-tab list
  kebab (`calendar-tab.js:19-64` `__irdCalKebabBound`), (c) upcoming list kebab (`events-tab.js:233-275`
  `__irdKebabBound`). They already drift (`data-cal-cancancel` vs `data-ev-cancancel`).
- **Encode category color once** via `--cat-*` tokens/classes; drop the inline
  `style="background:${color}"` (`calendar-tab.js:198, 208`) and the JS hex map (`state.js:79`).
- Add a **loading skeleton** for the month grid (it pops in with no loading state).
- Fix the shipped UI typo **"Selecciona preseleccion:" → "Selecciona preselección:"**
  (`admin/index.html:647`).
- Escape every interpolated value; the ministry filter partial this screen shares (`filters.js:22-27`)
  interpolates `m.name`/`m.color`/`m.id` **unescaped** — do not reproduce (import `esc`, wrap all three).
- Give the day-sheet a **real component lifecycle:** legacy creates a singleton by fixed id
  (`calDaySheet`) and re-adds document/window listeners per construction (`CalendarGrid.js:189-211`) —
  the port mounts/tears down cleanly.
- Rethink the **2-events-per-cell hard cap** (`CalendarGrid.js:126` `evs.slice(0,2)`) and the
  mobile-only dots-with-no-labels fallback (`:137`).

**DO NOT PORT**
- `window.__gridEdit` / `__gridToggle` / `__gridDelete` / `__adminEditSpecial` / `__adminToggleCancel` /
  `__adminDeleteEvent` globals and any inline `onclick`.
- The `CAT_COLORS` JS hex map (`state.js:79-86`) and inline category background styles.
- The `safeTitleJs` hand-rolled JS-string escaper (`CalendarGrid.js:248-250`).

### S49 — Events B: upcoming + event form + wizard · §5

**Legacy source of truth:** `js/pages/admin/events-tab.js`, `js/pages/admin/event-form.js`.

**MUST FIX ON PORT**
- **Fix the false affordance:** the `.se-evcard` looks clickable but clicking it just re-fires the kebab
  (`events-tab.js:131-138` `wireEventCards` → `card.querySelector('.kebab-btn').click()`). Either the card
  opens the event or it must not look clickable — decide explicitly.
- **Stop borrowing the Registraciones component:** this screen renders `.se-evcard` wholesale from the
  special-events feature. Promote it to a neutral shared Card or give Próximos its own — no cross-feature
  namespace leak.
- Replace the raw Postgres error string shown to users (`events-tab.js:45, 75` `Error: ${e.message}`)
  with human Spanish copy + Retry.
- Add **sort/search/date-grouping** so the flat list stays usable at 50+ events.
- **Surface active ministry filters when the panel is collapsed** (only a count badge hints at them
  today).

**DO NOT PORT**
- The **dead past-events table pipeline** (`loadPast()`, `renderPastFiltered()`, `buildEventsTableHtml()`,
  `setPast`/`_pastSpecial`/`_pastRegular`, the `loadPast()` call in `__adminDeleteEvent`, and
  `.events-table` / `table.css`). See dead-code table.
- The dead `#view-bulk` bulk-create form and its handlers (`_initBulkForm`, `_addBulkDate`,
  `_updateBulkSummary`, `showView('bulk')`).
- The card-click → kebab indirection.
- The dead **create-new** entry path only (`newEventBtn` handler, `event-form.js:134`) — its trigger does
  not exist in the HTML. **NOTE — brief correction:** the `#view-form` panel itself **IS** still reachable
  via edit (`openEditSpecial`), so **port the edit path** and drop only the create-from-here path. (The
  brief §5 calling `#view-form` unreachable is inaccurate.)

### S50 — Discipleship groups · §11

**Legacy source of truth:** `js/pages/admin/discipleship-tab.js`,
`js/pages/admin/discipleship-wizard.js`, `js/lib/discipleship.js`.

**MUST FIX ON PORT**
- **TWO creation paths for one object:** `openDscpWizard` (4-step wizard) vs `openGroupModal`
  (single-page `dscpGroupModal`, `discipleship-tab.js:191-232`). Editar and "Formar grupo con estas
  personas" use the modal; "Crear grupo" uses the wizard, and they **disagree on required-ness** (wizard
  requires `leader_name` + `capacity`; the modal only requires `name`). Unify create + edit +
  form-from-selection on **one** FormWizard.
- Member kebab is a bespoke `.dscp-member-pop` popover with grouped sections (`toggleMemberMenu`
  483-572) — port to the shared ActionSheet (needs section-label + divider support).
- `reopenMembers` (574-578) calls `openMembersInline(groupId)` **twice** to force a refresh — replace
  with a Disclosure that exposes `refresh()`.
- Three group-card action buttons are all identical `.btn--ghost` (`refreshGroups` 164-175) for a safe
  action (Editar), a disclosure (Miembros) and a state change (Marcar finalizado) — give them Button
  hierarchy.
- **"Mensajes" tells the truth:** the composer button says "Enviar mensaje" but `sendMessage`
  (`discipleship.js:308-316`) only inserts a row into `discipleship_messages` history — nothing is
  delivered. Fix the copy to say it's a saved note, matching the honest toast already used ("Mensaje
  enviado al historial del grupo").
- Level colors are hard-coded hexes in JS (`discipleship-wizard.js` `LEVEL_CARDS` 21-27) — move to the
  Badge/Chip tone system.

**DO NOT PORT**
- `window.__dwizBack` / `window.__dwizClose` globals + inline `onclick=` (`discipleship-wizard.js`
  84,128,134,180,239,307).
- Click-only, non-focusable level-picker `<div>`s (119-141) — the card picker must be keyboard-accessible.
- `window.__dscpPendingPicks` global stash used to smuggle the bulk selection into `saveGroupFromModal`
  (368-389, set at 831) — pass selection through wizard state.

### S51 — Discipleship interests · §11

**Legacy source of truth:** `js/pages/admin/discipleship-tab.js` (`renderInterestCard` 677-747,
`refreshInterests` 585-642, `boot` 83-90), `js/lib/discipleship.js`.

> **⚠ QUALIFYING LEGACY FIX (dual-fix).** The escaping item below is the **one** finding that clears the
> DUAL-MAINTENANCE.md bar (category 1: security/PII). It lands in the frozen legacy admin **now** *and*
> is mirrored into this port, and it ships with a reproducing check. Everything else in this row is
> ordinary port debt.

**MUST FIX ON PORT**
- **Escape `experience_level` / `preferred_day` / `preferred_time`.** `renderInterestCard` escapes ~15
  other fields via `escapeHtml` but leaves these three raw (`discipleship-tab.js:678-681`), then assigns
  the string to `list.innerHTML`. `discipleship_interests` is an **anon-INSERT / no-SELECT** visitor-PII
  table; the anon key is public, so a crafted PostgREST POST can store markup in the free-text
  `preferred_day`/`preferred_time` columns that then executes in the authenticated admin/pastor session
  when they open Interesados — **stored XSS**. Fix = wrap the three in the already-imported `escapeHtml`
  (the load-bearing two are `preferred_day`/`preferred_time`; `experience_level` is numeric-coerced and
  escaping it is harmless consistency). Ship with a check: insert an interest whose `preferred_day` is
  `<img src=x onerror=…>`, open the tab, assert no live element renders. (`js/lib/discipleship.js` needs
  **no** edit — it is only evidence of the injection path.)
- The interest card (`renderInterestCard` 677-747) is **unbounded** (checkbox + name + date + status +
  2 contact links + preferences + up to 5 chips + free-text message + assignment + 3 buttons, no
  truncation) — rebuild as Card + Disclosure + line-clamp so a 30-person pending list is scannable.
- **Dead reference:** `boot()` writes the origin-tab help text into `#dscpPoolHint` (83-90) which **does
  not exist** in `admin/index.html` — the explanation never renders. Build a real hint element or drop
  the code; do not port a write to a missing node.
- Collapse the four parallel color systems (interest status pills, chip semantics, level, accent) onto
  the Badge/Chip primitive.

**DO NOT PORT**
- The unescaped `preferred_day` / `preferred_time` / `experience_level` interpolation.
- The bulk-bar toggle logic that relies on `selectedInterests` being mutated across two client-side
  splits of the same fetch (`refreshInterests` 585-642) — re-derive from a single source.
- The `#dscpPoolHint` write and the dead `.dscp-pool__hint` CSS.

---

## Phase 5 — Hard subsystems · S52–S63

*Treasury (+ cents), registrations admin, and the wrapped Fabric designer — the riskiest ports.
The roadmap flags **S55, S58, S62** for over-verification; see [Highest-risk ports](#highest-risk-ports).*

### S52 — Data-layer F2: treasury repo · §8 / §9

**Legacy source of truth:** the inline `fin_*` queries in `treasury-tab.js`, `report-builder.js`,
`project-treasury.js`.

**MUST FIX ON PORT**
- Typed `fin_*` repo with **date ranges pushed into the queries** — the current `renderReports` /
  report-builder over-fetch a full year then filter client-side (fixes PERF-07).
- **Money in integer cents** (`money.ts`); the legacy sums floats (`report-builder.js:131-134`,
  `treasury-tab.js` `sum()`). The float→cents golden diff is the **approved, deliberate** change (D-003).

### S53 — Treasury shell + Resumen + Ingresos + Gastos · §8

**Legacy source of truth:** `js/pages/admin/treasury-tab.js`.

**MUST FIX ON PORT**
- **Make the month picker scope honest:** it is a global control but only Resumen/Ingresos/Gastos respect
  it; Recurrentes/Por pagar/Notas/Config **ignore it** (their queries have no date filter). Either scope
  each view correctly or hide/relabel the picker per sub-view.
- **Resumen "Por pagar" KPI is ALL-TIME** (`fin_payables` filtered only by `status='open'`, no month
  filter — `treasury-tab.js:123`) while the three tiles beside it are month-scoped, and they render
  identically. Fix the semantics or the visual.
- **Add `pay.error` handling in Resumen** — only `inc.error||exp.error` is checked (`treasury-tab.js:125`);
  a payables fetch failure silently renders "Por pagar: $0.00".
- Replace the **3-variant pill system** (paid/pending/owe) reused for Sí/No, Abierto, Restringido with an
  honest status vocabulary from tokens (S11).
- Wire **`fin_funds` as the income "Fondo" select** (it is loaded and CRUD'd in Configurar but the income
  field is free text — `treasury-tab.js:177`); decide whether `fund.restricted` / `fund.opening_balance`
  mean anything (captured & displayed, never used in any calculation) or drop them.
- Raw Postgres error strings surface via `errBox(e.message)` and the wizard's `res.error.message` —
  render human messages.
- **Mobile:** financial tables use `overflow-x:auto` as the only strategy — port to the card-collapsing
  DataTable (S21), no h-scroll at 360px.
- Totals in **cents, exact** (D-003).

**DO NOT PORT**
- The `.trez-wide` max-width toggle that makes the layout visibly jolt when switching to Reportes
  (`treasury-tab.js:112`).
- Hardcoded hex money colors and `!important` on `.pos`/`.neg`.
- The 3-variant pill overload (semantics carried by variant reuse).

### S54 — Treasury Recurrentes + Por pagar + Notas + Config · §8

**Legacy source of truth:** `js/pages/admin/treasury-tab.js`.

**MUST FIX ON PORT**
- **Auto-materialization of recurring payments:** `ensureRecurringForMonth` INSERTs expense rows into
  `fin_expenses` as a side effect of opening/refetching a month (`treasury-tab.js:379-401`). The port's
  `materializeRecurring(month)` must be **idempotent** AND the generated rows must carry a **visible
  system-generated marker** in the table — the treasurer view has none (the leader view marks with a
  lock). Reconsider write-on-navigation.
- **Weekly/Yearly recurrence is creatable but never materialized** — `ensureRecurringForMonth` filters
  `.eq('frequency','monthly')` (`treasury-tab.js:385`), so weekly/yearly rows generate **no expense** and
  the books silently under-report. Implement weekly/yearly materialization or **remove those options**.
- **Recurrentes "Activo" column has no toggle** — the wizard never edits `active` (`WIZ.recurring`
  `toData`/`toPayload` omit it). Provide activate/deactivate.
- **Por pagar:** add **overdue emphasis** (a bill months overdue looks identical to one due next week)
  and an archive/filter for paid payables (the list only grows; paid rows persist).
- **Config empty state** is a bare inline-styled `<p class=muted>` (`treasury-tab.js:318`) — unify with
  the shared empty-state component.
- `fund.restricted` / `fund.opening_balance` and expense-category `group_name` are captured & displayed
  but **used in no calculation** — implement fund running-balances / category grouping, or drop the
  fields (do not port inert data).

**DO NOT PORT**
- The 3-variant pill overload.
- Write-on-navigation without a system-row marker.

### S55 — Treasury Reportes (report builder + live preview) · §9  ·  **OVER-VERIFY**

**Legacy source of truth:** `js/pages/admin/report-builder.js`, `css/pages/admin/report-builder.css`.

**MUST FIX ON PORT**
- **Loading and error are the same `.rb-loading` element** differing only by sentence
  (`report-builder.js:67` and `:245`) — give loading and error **distinct designed states**, with a
  retry on error.
- **Responsive:** below 900px the rail and the preview stack, so controls and the document they drive are
  **never on screen together** (`report-builder.css:100`) — provide a bottom-sheet / tabbed /
  floating-control solution.
- **"Secciones" is the primary control** but is collapsed-by-default and styled as a filter button
  (`report-builder.js:186`) — make it prominent (Disclosure, not a filter chip).
- **Export failure uses a raw `alert()`** (`report-builder.js:407`) — route through the unified Toast.
- The rail is a **third independent form vocabulary** (`.rb-input`/`.rb-seg`/`.rb-check`/`.rb-filterbtn`)
  — reconcile with SegmentedControl/Disclosure/Button (S21) or deliberately spec a denser document-tool
  rail.
- **Decide the half-built customization surface:** config carries `accent`/`density`/`paper`/`orientation`/
  `sample` with **no controls**. Default to **deletion** (delete `density` + `sample` + the swatch CSS);
  if `accent`/`paper`/`orientation` are wanted, expose them as a designed "Apariencia" group — but the
  **preview == download** byte-parity requirement pushes toward deletion.
- Money summed as floats (`report-builder.js:131-134`) → integer cents (D-003; approved golden diff).
- **Preview == download, byte-for-byte** (over-verify).

**DO NOT PORT**
- `config.density` (assigned at `:61`, never read).
- `config.sample` mode + `sampleYear()` + `sampleCache` (`report-builder.js:35, 102-103, 138-157`) —
  unreachable.
- `.rb-swatches` / `.rb-swatch` accent-picker CSS (`report-builder.css:51-53`) — no JS emits it.
- The collapsed-filter treatment of Secciones.
- `renderReports()` + `printReport()` (`treasury-tab.js:443-541`) — the dead `window.print()` yearly
  report; do not re-implement (dead-code table).

### S56 — Ministry/project treasury · §10

**Legacy source of truth:** `js/pages/admin/project-treasury.js`.

**MUST FIX ON PORT**
- The movements-table **`⋮` kebab is wired DIRECTLY to delete** (`project-treasury.js:271-281`) — it
  looks like a "more actions" menu but is a one-tap delete, and there is **no edit path at all** (only
  delete + re-add). Port to the real ActionSheet with **Editar + Eliminar** and add an edit flow.
  (**Brief correction:** the delete **is** gated by `confirm()` (`:322-323`) — this is a bad affordance,
  not an unconfirmed delete; §10 overstates it.)
- **NO error state anywhere:** `loadProjects` (`:60`), `projectTotals` (`:132`), `ministryBudgets`
  (`:168`), `renderResumen` (`:189`), and `renderProject` (`:237`) all ignore `.error` and fall back to
  empty/0 — a failed fetch renders **$0.00** as though the ministry has no money. Add loading/empty/ERROR
  to every async view (mirror the `errBox` guard the treasurer view already uses). (Verdict: this was
  considered as a legacy fix and **rejected** — a failed read leaks nothing and blocks nothing, and RLS
  denials return empty with no error — so it is S56 port debt, not a legacy patch.)
- The **"Nuevo" pill mixes a create ACTION into the navigation row** (`project-treasury.js:121`) —
  separate the action from the tabs.
- The **PDF-download icon behaves differently by project type** — ministry budgets open a period-picker
  wizard, other projects download an all-time PDF immediately (`project-treasury.js:282-283`) — with no
  visual distinction. Make the affordance honest.
- **Terminology drift:** the empty state says "Crea una carpeta (proyecto)…" (`project-treasury.js:220`)
  while every other label says "proyecto". Pick one word.
- Movements table is **all-time, unpaginated, unfiltered** — a multi-year ministry renders every row. Add
  paging/filter.
- `ensureMinistryProjects` auto-INSERTs `fin_projects` rows as a side effect of loading, inside a
  try/catch that **swallows ALL errors silently** (`project-treasury.js:78-108`) — make budget-tab
  creation explicit/idempotent and do not swallow genuine failures.
- **Lopsided header** when the month picker is force-hidden (`project-treasury.js:49-50` hides it via
  inline `style`) — design a proper header for this role.
- Consider **Resumen roll-up KPIs** (no total across the leader's budgets today).

**DO NOT PORT**
- The kebab-equals-delete interaction (must become a menu).
- The silent empty-on-error behavior (every query ignoring `.error`).
- The inline `style.display='none'` DOM mutation of the shared month-picker.
- Hardcoded `PALETTE` hexes and `.pos`/`.neg` color literals — use money tokens.

### S57 — Admin Registraciones: list + form + age groups + images · §6

**Legacy source of truth:** `js/pages/admin/special-events-tab.js`, `css/pages/admin/special-events.css`.

**MUST FIX ON PORT**
- **Status system:** `statusBadge` (`special-events-tab.js:124-133`) maps 4 lifecycle states
  (open/closed/completed/finished) to only `cat--servicio`/`cat--otro`, so closed/completed/finished all
  render the same gray. Port to the StatusBadge primitive with 4 visually-distinct AA states.
- **Age-group editor rows are built with raw inline `style="…"` strings** (`renderAgeGroupEditor`
  357-365: color swatch, name, min, max, trash) and the empty hint uses inline style too (`:354`).
  Rebuild as real classed components.
- **List registration-count fetch silently swallows its error:**
  `const { data: regs } = await sb.from('event_registrations').select('event_id')` (208-211) discards
  `error`; on any failure every card shows **"0 inscritos"**. Surface unknown/"—" rather than a
  misleading zero (mirror the detail view, which **does** check error). (Verdict: not a legacy fix — a
  summary count, recoverable via the detail view, kept fresh by realtime.)
- Keep the create/edit **form-card** here (group creation elsewhere is a wizard — the form-card is right
  for this), but drive validation/loading/error through the shared primitives, not ad-hoc
  `errEl.style.display` toggling (`saveEvent` 389-437).

**DO NOT PORT**
- Module state `sortKey`/`sortDir` (36-37) — never read; drop it.
- The stale file-header comment claiming a "registrations table (filter/sort/export/print)"
  (`special-events-tab.js` 4-8; `special-events.css` 1-4) — the feature does not exist.
- The dead `special-events.css` blocks (`.se-reg-table` + its ≤1100px card-transform, `.se-th-sort`/
  `.se-sort`, `.se-filter-bar`/`.se-filter-date`, `.se-collapse`, `.se-switch`/`.se-toggle-row`,
  `.se-detail__meta`, `.se-hint`, `.se-nowrap`, `.se-email`, `.se-rowact`, `.se-evcard.is-cancelled`).
  Rebuild only what a real search/filter/sort uses (dead-code table).

### S58 — Admin Registraciones: detail + realtime + PDF/CSV exports · §6  ·  **OVER-VERIFY**

**Legacy source of truth:** `js/pages/admin/special-events-tab.js` (`renderRegistrations`,
`currentRows` 568-574, `showRegInfo` 652-712, `startRegsRealtime`/`stopRegsRealtime` 554-565).

**MUST FIX ON PORT**
- `#seRegTable` (`admin/index.html:524`) is named a "table" but `renderRegistrations` emits a **LIST**
  (`se-reglist`) with **NO search, NO filter, NO sort** — `currentRows` hard-sorts by last name. For a
  200-child VBS this is unusable. Decide list-vs-table for that scale and **ADD search/filter/sort**; do
  not port the "table" misnomer without the behaviour.
- **Promote minors' medical/emergency data.** The registrant-detail modal (`showRegInfo` 652-712) renders
  ~13 flat label/value rows with **Alergias** and **Condiciones médicas** (667-668) buried mid-list among
  address/phone/notes. The port must make allergies/medical/emergency a **can't-miss block**, not a middle
  row. (Verdict: not a legacy fix — the data IS shown and IS in the roster PDF/CSV; a visibility/hierarchy
  problem, not exposure.)
- Consolidate the bespoke `.se-menu__pop` Opciones overflow (`wireOptionsMenu` 79-101) into the shared
  ActionSheet — the list kebab already uses the shared action-sheet, so the two menu styles on one screen
  should unify.
- **Realtime teardown:** `startRegsRealtime`/`stopRegsRealtime` (554-565) must be flushed on route-leave
  (no leaked channel) — over-verify.
- CSV (UTF-8 BOM) + roster/cartel/single/waiver PDFs match; **signed waiver reproduced from the frozen
  row** (over-verify, G-006).

**DO NOT PORT**
- The idea that the detail area is a sortable table — it is a list; carry the list model forward
  deliberately, backed by real controls.
- Grouped-registration section headers built with inline `style="…"` strings (`groupedRegsHtml` 638-648)
  — rebuild as classed components (`data-color` via a custom property, not inline style).

### S59 — Designer A1: Fabric loader + engine · §7

**Legacy source of truth:** `js/pages/admin/designer/canvas-engine.js`, `editor.js`, `toolbar.js`.

**MUST FIX ON PORT**
- Remove the dead `class="dz-dark"` and the stale "dark Illustrator-like tool" comments (`editor.js:37`,
  `toolbar.js:2`, the `canvas-engine.js` header) — the stylesheet is entirely light; make a deliberate
  light-vs-dark decision, don't inherit a dead class.
- **Preserve the Fabric engine WRAPPED, not rewritten** (D-011): the coordinate model (logical
  `docW×docH` backing store, zoom scales rendering), the `EXTRA_PROPS` serialization allowlist
  `['id','name','locked','qrData']`, the silent/commit/live/change event bus, magenta `#e5308a` snap
  guides, and the export-resets-to-zoom-1 invariant must survive intact — **over-verify against a golden
  serialization.**
- Keep the `mount.offsetParent`/`isConnected` guards on the global keydown + wheel handlers
  (`editor.js:157, 184`) so a backgrounded editor can never mutate its design.

**DO NOT PORT**
- `class="dz-dark"`.
- The uncalled engine API surface — `engine.change()`, `setDocSize()` — do not port unless a caller is
  introduced (dead-code table).

### S60 — Designer A2: objects + templates + fonts + export · §7

**Legacy source of truth:** `js/pages/admin/designer/templates.js`, the new-design chooser in
`js/pages/admin/designer/index.js`.

**MUST FIX ON PORT**
- The four template previews are **fake CSS wireframes** (`index.js:157-167` emits gray `.dz-tpl__bar`
  bars + a CSS-drawn `.dz-tpl__qr` square; `designer.css:200-204`) — they render the **same** mock
  regardless of template. Show a **real thumbnail** of each template (render the Fabric template to a
  small raster, or ship a baked preview image) since the templates already build real Fabric objects.
- **Keep the event-prefill contract intact:** selecting a `special_event` prefills title/date/location
  and builds the registration QR from `https://www.irdlex.org/eventos/evento-especial.html?e=<slug>`
  (`index.js:16-17`, `eventRegUrl`). This URL is a **live QR target** (D-001) — the ported origin/slug
  format must stay **byte-identical.**
- Keep custom-size clamping (64–6000, `index.js:196-197`) and the create-time guard (`index.js:205`
  rejects with a Spanish message when the session expired — anon has no `designs` policy).

**DO NOT PORT**
- `.dz-tpl__mock` and the wireframe sub-elements — replace with real previews.
- The inline `style="background:#eef0f2;aspect-ratio:…"` on `.dz-tpl__pv` (`index.js:159`).

### S61 — Designer A3: panels + selection + history + toolbar · §7

**Legacy source of truth:** `js/pages/admin/designer/property-panel.js`, `layers-panel.js`,
`toolbar.js`, `editor.js`.

**MUST FIX ON PORT**
- **Duplicate control bug:** for an image or QR selection the panel renders the **Opacity slider TWICE**
  — `imageControls()`/`qrControls()` each include `field('Opacidad', …)` (`property-panel.js:63, 71`) AND
  `render()` appends a second `field('Opacidad', …)` unconditionally (`property-panel.js:101-102`). Render
  opacity **exactly once** per selection.
- **Preserve the live-vs-commit event contract:** dragging a slider emits `live` (peer preview, no
  history); change/blur emits `commit` (history + collab + autosave) — `property-panel.js:106-110,
  122-131`. A naive two-way bind would collapse these and flood history/undo.
- Keep the document-background pseudo-props (`__bgcolor`, `__radius`) behaving as they do
  (`property-panel.js:124-125`) and the QR-content commit that regenerates the QR image (`updateQrData`).
- **Layers:** keep the **z-order translation** between the visual (top-most-first) list and Fabric's
  bottom-first stack (`layers-panel.js:118-123`) — a naive reimplementation inverts layer order.
  Over-verify drag-reorder against a fixture. Preserve lock/hide re-assertion (locked ⇒
  selectable/evented/hasControls false; hidden discards the active object) and that these emit a `full`
  mutation so collab/history resync (`layers-panel.js:71-82`).
- Give the icon-only top-bar controls (`.dz-ic`, ~15 buttons) + popover triggers **accessible names**
  (`title=` only today, `toolbar.js:49-74`); keep the left rail's `aria-label` (`toolbar.js:121`). Add
  `focus-visible` rings to `.dz-ic`/`.dz-tool`/`.dz-btn`/`.dz-lybar__b` (none today).

**DO NOT PORT**
- The bespoke `.dz-field`/`.dz-tbtn`/`.dz-btnrow` form vocabulary — use the unified form controls (S21).
- The `.dz-pop` popover implementation — replace with the shared anchored-menu primitive (S17).
- Hard-coded `--dz-line` (`#111827`) drop-indicator/active colors — re-map to design-system tokens.

### S62 — Designer A4: collab + autosave + teardown · §7  ·  **OVER-VERIFY**

**Legacy source of truth:** `js/pages/admin/designer/editor.js`, `autosave.js`, `collab.js`,
`index.js`, `supabase/migrations/20260702_designs.sql`.

**MUST FIX ON PORT**
- **Undo/redo are hard-DISABLED whenever any peer is present** (`editor.js:121-128` shows an info toast
  and no-ops) because snapshot undo would rebroadcast a stale whole-doc — a user editing collaboratively
  silently cannot undo. S61's snapshot undo/redo + S62 collab must **resolve this deliberately** (a
  command/diff undo that merges), not ship the Phase-1 no-op.
- Preserve the **leader-elected single DB writer** (lowest-presence userId) + LWW-on-`updated_at`
  autosave and the localStorage draft mirror with the `baseUpdatedAt` **version-token** recovery check
  (`autosave.js`; `index.js:236-243`) — do not swap the version-token comparison for a client-vs-server
  clock comparison.
- **Over-verify teardown** flushes autosave, untracks, and removes the realtime channel on route-leave
  (`editor.js:193-204`, `collab.leave`) — the explicit S62 acceptance (no leaked channel).
- **Re-verify the private-channel authorization actually applies** in the target DB: `collab.js` opens
  `design:<id>` with `private:true` relying on `realtime.messages` RLS (`can_join_design_topic`), but that
  policy is installed inside a `do $$ … exception when others` block (`20260702_designs.sql:202-211`) that
  **swallows failure** — if it silently didn't apply, the channel is unprotected. Assert the policy is
  present, don't assume it.

**DO NOT PORT**
- The security-by-obscurity Phase-1 stance as the final state — land the private-channel RLS **verified**,
  not documented-as-TODO.

### S63 — Designer A5: library shell + chooser + share · §7

**Legacy source of truth:** `js/pages/admin/designer/index.js`, `share.js`, `designer.css`.

**MUST FIX ON PORT**
- **Make cards keyboard-activatable:** the `role="button" tabindex="0"` cards (`index.js:104`) have only
  a **click** handler (`index.js:85-88`) — Enter/Space do nothing. Use a real `<button>`/`<a>` or wire
  keydown.
- Replace the raw backend error string `Error: ${error.message}` (`index.js:77`) with human copy + a
  **Retry** affordance; add a card-grid **skeleton** for the "Cargando…" state (`index.js:69`); fold the
  empty state (`index.js:96`) into the empty-with-primary-action design.
- Give the icon-only card actions (Compartir/Duplicar/Eliminar, `.dz-mini`, `index.js:110-114`)
  **accessible names** (they set only `title=`), and ensure the hover-reveal (`.dz-card__acts{opacity:0}`)
  is reachable by keyboard/touch.
- The chooser (760px) and share modals have **no Escape-close and no focus trap** (verified in
  `openChooser` / `share.js`) — must come from the unified **Modal** (S16).
- Preserve the realtime list subscription semantics (`index.js:54-60` subscribes to `designs` +
  `design_shares`, debounced, and **never re-renders while an editor is open**) and the teardown contract
  (`teardownDesigner` removes the channel).
- Keep delete behind **ConfirmDialog** (`index.js:120`) and keep `clearDraft(id)` on delete so the
  localStorage draft mirror is purged.

**DO NOT PORT**
- The bespoke `.dz-modal` system — the chooser/share must use the unified Modal.
- Owner-only gating done purely on the client (`index.js:79-80` `created_by === currentUser.id`) as if it
  were the boundary — it is **UX only**; RLS (`20260702_designs.sql` `designs_delete`/`update`) is the
  guard.
- The uncalled `store.subscribe()` / `store.select()` / `history.commit()` APIs (dead-code table).

---

## Dead code — the deletion list for the port

**Every row below was confirmed unreachable by an agent that read the code** (`confirmedDead: true`),
with the grep/read proof in the last column. This is a **deletion list for the port**, not a licence to
delete from the live legacy tree: per [`README.md`](README.md), *"Legacy files are deleted only in the
cutover PR, never earlier"* — so a `git revert` always restores a working legacy surface. The port simply
**does not re-create** these; the legacy copies are removed with their surface at cutover (`css/admin.css`
and the analytics screen at **S65**).

| # | What | Where | Proof |
|---|---|---|---|
| 1 | `.topbar__user` / `.topbar__logout` (old topbar user-chip + logout icon-button, incl. `:hover`/`:focus-visible` and the 640px rule) | `css/pages/admin/shell.css:81-123, :464`; override in `users.css:265-271` | grep `topbar__user`/`topbar__logout` across `admin/index.html`, all `*.html`, and `js/` = **0** markup/JS matches; live topbar (`admin/index.html:183-207`) has only `.topbar__title`/`.topbar__right`/`.notif`/`.topbar__bell` — the chip + logout moved to the sidebar footer (`.adm-account*`, `:234-245`). |
| 2 | `.trez-field` / `.trez-field--full` + label/input/focus rules | `css/pages/admin/treasury.css:126-133` | grep `trez-field` across `js/`, `admin/`, `src/` = **none**; appears only in the stylesheet. No generated markup emits `class="trez-field"`. |
| 3 | `setPref(key, value)` — the only writer of localStorage `ird.admin.prefs` | `js/pages/admin/prefs.js:47` | grep `setPref(` across `.js`/`.html` (excl. its definition) = **0 callers**. With no caller the prefs blob is never written → theme/density/reduceMotion/landing stay at defaults. |
| 4 | `landingOptions()` — access-aware landing-tab choice list | `js/pages/admin/prefs.js:80` | grep `landingOptions` (excl. definition) = **0 callers**; exists only to feed a Preferences UI that is never rendered. |
| 5 | Compact-density CSS hooks (`.acct-card`/`.acct-kv`/`.acct-grid` overrides) | `css/pages/admin/account.css:220-223` | Match only under `body.adm-density-compact`, toggled by `applyPrefs()` from `getPrefs().density`; `density` is only set via `setPref` (no caller) → class always removed → rules never apply. |
| 6 | Reduce-motion kill-switch (`body.adm-reduce-motion *`) | `css/pages/admin/account.css:226-232` | Match only under `body.adm-reduce-motion`, toggled from `getPrefs().reduceMotion`; only writable via `setPref` (no caller); default false → class never added. |
| 7 | `renderReports()` — legacy yearly-report screen (12-bar SVG chart, month accordion, year table) | `js/pages/admin/treasury-tab.js:443-500` | grep `renderReports` tree-wide = **1 hit** (its own def); the dispatch maps `reports: mountReportBuilder` (`:114`), not `renderReports`. Nothing else calls it. |
| 8 | `printReport()` — `window.print()`/new-window print path | `js/pages/admin/treasury-tab.js:503-541` | Only caller is `renderReports` (`:499`), itself dead → transitively unreachable. The only `window.print()` path in treasury (S55 drops it). |
| 9 | CSS for the dead report screen: `.trez-rchart*`, `.trez-report*`, `.trez-rtoolbar` | `css/pages/admin/treasury.css:168-193` | Emitted only by the HTML strings inside `renderReports` (`:457-493`); since that is unreachable, no live DOM carries these classes. |
| 10 | `config.density` — report-builder config field | `js/pages/admin/report-builder.js:61` | grep `density` in the file = **1 hit** (the assignment); never read in `buildDocDef`/`buildPdfContent` or any control. |
| 11 | Sample/demo-data mode: `config.sample` branch + `sampleYear()` + `sampleCache` | `js/pages/admin/report-builder.js:35, 102-103, 138-157` | `config.sample` init `false` (`:59`), read at `:102`, but **no control/handler ever sets it true** — the branch and generator are unreachable. |
| 12 | `.rb-swatches` / `.rb-swatch` accent-picker CSS | `css/pages/admin/report-builder.css:51-53` | grep `swatch` in `report-builder.js` = **nothing**; no JS emits swatch markup (`config.accent` is hardcoded `#394548`). |
| 13 | The dead registrations table/filter/sort/toggle surface: `.se-reg-table` (+ ≤1100px card-transform), `.se-th-sort`/`.se-sort`, `.se-filter-bar`/`.se-filter-date`, `.se-collapse`, `.se-switch`/`.se-toggle-row`, `.se-detail__meta`, `.se-hint`, `.se-nowrap`, `.se-email`, `.se-rowact`, `.se-evcard.is-cancelled` | `css/pages/admin/special-events.css:38-261` | grep each class across `admin/index.html` **and** `special-events-tab.js` = **0/0** for every one. The JS renders a `se-reglist` of `se-regrow` rows, never a table; no filter/sort/switch UI exists. |
| 14 | Module state `sortKey` / `sortDir` in the registrations tab | `js/pages/admin/special-events-tab.js:36-37` | grep `sortKey`/`sortDir` across `js/` = only the two `let` declarations; never read. `currentRows()` hard-sorts by last name. |
| 15 | `#dscpPoolHint` write in `boot()` + `.dscp-pool__hint` CSS | `js/pages/admin/discipleship-tab.js:83-90`; `css/pages/admin/discipleship.css` | grep `dscpPoolHint` = **1 hit** (the `getElementById` write target); `grep -c dscpPoolHint admin/index.html` = **0**, `grep -c dscp-pool__hint admin/index.html` = **0** — no such element/class in the live page. The `if (hint)` block never runs. |
| 16 | Past-events **table** path: `buildEventsTableHtml()` + `renderPastFiltered()` + `table.css` | `js/pages/admin/events-tab.js:161, :140`; `css/pages/admin/table.css` | grep `pastList` in `admin/index.html` = **0**; `renderPastFiltered`/`loadPast` early-return on `if (!el) return`; `buildEventsTableHtml` is called only by `renderPastFiltered`. `table.css` styles only `.events-table`, emitted only by the dead builder. *(Note: `loadPast()` is still **invoked** at `:302` but no-ops — the symbol is referenced; the table path is unreachable.)* |
| 17 | Bulk-create event form `#view-bulk` + logic (`_initBulkForm`, `_addBulkDate`, `_updateBulkSummary`, `showView('bulk')`) | `admin/index.html:343`; `js/pages/admin/event-form.js:237-305, :252` | `showView('bulk')` is called only from the `bulkEventBtn` handler; grep `bulkEventBtn` = only `event-form.js:238` (the `addEventListener`) — the id is absent from `admin/index.html`, so the handler never binds and `#view-bulk` is unreachable. |
| 18 | The **create-new** single-event entry (`newEventBtn` handler) | `js/pages/admin/event-form.js:134-153` | grep `newEventBtn` = only `event-form.js:134`; absent from `admin/index.html`, so the handler never binds. **`#view-form` itself is NOT dead** — it is reachable via `openEditSpecial` (`:189`); port the **edit** path and drop only the create-new entry. |
| 19 | `.gal-dropzone__hint` — styled but never rendered | `css/pages/admin/gallery.css:193-199` | grep `gal-dropzone__hint` across `*.js`/`*.html` = **0**; the live dropzone emits `__inner`/`__title`, never `__hint`. |
| 20 | `analytics-tab.js` — the entire "Analíticas" screen; Analytics block in `platform.css` | `js/pages/admin/analytics-tab.js`; `css/pages/admin/platform.css:208` | Never imported (grep across `js/` = no import); no `data-tab='analytics'` in `admin/index.html`; `index.js` `initTabs({…})` never passes `onAnalytics`; `loadAnalytics` reads `#analyticsBody`, absent from the HTML. Fully unwired. |
| 21 | `css/admin.css` — orphaned 4,887-line duplicate of `platform.css` | `css/admin.css` | `scripts/build.sh` builds only `css/style.css`, skips `css/pages/admin`, has no `admin.css` target; `admin/index.html` links each `css/pages/admin/*.css` individually and **not** `css/admin.css`; grep finds it only in stale docs. (Already flagged in CLAUDE.md §3; deleted at **S65**.) |
| 22 | `class="dz-dark"` on the designer editor root + "dark Illustrator-like tool" comments | `js/pages/admin/designer/editor.js:37` (comments `toolbar.js:2`, `canvas-engine.js` header) | grep `dz-dark` across css/js/html = **1 hit** (`editor.js:37`); there is no `.dz-dark` selector anywhere (`designer.css` is entirely light). Styles nothing. |
| 23 | `engine.change()` — public no-op wrapper `() => emit('change')` | `js/pages/admin/designer/canvas-engine.js:75` (exposed `:215`) | grep `engine.change(` across the designer tree = **0 call sites**; mutations call `emit('change')` directly. |
| 24 | `engine.setDocSize(w,h)` — resize a document after creation | `js/pages/admin/designer/canvas-engine.js:140` (exposed `:218`) | grep `setDocSize` tree-wide = only the definition + export entry; no invocation. Doc size is fixed at create time; no UI changes it. |
| 25 | `store.subscribe()` / `store.select()` on the editor pub/sub store | `js/pages/admin/designer/store.js:24, 27` (returned `:30`) | grep in the designer tree = only `store.js` internals; the editor consumes only `store.get()`/`store.set()`. Both public methods dead. |
| 26 | `history.commit()` — flush the pending debounced snapshot | `js/pages/admin/designer/history.js` (returned from `createHistory`) | grep `history.commit`/`.commit()` in the designer tree = **0 external call sites**; `editor.js` uses only `reset`/`undo`/`redo`/`onChange`/`canUndo`/`canRedo`/`destroy`. |

### Unverified — check before deleting

The brief (or a naive grep) called these dead, but an agent that read the code found them **live,
inert-but-reachable, or unverifiable**. Do **not** delete on the brief's word.

| What | Where | Reality |
|---|---|---|
| `autoBalance()` / `grid-balance.js` | `js/pages/admin/grid-balance.js`, called `dashboard.js:80` + `ministries.js:45` | **LIVE**, not dead — runs on every dashboard/ministries render and on window resize. The Appendix's "verified unreachable" is wrong. Replace with pure CSS (S41/S44); do not delete blindly. |
| Green `#72BB72` "done" progress dot | `css/pages/admin/wizard.css:56`; class emitted `js/pages/admin/form-wizard.js:66` | **REACHABLE** — `form-wizard.js:66` emits ` done` on completed steps, so every advanced Treasury wizard renders it. **Re-theme to slate** (S11/S21), don't delete. |
| `applyLandingPref()` | `js/pages/admin/prefs.js:72` | Invoked (`auth.js:410`) so **referenced**, but returns early while `landing==='inicio'`, and `landing` is only set via the callerless `setPref` → **live-but-inert**. Resolve with the prefs UI (S45). |
| Weekly/Yearly recurring frequencies | `js/pages/admin/treasury-tab.js:220-223` vs `:385` | Not unreachable code — the rows render; but the frequency **never materializes an expense** (`.eq('frequency','monthly')`). Behaviour-dead feature → implement or remove the options (S54). |
| `fund.restricted` / `fund.opening_balance` | `js/pages/admin/treasury-tab.js:273-278, :303` | Captured **and displayed**, but used in no calculation. Inert data, not dead code — use or drop (S53/S54). |
| Expense-category `group_name` | `js/pages/admin/treasury-tab.js:289-293, :306` | Captured and displayed; expenses group by category **name**, never `group_name`. Inert — use or drop (S54). |
| `fin_funds` as income "Fondo" selector | `js/pages/admin/treasury-tab.js:177` vs `:66-72` | `FUNDS` is genuinely used in Configurar; the funds-as-picker feature is simply **unbuilt** (income Fondo is free text). Not dead — build the select or keep free text deliberately (S53). |
| `config.paper` / `config.orientation` | `js/pages/admin/report-builder.js:377-378` | **Read** by `buildDocDef`, but never varied from `letter`/`portrait` defaults. Inert config, not dead code — expose or hardcode (S55). |
| `.dscp-card__status--*` / `.dscp-int__status--*` | `css/pages/admin/discipleship.css` | **USED** — class names are assembled at runtime (`dscp-card__status--${g.status}` at `discipleship-tab.js:156`; `dscp-int__status--${i.status}` at `:722`). A literal grep misses them. **Do not delete.** |
| `activity-tab.js` `fin_budgets` entity map (`'un presupuesto'`) | `js/pages/admin/activity-tab.js:28` | The `fin_budgets` table was dropped (`20260630_drop_fin_budgets.sql`), so no **new** audit rows use it — but pre-drop **historical** `audit_log` rows may. Unverifiable from the repo. Drop the mapping only after confirming zero historical rows reference it (else those rows fall back to the generic "un registro"). |

---

## Highest-risk ports

These need **over-verification** — a golden/parity gate, not just a smoke test. The first three carry
the roadmap's own **over-verify** flag; the rest are added because the source analysis shows a
security boundary, money correctness, or a silent-corruption risk.

1. **S39 — MFA enforcement (security).** The single behaviour a faithful port must **not** reproduce is
   optional MFA (`routeAfterLogin` → `bootApp` with no challenge). The real fix is the **`aal2` RLS
   migration** (D-010), not a client redirect — client gating is bypassable. Verify a returning enrolled
   account cannot reach any `/admin/*` at `aal1`, and that RLS (not JS) denies at `aal1`. Also preserve the
   two anti-enumeration behaviours (forgot-password "Si la cuenta existe…", `token_hash`+`verifyOtp`).

2. **S51 — the escaping dual-fix (security/PII).** The one finding that lands in **legacy now** and mirrors
   into the port. Ship the reproducing check (`preferred_day` = `<img src=x onerror=…>` → no live element)
   in **both** codebases; legacy has no test harness, so realistically a documented manual reproduction.

3. **S53 / S52 — treasury money in cents (D-003).** Float→cents is an **approved golden diff**, not a
   silent change. `formatUSD` must match legacy `fmt` for whole & fractional; `sumC` exact vs
   hand-computed. Any drift is a real financial defect.

4. **S55 — Treasury Reportes (over-verify, roadmap-flagged).** **Preview == download, byte-for-byte.**
   The dead `sample`/`density`/`swatch` config must be **deleted here**, not carried; distinct loading≠error
   states with retry; float→cents rides the same golden.

5. **S58 — Registraciones detail + exports (over-verify, roadmap-flagged).** **Signed waiver reproduced
   from the frozen row** (G-006); CSV must carry the UTF-8 BOM; roster/cartel/single PDFs match. Separately,
   this screen holds **minors' medical/allergy/emergency data** — the port must promote it to a can't-miss
   block and must never `{@html}` a registrant field. Realtime teardown must leak no channel.

6. **S59 / S61 — Fabric engine wrapped, not rewritten (D-011).** Over-verify against a **golden
   serialization**: the `docW×docH` coordinate model, the `EXTRA_PROPS` allowlist, the
   silent/commit/live/change bus, snap guides, and export-resets-to-zoom-1. The **z-order translation**
   (visual top-first ↔ Fabric bottom-first, `layers-panel.js:118-123`) inverts layer order if
   reimplemented naively — fixture-test drag-reorder. And **fix the duplicate Opacity slider** (S61), which
   a faithful port would otherwise reproduce.

7. **S62 — Designer collab (over-verify, roadmap-flagged).** Teardown must **flush + untrack + remove the
   channel** on route-leave (no leaked channel). The private-channel RLS (`can_join_design_topic`) is
   installed inside a `do $$ … exception when others` block that **swallows failure** — the port must
   **assert the policy is present**, not assume it, and must land it verified rather than as a Phase-1
   security-by-obscurity TODO. Resolve undo-disabled-under-collab deliberately.

> **Freeze reminder.** `MIGRATION.md §1` records an active **VBS/registration-season freeze** on cutting
> over `/admin` and `eventos/registro`. All admin surfaces above stay behind `/app` during the freeze;
> only the S51 legacy-critical escaping fix lands in the live tree, with its reproducing check
> (`DUAL-MAINTENANCE.md`). Everything else here is realized **in the port**.
