# Admin redesign — paste-ready session prompts

One prompt = one session = one branch = one PR. Every prompt is intentionally short: the detail
lives in the specs it points at (`DESIGN-SYSTEM.md`, `PORT-DEBT.md`, the `ROADMAP.md` row). A fresh,
memoryless session reads those and has everything it needs.

## How to run these

- **Order matters.** The **Spine** (foundation) is strictly sequential — each prereq must be ✅ on
  the `MIGRATION.md` status board before the next starts. The **Pages** fan out in parallel *only
  after* their spine prereqs are done.
- **You cannot start with a page.** Redesigning tabs before the component library exists (S11–S21)
  is how you get ten different button styles. Foundation first. This is not optional.
- **One PR per session**, branch `migrate/Sxx-<slug>`, squash-merged. A revert = a per-surface
  rollback. Never commit straight to `main`.
- **The freeze still applies.** Building under `/app` staging is fine year-round. *Cutting over*
  `/admin` to the live URL happens last and off-season (S64). Nothing here cuts over.
- Paste **one block** into a fresh session. Do not batch two sessions into one.

## The reusable header (already baked into every block below)

Each block already contains the `SESSION START` protocol from `README.md`. If you write your own,
this is the shape:

```
Rewrite session Sxx (<slug>). First read, in full: MIGRATION.md (§0 TL;DR, §2 decisions, §3
gotchas, §1 current state), the Sxx row of docs/migration/ROADMAP.md, CLAUDE.md, and the specs this
session consumes (named below). Confirm Sxx's prereqs are ✅ on the status board — if any is not,
STOP and tell me. Create docs/migration/sessions/Sxx-<slug>.md from SESSION-TEMPLATE.md, then
restate the goal, in/out of scope, and acceptance criteria back to me BEFORE editing code. Stay in
scope. Run the docs/migration/VERIFICATION.md gate before finishing. Update MIGRATION.md in the
same PR (append-only). One PR on branch migrate/Sxx-<slug>.
```

---

# GROUP 0 — THE SPINE (sequential · run in this exact order · one at a time)

Nothing admin renders until these land. S01→S06 is plumbing; S11→S21 is the design system that
kills the slop; S37→S40 is the admin frame. Do not parallelize inside this group.

### ▶ S01 — RLS audit + committed schema baseline · prereqs: none · **run this first, today**
```
Rewrite session S01 (rls-baseline). Read MIGRATION.md (§0/§2/§3/current state), the S01 row of
docs/migration/ROADMAP.md, docs/migration/sessions/S01-rls-baseline.md, and CLAUDE.md. Restate
scope back to me before touching anything. GOAL: run supabase/rls-audit.sql; supabase init+link;
write supabase/migrations/00000000000000_baseline.sql from a db dump so `supabase db reset` applies
the baseline + the existing migrations clean, and is_admin()/my_ministry_id() are present. This
closes G-004 — nothing typed can be trusted before it. Out of scope: any UI, any redesign. Run the
VERIFICATION.md gate. Update MIGRATION.md. One PR: migrate/S01-rls-baseline.
```

### ▶ S02 — SvelteKit + adapter-static scaffold in `web/` · prereqs: none
```
Rewrite session S02 (sveltekit-scaffold). Read MIGRATION.md, the S02 row of ROADMAP.md,
docs/migration/sessions/S02-sveltekit-scaffold.md, and CLAUDE.md. Restate scope first. GOAL:
scaffold web/ (package.json, svelte.config.js — adapter-static, tsconfig strict, vite.config.ts,
src/app.html), a hello route, static/.nojekyll, so `cd web && BASE_PATH=/app npm run build` emits
web/build/ under /app and `npm run check` is clean under strict. Do NOT touch the legacy site. Run
the gate. Update MIGRATION.md. One PR: migrate/S02-sveltekit-scaffold.
```

### ▶ S03 — Merged deploy: legacy + `/app` in one artifact · prereqs: S02
```
Rewrite session S03 (merged-deploy). Read MIGRATION.md, the S03 row of ROADMAP.md, and §4 of
MIGRATION.md (how prod deploys today). Restate scope. GOAL: add a SvelteKit build stage to
.github/workflows/deploy.yml that copies web/build/* → ./app/, keeping the legacy pipeline and CNAME
untouched, so the artifact contains both the unchanged root index.html and app/index.html with
assets resolving under /app. Do not change any legacy file's behavior. Run the gate. Update
MIGRATION.md. One PR: migrate/S03-merged-deploy.
```

### ▶ S04 — Config/secrets → `$env` PUBLIC_* · prereqs: S02
```
Rewrite session S04 (config-env). Read MIGRATION.md (D-007), the S04 row of ROADMAP.md. Restate
scope. GOAL: web/src/lib/config.ts from $env/static/public; web/.env; the secret→PUBLIC_* env block
in deploy — such that a missing required PUBLIC_ var FAILS the build (no silent nullable client).
No service-role key ever reaches the browser. Run the gate. Update MIGRATION.md. One PR:
migrate/S04-config-env.
```

### ▶ S05 — Test harness + governance bootstrap · prereqs: S02
```
Rewrite session S05 (test-harness). Read MIGRATION.md, the S05 row of ROADMAP.md, and
docs/migration/VERIFICATION.md. Restate scope. GOAL: Vitest (+ jsdom per G-001, coverage-v8),
Playwright, tests/fixtures/, a golden-master helper, and a CI gate (check + lint + test + build)
plus a check that PRs labeled `migration` touch MIGRATION.md — all green on a scratch PR. This is
the harness the DUAL-FIX-BACKLOG.md tests (D-012) land in. Run the gate. Update MIGRATION.md. One
PR: migrate/S05-test-harness.
```

### ▶ S06 — Typed Supabase client · prereqs: S01, S04
```
Rewrite session S06 (typed-client). Read MIGRATION.md (D-002), the S06 row of ROADMAP.md. Restate
scope. GOAL: web/src/lib/db/client.ts (non-nullable, browser-guarded) + generated
database.types.ts (supabase gen types --local); npm @supabase/supabase-js — so
supabase.from('events') compiles under strict and prerender opens no socket. RLS stays the guard;
client stays anon-key. Run the gate. Update MIGRATION.md. One PR: migrate/S06-typed-client.
```

### ▶ S11 — Design tokens + theme · prereqs: S02 · **the anti-slop foundation**
```
Rewrite session S11 (design-tokens). Read MIGRATION.md (D-014, D-015, D-016, D-017 — these LOCK the
token decisions), the S11 row of ROADMAP.md, and docs/migration/DESIGN-SYSTEM.md §Tokens + §Dark
mode IN FULL. Restate scope. GOAL: port the token families to src/lib/styles/tokens/* → app.css and
a theme.ts (data-theme + no-FOUC inline script). NON-NEGOTIABLE per the locked decisions: the admin
palette is neutral slate scoped to the (admin) route group (D-014) — no gold/amber/teal accent; the
type scale is re-tuned MONOTONIC, not ported as-is (D-015); semantic money tokens replace the hex
literals (D-016); ONE dark-mode mechanism keyed on data-theme, and the ~27 legacy
prefers-color-scheme blocks are bugs, never ported (D-017). Done when var(--fs-lg) resolves and
light/dark/system flips the palette with no reload flash. Run the gate. Update MIGRATION.md. One PR:
migrate/S11-design-tokens.
```

### ▶ S12 — Global CSS baseline + a11y · prereqs: S11
```
Rewrite session S12 (css-baseline). Read MIGRATION.md, the S12 row of ROADMAP.md, and
docs/migration/DESIGN-SYSTEM.md §Aesthetic contract + §State system. Restate scope. GOAL:
base/layout/utilities globals; a prefers-reduced-motion block; ≥16px mobile inputs (iOS zoom guard);
reduced-motion.ts. Desktop-first, breakpoints 900/768/640/480 only. Done when reduce-motion kills
transitions and mobile inputs compute ≥16px. Run the gate. Update MIGRATION.md. One PR:
migrate/S12-css-baseline.
```

### ▶ S13 — Icon (Font Awesome + SVG sprite) · prereqs: S12
```
Rewrite session S13 (icon). Read the S13 row of ROADMAP.md and docs/migration/DESIGN-SYSTEM.md
§Icon. Restate scope. GOAL: Icon.svelte; sprite injected once (replaces load-icons.js);
<Icon set="fas"/> and <Icon set="sprite"/> render; a `label` prop toggles aria-label/aria-hidden
(every icon-only control gets an accessible name — a hard rule from the aesthetic contract). Run the
gate. Update MIGRATION.md. One PR: migrate/S13-icon.
```

### ▶ S14 — Button + Card + IconButton · prereqs: S13
```
Rewrite session S14 (button-card). Read the S14 row of ROADMAP.md and docs/migration/DESIGN-SYSTEM.md
§Button, §IconButton, §Card (build the FULL state matrix each specifies: default/hover/focus-visible/
active/disabled/loading). Restate scope. GOAL: Button.svelte, IconButton.svelte (ONE icon-button —
retires the legacy .icon-btn__admin / .adm-icon-btn duplication), Card.svelte. href→<a> else
<button>; visible focus-visible ring; no hover-only affordances. Run the gate. Update MIGRATION.md.
One PR: migrate/S14-button-card.
```

### ▶ S15 — Unified Toast (success/error/info/undo) · prereqs: S13
```
Rewrite session S15 (toast). Read the S15 row of ROADMAP.md and docs/migration/DESIGN-SYSTEM.md
§Toast. Restate scope. GOAL: a toast store + <ToastHost> that RETIRES BOTH legacy toast systems
(admin toast() and public showToast()), covering success/error/info AND a new `undo` variant
(several destructive admin actions today have only a confirm and no undo). error = role=alert;
auto-dismiss + manual close. Run the gate. Update MIGRATION.md. One PR: migrate/S15-toast.
```

### ▶ S16 — Modal + ConfirmDialog · prereqs: S15, S14
```
Rewrite session S16 (modal). Read the S16 row of ROADMAP.md, docs/migration/DESIGN-SYSTEM.md §Modal
(variants: standard/wide/confirm/tool) + §ConfirmDialog, and G-009 in MIGRATION.md (legacy shares
global modal IDs — every ported overlay owns LOCAL state, no shared global IDs). Restate scope.
GOAL: Modal.svelte (bind:open, Escape/backdrop close, scroll-lock+restore) and a confirm singleton
store + <ConfirmHost> where `await confirm()` resolves and confirm stacks above a modal. This ONE
system replaces the legacy .modal, .dz-modal, and .wizard-backdrop. Run the gate. Update
MIGRATION.md. One PR: migrate/S16-modal.
```

### ▶ S17 — ActionSheet · prereqs: S13
```
Rewrite session S17 (action-sheet). Read the S17 row of ROADMAP.md and docs/migration/DESIGN-SYSTEM.md
§ActionSheet. Restate scope. GOAL: ActionSheet.svelte — desktop popover that anchors + repositions,
mobile bottom sheet ≤640px, role=menu. This ONE menu replaces all four legacy implementations
(showActionSheet, .se-menu__pop, .dscp-member-pop, .dz-pop). Run the gate. Update MIGRATION.md. One
PR: migrate/S17-action-sheet.
```

### ▶ S18 — RichTextEditor + {@html} rule · prereqs: S13, S14
```
Rewrite session S18 (rich-text). Read the S18 row of ROADMAP.md, docs/migration/DESIGN-SYSTEM.md
§Form vocabulary (rich-text), and D-005 in MIGRATION.md. Restate scope. GOAL: RichTextEditor.svelte
reusing the ported sanitize-html; sanitized on save AND render; no cursor jump; plus a CI lint rule
that blocks raw {@html} unless the value is sanitizeHtml()/renderRichText() output. Run the gate.
Update MIGRATION.md. One PR: migrate/S18-rich-text.
```

### ▶ S19 — SignaturePad · prereqs: S12
```
Rewrite session S19 (signature-pad). Read the S19 row of ROADMAP.md. Restate scope. GOAL:
SignaturePad.svelte wrapping the ported canvas controller — draws hi-DPI; toDataURL() trimmed PNG;
clear/loadDataURL/isEmpty exposed. Needed by the waiver flow (S33, S58). Run the gate. Update
MIGRATION.md. One PR: migrate/S19-signature-pad.
```

### ▶ S20 — Lightbox · prereqs: S15, S13
```
Rewrite session S20 (lightbox). Read the S20 row of ROADMAP.md and docs/migration/DESIGN-SYSTEM.md
§Lightbox. Restate scope. GOAL: Lightbox.svelte + store (no id-coupled markup) —
openLightbox(photos,i); keys/swipe/fullscreen/share/download; scroll-lock+restore. Run the gate.
Update MIGRATION.md. One PR: migrate/S20-lightbox.
```

### ▶ S21 — Disclosure + DataTable + FormWizard · prereqs: S12 · **the wizard fix**
```
Rewrite session S21 (disclosure-table-wizard). Read the S21 row of ROADMAP.md,
docs/migration/DESIGN-SYSTEM.md §DataTable + §Disclosure + §FormWizard, docs/admin-ux.md, and G-012
in MIGRATION.md (the "done" dot is reachable — re-theme, don't delete). Restate scope. GOAL:
Disclosure.svelte; DataTable.svelte (card-collapse <1100px, NO horizontal scroll at 360px — the
legacy 6-column overflow-x tables are the mobile failure to fix); FormWizard.svelte — ONE
config-driven step machine with a progress indicator that ADAPTS to the step count (legacy hard-codes
4 dots) and ONE review renderer. This retires all four legacy wizards (the treasury one + the three
hand-rolled event/discipleship/gallery duplicates with their window.__wizBack globals). It drives
the field-type contract for every form downstream. Run the gate. Update MIGRATION.md. One PR:
migrate/S21-disclosure-table-wizard.
```

---

# GROUP 1 — ADMIN FRAME (sequential · after the spine · S37→S40)

The shell, the auth gate, the stores, and the repos. Every admin page below sits inside this.

### ▶ S37 — Admin shell & routing skeleton · prereqs: S03, S11 · (brief §1)
```
Rewrite session S37 (admin-shell). Read MIGRATION.md, the S37 row of ROADMAP.md,
docs/migration/DESIGN-SYSTEM.md (shell/nav) and the §1 APP SHELL row of docs/migration/PORT-DEBT.md.
Legacy source of truth: css/pages/admin/shell.css, platform.css, js/pages/admin/notifications.js.
Restate scope. GOAL: an (admin) route group (ssr=false + fallback) so /admin/gallery deep-links and
reloads on the static host; the topbar + sidebar + mobile drawer rendered in the neutral-slate admin
palette (D-014). MUST FIX ON PORT: give the topbar real context (a page title — two legacy screens
have none); DROP the amber brand-dot (D-014); delete the orphan .topbar__user/.topbar__logout
concept (do not re-create it); design nav badges for pending work. Run the gate. Update
MIGRATION.md. One PR: migrate/S37-admin-shell.
```

### ▶ S38 — State stores + UI primitive hosts · prereqs: S37, S15, S16
```
Rewrite session S38 (admin-stores). Read the S38 row of ROADMAP.md and D-006 in MIGRATION.md.
Restate scope. GOAL: session/ministries/perms rune stores; perms.tabs derives from the profile;
confirm/toast callable from non-component code. Client gating is UX-only — RLS is the guard. Run the
gate. Update MIGRATION.md. One PR: migrate/S38-admin-stores.
```

### ▶ S39 — Auth flows + MFA enforcement + guards · prereqs: S38, S06 · (brief §2)
```
Rewrite session S39 (admin-auth). Read the S39 row of ROADMAP.md, D-010 in MIGRATION.md,
docs/migration/DESIGN-SYSTEM.md (auth cards) and the §2 AUTH row of PORT-DEBT.md. Legacy source:
js/pages/admin/auth.js, mfa.js, css/pages/admin/auth.css. Restate scope. GOAL: port
login/invite/recovery/boot + a proper one-time-code input for MFA; a returning enrolled account
cannot reach any /admin/* at aal1; aal2 enforced in an RLS migration (D-010). MUST FIX ON PORT: unify
the five cards into one rhythm; segmented OTP input; password show/hide + strength on the set-password
flow. DO NOT CHANGE: the forgot-password success message stays deliberately non-committal about
whether the account exists. Run the gate. Update MIGRATION.md. One PR: migrate/S39-admin-auth.
```

### ▶ S40 — Data-layer repos (admin-support) · prereqs: S06
```
Rewrite session S40 (admin-repos). Read the S40 row of ROADMAP.md and G-011 in MIGRATION.md
(cosmetic flags that nothing reads — enforce or drop, don't wire UI to a lie). Restate scope. GOAL:
typed repos/{profiles,ministries,settings,notifications,activity,newsletter,admin}.ts; the
admin-invite edge-fn contract stays byte-compatible. Reads never throw; writes return a result
object. Run the gate. Update MIGRATION.md. One PR: migrate/S40-admin-repos.
```

---

# GROUP 2 — ADMIN PAGES (parallel · once their prereqs are ✅ · one PR each)

These are the "separate admin pages" — run them in any order, in concurrent sessions, once the
frame (S37–S40) and the components they name are done. Each already carries its prereqs.

### ▷ S41 — Dashboard (Inicio) · prereqs: S39, S40 · (brief §3)
```
Rewrite session S41 (dashboard). Read MIGRATION.md, the S41 row of ROADMAP.md,
docs/migration/DESIGN-SYSTEM.md (Card, state system) and the §3 INICIO row of PORT-DEBT.md, plus
G-010 in MIGRATION.md. Legacy source: js/pages/admin/dashboard.js, dashboard.css. Restate scope.
GOAL: the landing screen for every role, in the new component system. MUST FIX ON PORT: give KPIs
hierarchy (not five identical cards); make the event rows either genuinely clickable or clearly not;
a real error state with retry + human Spanish copy (never a raw Postgres string); replace the
autoBalance() JS grid hack with a pure-CSS grid (G-010 — don't port the hack, don't just delete it).
Loading = skeleton, not a bare spinner. Run the gate. Update MIGRATION.md. One PR: migrate/S41-dashboard.
```

### ▷ S42 — Activity + Settings · prereqs: S39, S40 · (brief §15, §16)
```
Rewrite session S42 (activity-settings). Read the S42 row of ROADMAP.md, DESIGN-SYSTEM.md (DataTable,
form vocabulary) and the §15 ACTIVIDAD + §16 CONFIGURACIÓN rows of PORT-DEBT.md, plus G-011. Legacy
source: js/pages/admin/activity-tab.js, settings-tab.js, css/pages/admin/platform.css. Restate scope.
GOAL: the audit log (as a DataTable that card-collapses on mobile) and the settings screen (in the
ONE form vocabulary — retire .settings-field). MUST FIX ON PORT: any feature flag with no reader
(G-011) is either wired to a real consumer or dropped — ship no toggle that lies. Run the gate.
Update MIGRATION.md. One PR: migrate/S42-activity-settings.
```

### ▷ S43 — Notifications bell · prereqs: S38, S40 · (brief §1)
```
Rewrite session S43 (notifications). Read the S43 row of ROADMAP.md, DESIGN-SYSTEM.md (state system)
and the §1 APP SHELL notification notes in PORT-DEBT.md. Legacy source: js/pages/admin/notifications.js.
Restate scope. GOAL: the realtime-subscribed bell + dropdown. MUST FIX ON PORT: design the missing
loading AND error states (today it renders blank until the first fetch and silently shows a stale
list on failure); keep the unread badge + "Cargar más" pagination. Run the gate. Update MIGRATION.md.
One PR: migrate/S43-notifications.
```

### ▷ S44 — Ministries · prereqs: S38, S40, S16, S17 · (brief §13)
```
Rewrite session S44 (ministries). Read the S44 row of ROADMAP.md, DESIGN-SYSTEM.md (Card, Modal,
ActionSheet) and the §13 MINISTERIOS row of PORT-DEBT.md. Legacy source: js/pages/admin/ministries.js,
css/pages/admin/users.css. Restate scope. GOAL: ministries CRUD in the new system. Unblocks the
events sessions (S48/S49). Run the gate. Update MIGRATION.md. One PR: migrate/S44-ministries.
```

### ▷ S45 — Account + prefs · prereqs: S39, S19 · (brief §17)
```
Rewrite session S45 (account). Read the S45 row of ROADMAP.md, DESIGN-SYSTEM.md and the §17 MI CUENTA
row of PORT-DEBT.md. Legacy source: js/pages/admin/account.js, css/pages/admin/account.css. Restate
scope. GOAL: the profile + per-device prefs screen (localStorage prefs + the data-theme light/dark
override live here). MUST FIX ON PORT: the screen currently has no page title — give it one via the
shell. Run the gate. Update MIGRATION.md. One PR: migrate/S45-account.
```

### ▷ S46 — Gallery · prereqs: S38, S21, S20, S22 · (brief §12)
```
Rewrite session S46 (gallery). Read the S46 row of ROADMAP.md, DESIGN-SYSTEM.md (DataTable/Card,
Lightbox, dropzone) and the §12 GALERÍA row of PORT-DEBT.md. Legacy source: js/pages/admin/gallery-tab.js,
css/pages/admin/gallery.css. Restate scope. GOAL: album + photo management on the new components.
MUST FIX ON PORT: drop the dead .gal-dropzone__hint (never rendered); migrate the hand-rolled gallery
wizard onto FormWizard. Run the gate. Update MIGRATION.md. One PR: migrate/S46-gallery.
```

### ▷ S47 — Users + role presets · prereqs: S44, S40 · (brief §14)
```
Rewrite session S47 (users). Read the S47 row of ROADMAP.md, DESIGN-SYSTEM.md and the §14 USUARIOS
row of PORT-DEBT.md, plus G-009 (shared preset modal IDs) and G-011. Legacy source:
js/pages/admin/users.js, role-presets.js. Restate scope. GOAL: accounts + access-preset management.
MUST FIX ON PORT: the role-preset modal must own local state — no shared global IDs (G-009, which
today makes "save preset" also fire the calendar-preset save). Run the gate. Update MIGRATION.md.
One PR: migrate/S47-users.
```

### ▷ S48 + S49 — Events (calendar, upcoming, form, wizard) · prereqs: S44, S22 then S21 · (brief §4, §5)
```
Rewrite session S48 (events-calendar). Read the S48 row of ROADMAP.md, DESIGN-SYSTEM.md and the §4
CALENDARIO row of PORT-DEBT.md, plus G-012. Legacy source: js/pages/admin/calendar-tab.js,
js/components/CalendarGrid.js, css/pages/admin/calendar-tab.css. Restate scope. GOAL: the month grid
+ day sheet + upcoming list in CalendarGrid's Svelte port. MUST FIX ON PORT: ONE source of truth for
category color (the --cat-* tokens — not the three-way CSS/inline/JS-map drift); replace the
day-sheet onclick-string buttons with the shared ActionSheet; rethink the 2-events-per-cell density;
add a grid loading skeleton; fix the "Selecciona preseleccion:" typo → "preselección". Run the gate.
Update MIGRATION.md. One PR: migrate/S48-events-calendar.

[Then, after S48:] Rewrite session S49 (events-upcoming-form). Read the S49 row of ROADMAP.md and the
§5 PRÓXIMOS row of PORT-DEBT.md. GOAL: the upcoming list + single-event form + bulk form on FormWizard.
DO NOT PORT: the entire dead past-events table (loadPast/buildEventsTableHtml → #pastList, which does
not exist) and all of table.css (confirmed dead — PORT-DEBT deletion list). Fix the .se-evcard
false-affordance (looks clickable, only opens the kebab). One PR: migrate/S49-events-upcoming-form.
```

### ▷ S50 + S51 — Discipleship (groups, then interests) · prereqs: S38, S21, S22 · (brief §11)
```
Rewrite session S50 (discipleship-groups). Read the S50 row of ROADMAP.md, DESIGN-SYSTEM.md and the
§11 DISCIPULADO row of PORT-DEBT.md. Legacy source: js/pages/admin/discipleship-tab.js,
css/pages/admin/discipleship.css. Restate scope. GOAL: groups CRUD on the new components; migrate the
hand-rolled discipleship wizard onto FormWizard; unify .dscp-member-pop onto the shared ActionSheet.
DO NOT PORT: the dead #dscpPoolHint write (element doesn't exist). One PR: migrate/S50-discipleship-groups.

[Then, after S50:] Rewrite session S51 (discipleship-interests). Read the S51 row of ROADMAP.md and
DUAL-FIX-BACKLOG.md DF-001. GOAL: the interests inbox. MUST CLOSE DF-001: the legacy stored-XSS fix
(escaping experience_level/preferred_day/preferred_time — public-submitted free text) must be carried
into the port AND converted into a real Vitest test (per D-012) that proves a <script> payload is
neutralized. This handles minors' PII — treat it accordingly. One PR: migrate/S51-discipleship-interests.
```

---

# GROUP 3 — HARD SUBSYSTEMS (parallel-ish · the riskiest ports · over-verify)

Treasury money math, registration PII/exports, and the Fabric designer. These carry the most
port debt and the roadmap's own "over-verify" flags. Each is one PR; the treasury/designer chains
are internally sequential.

### ▷ S52→S56 — Treasury (repo → books → recurrentes/por-pagar → reportes → ministry view) · (brief §8, §9, §10)
```
Rewrite session S52 (treasury-repo). Read MIGRATION.md (D-003 cents, D-016 money tokens), the S52
row of ROADMAP.md, DESIGN-SYSTEM.md (money tokens, DataTable) and the §8/§9/§10 rows of PORT-DEBT.md.
Restate scope. GOAL: a typed fin_* repo with date ranges pushed into the queries (fixes the PERF-07
over-fetch). Run the gate. One PR: migrate/S52-treasury-repo.

[Then S53] Rewrite session S53 (treasury-books). GOAL: Resumen + Ingresos + Gastos; income/expense
CRUD via FormWizard; totals in INTEGER CENTS, exact (D-003). MUST FIX: the month picker's scope must
be honest (it's a no-op on 5 of 8 legacy sub-views); no layout jolt when switching to Reportes; the
"Por pagar" KPI scope must match its neighbors. One PR: migrate/S53-treasury-books.

[Then S54] Rewrite session S54 (treasury-recurring-payable-notes-config). GOAL: Recurrentes + Por
pagar + Notas + Configurar. MUST FIX: auto-inserted recurring expense rows get a visible
system-generated marker (a treasurer must never see an untyped row with no explanation); overdue
styling on Por pagar; paid payables leave the list; the Activo toggle actually works. DO NOT PORT:
weekly/yearly frequencies that never materialize. One PR: migrate/S54-treasury-recurring.

[Then S55] Rewrite session S55 (treasury-reportes). Read D-009 (pdf.js preserved) and the §9 REPORTES
row of PORT-DEBT.md. GOAL: the report builder with live pdf.js preview == download byte-for-byte
(OVER-VERIFY). MUST FIX: distinct loading vs error states with retry (they're the same element in
legacy); responsive so controls + preview are visible together <900px; the alert() → toast. DO NOT
PORT: the dead renderReports()/printReport()/window.print() path. One PR: migrate/S55-treasury-reportes.

[Then S56] Rewrite session S56 (treasury-ministry-view). Read the §10 row of PORT-DEBT.md. GOAL: the
ministry-leader fork. MUST FIX (highest severity in the panel): the movements-table ⋮ that is wired
DIRECTLY to delete — give it a real menu AND an edit path; a real error state everywhere (a failed
fetch must never render $0.00 and imply "no budget"); split the "Nuevo" action out of the nav row.
One PR: migrate/S56-treasury-ministry-view.
```

### ▷ S57 + S58 — Registrations admin (list/form → detail/exports) · prereqs: S40, S18, S17 · (brief §6)
```
Rewrite session S57 (registrations-list-form). Read the S57 row of ROADMAP.md, DESIGN-SYSTEM.md and
the §6 REGISTRACIONES row of PORT-DEBT.md. Legacy source: js/pages/admin/special-events-tab.js,
css/pages/admin/special-events.css. Restate scope. GOAL: event list + create/edit form + age-group
editor on the new components. MUST FIX: the 4-state status badge with only 2 colors; replace the raw
inline style="..." age-group rows with real classed components; consolidate the bespoke .se-menu__pop
onto ActionSheet. DO NOT PORT: the ~40% dead CSS (.se-reg-table, .se-th-sort, .se-filter-bar,
.se-collapse, .se-switch) and the dead sortKey/sortDir — instead REBUILD real search/filter/sort (a
200-registrant event is unusable without it). One PR: migrate/S57-registrations-list-form.

[Then S58] Rewrite session S58 (registrations-detail-exports). Read D-004/D-009/D-010 and G-006.
GOAL: the registration detail + realtime + CSV/roster/cartel/waiver PDF exports (OVER-VERIFY the
signed waiver reproduced from the frozen row). MUST FIX: the 13-field registrant modal is a flat wall
— allergies and medical conditions (minors' data) must be impossible to miss. CSV is UTF-8 BOM. One
PR: migrate/S58-registrations-detail-exports.
```

### ▷ S59→S63 — Designer (engine → objects → panels → collab → library) · prereqs: S06, S09 · (brief §7)
```
Rewrite session S59 (designer-engine). Read MIGRATION.md (D-009, D-011 — the Fabric canvas is
WRAPPED, not rewritten; G-005 Fabric v6 named exports), the S59 row of ROADMAP.md,
.claude/CONTEXT-cartel-designer.md, DESIGN-SYSTEM.md (the "tool chrome" decision) and the §7 DISEÑADOR
row of PORT-DEBT.md. Restate scope. GOAL: mount the Fabric loader + engine on a scratch route (add a
rect, export PNG, snapping + zoom). RECONCILE the design language per DESIGN-SYSTEM.md's decision —
the designer stops being a private token island; resolve the dead class="dz-dark" vs light stylesheet.
One PR: migrate/S59-designer-engine.

[Then S60–S63, one PR each, in order] S60 objects+templates+fonts+export (real vector PDF, QR
round-trip; template previews are REAL renders, not fake CSS wireframes) · S61 panels+selection+
history+toolbar (icon-only chrome gets visible labels — discoverability was zero) · S62 collab+
autosave+teardown (OVER-VERIFY: leaving the route flushes + removes the realtime channel — no leak) ·
S63 library shell + chooser + share. Read each Sxx row of ROADMAP.md + the §7 PORT-DEBT.md notes and
the DESIGN-SYSTEM.md tool-chrome section as you go.
```

---

## The very first thing to run

The migration is **NOT STARTED**. You cannot open with the dashboard. Paste the **S01** block into a
fresh session today. When S01–S06 and S11–S21 and S37–S40 are ✅ on the status board, the Group 2/3
pages open up for parallel sessions. Track it all in `MIGRATION.md §1`.
