# Session S41 — Inicio: role-aware tiles, next events and recent activity

**Stream:** admin
**Depends on:** S37 (the `(app)` shell + guard + `PageHeader`, built in parallel — see Landmines), S38 (`session` / `perms` stores), S40 (the Inicio repo reads), PR-C2 primitives (`Card`, `Badge`, `Avatar`, `StateLoading` / `StateEmpty` / `StateError`), S22b (`ReadResult`)   **PR:** PR-C2 (not opened yet)   **Branch:** `c2/s41` → `migrate/S37-S45-admin`
**Status:** 🟦 built on the branch — PR-C2 not opened yet

## Goal (one sentence)
Port the legacy Inicio (`js/pages/admin/dashboard.js`) as an honest, role-aware home: static KPI tiles that say what they count and for which period, the next calendar events, and — for `activity` holders — the latest audit rows, each card loading and failing on its own.

## In scope
- `web/src/routes/(admin)/admin/(app)/+page.svelte` — the page (replaces S37's placeholder).
- `web/src/lib/components/admin/dashboard/` — `dashboard.ts` (tile registry, the load instant, words), `card-read.svelte.ts` (one card's async state), `KpiTile.svelte`, `NextEvents.svelte`, `RecentActivity.svelte`, `CardBoundary.svelte`.
- `web/src/lib/activity-format.ts` — the verb / entity map + `timeAgo` of `js/pages/admin/activity-tab.js`, golden-tested.
- `web/src/lib/components/admin/shell/PageHeader.svelte` — a **stub** of S37's component (see Landmines).
- Tests: `tests/golden/activity-format.test.ts` + `tests/fixtures/activity-format.json` (captured by `tests/unit/capture-activity-format.test.ts`), `tests/unit/{activity-format,dashboard,card-read}.test.ts`, `tests/component/{KpiTile,NextEvents,RecentActivity,Inicio}.test.ts`, `tests/helpers/session-double.svelte.ts`.

## Out of scope (do NOT touch)
- The shell, guard, topbar and nav (S37); Mi cuenta (S45); the sign-in screens (S39).
- Legacy files (the oracle only), the database, `web/budget.json`.
- The Actividad tab itself (S42) — it reuses `#lib/activity-format`.

## Prereqs
- [x] The plan (D-033…D-041, PR-C2 item 9), the visual brief, DESIGN-SYSTEM §1 / §4.1 (Card, KPI tile) / §5 / §6.3, PORT-DEBT S41 (and S42's activity items), `target-architecture.md` §3–§9, MIGRATION.md §2–§3, the S07 / S38 / S40 session files.
- [x] Legacy sources of truth: `js/pages/admin/dashboard.js`, `js/pages/admin/activity-tab.js`, `css/pages/admin/dashboard.css`, `js/pages/admin/treasury-tab.js` `renderResumen` (the "Balance del mes" wording).
- [x] Audit sources: every `trg_audit*` trigger in `supabase/migrations/` and `admin-invite/lib.ts` `AUDIT_SHAPE`.

## What changed

### The page
`PageHeader` "Inicio" with the greeting as its one line ("Hola, Ana" — the display name's first word, as legacy; "Hola" without a name; no date or weather filler) and the page's one action: **"Gestionar en el panel actual"**, a ghost `Button` to the legacy panel at the site root (`LEGACY_PANEL_URL = '/admin/'`, never under `/app`). Below it the tiles (an `<ul>` under a visually hidden `h2` "Resumen") and the two list cards (`h2` each), in a pure-CSS grid.

### KPI tiles — static, honest, gated (D-006)
| Tile | Who sees it (perms) | Read (`dashboard.ts` `TILES`) | Scope label | Emphasis |
|---|---|---|---|---|
| Próximos eventos | any staff (`inicio`) | `countCalendarEvents({ from: today })` + `countUpcomingSpecialEvents(<local midnight today>)`, one count | Desde hoy | — |
| Eventos este mes | any staff | `countCalendarEvents({ from: month.start, to: month.end })` | Calendario · este mes | — |
| Interesados pendientes | `discipulado` | `countPendingInterests()` | Discipulado · por contactar | > 0: warn tint on the figure and its glyph **+** a line "⚠ Requiere atención" (glyph + words, warn ink 5.99:1 / 8.28:1 on the surface) |
| Álbumes | `galeria` | `countAlbums()` | Galería · incluye borradores | — |
| Balance | `church-books` (admin, treasurer) | `fetchBooksSummary(month).balanceCents` → `formatUSD` | Este mes · libros de la iglesia | < 0: `--money-neg` (the minus sign carries it in words) |

Every tile is gated: RLS answers a staff member without the tab with an **empty** result, so an ungated tile would show a misleading 0. Calendar and special events are public rows, so their counts are the same for every role. Each load computes its own `Instant` (today, local midnight, the current month), so a page left open across midnight or a month end counts the new day/month on its next refresh.

A tile reads label (beside its glyph) → figure → scope. Grid: `repeat(auto-fit, minmax(min(100%, 180px), 1fr))`, no JS (G-010). Each cell is `min-block-size: var(--state-card-height)`, and Inicio sets that StateLoading component token to `clamp(8rem, 6rem + 6vw, 11rem)` — a loaded tile's height from a lone phone tile (~128px) to five-up beside the sidebar (~176px, labels and scopes wrapped) — so the skeleton and the tile that replaces it are the same size; the list skeleton's rows get the same treatment (`--state-row-height: calc(4.5rem + 1vw)` for events).

### "Próximos eventos" list
`fetchNextCalendarEvents(6, today)`. Each **static** row: a date block (day + the legacy three-letter month), the title, "weekday · time", the ministry as a `Badge` tinted with its colour (validated by `badgeTint`; a missing or non-hex colour gets a neutral badge with the church glyph instead of a console warning), and "Cancelado" as a danger status `Badge` (glyph + word) with the title muted and struck through. No link, button, hover wash or pointer — the rows open nothing (PORT-DEBT S41 false affordance).

### "Actividad reciente" (`activity` holders only)
`fetchRecentActivity({ limit: 8 })`, rendered through `#lib/activity-format`: the actor's initials (`Avatar`, decorative beside the visible name), "**quién** creó un evento “Culto”" — the words after the name are one text node, so the sentence reads exactly as legacy rendered it — and `<time datetime>` "hace 5 min".

### States, isolation, refresh
- Every card owns a `CardRead`: `null` → `StateLoading` (`card-grid` for a tile, `list` for the lists, sized to the list), then `StateError` (`RepoError.message` + Reintentar) | `StateEmpty` | content. A failed count is the error state with its label and scope still visible — never 0. Retry keeps the error on screen with the button's spinner until the read answers.
- Each card sits in a `CardBoundary` (`<svelte:boundary>` with only a `failed` snippet): a rendering bug in one card is logged under `[inicio]` and shows the generic `StateError`; its Retry refetches that card's data and re-renders it. The rest of the page keeps working.
- `visibilitychange` → visible refetches every shown card **at most once a minute**, behind the content: no skeleton, and a refresh that fails keeps the last good figure (as the session store does); a card already in error takes whatever the refresh brings. The minute is measured from the first load.
- A card that appears later (the role changed while the tab slept) loads on its own; the others are not re-read.

### `#lib/activity-format` (pure, golden)
`ACTIVITY_VERBS`, `ACTIVITY_ENTITIES` (+ fallbacks, `ACTIVITY_EMPTY`), `timeAgo(iso, now?)`, `formatActivity(row, now?)` → `{ who, verb, what, label, when }`, `activityPredicate(line)`. Lookups are own-key only, so `"constructor"` falls back instead of reaching `Object.prototype` (legacy `ENTITY['constructor']` printed the Object function).

**Golden capture (the S07 way).** `CAPTURE=1 npx vitest run tests/unit/capture-activity-format.test.ts` copies `activity-tab.js` into `tests/.capture-tmp/` with only its three import specifiers rewritten — `escape.js` (the real file), `states.js` (a copy of the real file, its own import rewritten) and `./state.js` (a stub `sb` answering the audit query with the vector's row) — pins `TZ=America/New_York` and the clock, drives the exported `loadActivity()` and records the rendered `.act__text` / `.act__time` for 60 rows plus the empty-state copy. The golden test holds the port byte-identical on 48 rows and checks each approved diff on both sides (the fixture still says what legacy said; the port says the new words).

## Approved behaviour diffs (review these)

**KPI semantics vs `js/pages/admin/dashboard.js`**
| Legacy | Port | Why |
|---|---|---|
| "Próximos eventos" = calendar events from today (all staff) **and** a separate admin-only "Eventos especiales" = events starting from *now* | one "Próximos eventos": calendar events from today **plus** special events from the viewer's local midnight, for any staff | the plan's "counted alike"; from midnight so the "Desde hoy" scope is literally true for both kinds |
| "Discipulado pendiente", admins only, red when > 0 | "Interesados pendientes" for every `discipulado` holder (admins + leaders granted it), warn tint + glyph + the words "Requiere atención" | perms-gated (D-006); warn = needs attention; never colour alone (D-023) |
| "Álbumes de galería", admins only | "Álbumes" for every `galeria` holder; scope says drafts are included | perms-gated; honest scope |
| — | "Balance" (this month's church books) for admin + treasurer | plan item 9 |
| `count ?? 0` — a failed count showed 0; one failure blanked the page with `e.message` | per-card error state with Spanish copy + Retry | PORT-DEBT S41, ADR-0004 |
| tiles were buttons into tabs; `autoBalance()` stretched the last row | static tiles; one "Gestionar en el panel actual" link; pure-CSS grid | the tabs are not ported (D-036); G-010 |
| next-events rows hovered, did nothing; cancelled = 55 % opacity + red text pill; ministry in the meta line | static rows; cancelled = status Badge (glyph + word) + muted, struck title; ministry = tinted Badge | false affordance; opacity dimmed text below AA; colour + words |
| subtitle "Resumen de la actividad de la iglesia." | dropped — the greeting is the header's one line | the brief: no filler |
| loaded each time the tab was opened | loads on mount; refetches when the tab comes back (≤ once a minute) | in-app browsers suspend background tabs (target-architecture §6) |
| no activity on Inicio | "Actividad reciente" (8 rows) for `activity` holders | plan item 9 |

**`activity-format` vs `activity-tab.js` (golden diffs)**
1. **Every audited table has a phrase.** Legacy read "un registro" for `profiles` → "una cuenta", `role_presets` → "un preset de acceso" (audited since PR-B's trigger and by `admin-invite`), and for five tables audited since the baseline but never mapped: `special_events` → "un evento con registro", `event_registrations` → "una inscripción", `fin_funds` → "un fondo", `fin_income_categories` → "una categoría de ingresos", `fin_expense_categories` → "una categoría de gastos". The words follow the legacy UI ("Cuentas", "Preset de acceso", "Eventos con Registro", "Inscripciones", "Fondo"). `leader_sections` / `leader_members` were already in legacy (b2e52ff, D-028): captured, no diff. `tests/unit/activity-format.test.ts` reads every audit trigger in `supabase/migrations/` and `AUDIT_SHAPE`, so a new audited table without a phrase fails CI.
2. **An operation other than INSERT / UPDATE / DELETE reads "modificó"** — legacy printed the raw code lower-cased ("truncate") or nothing ("Ana  un evento"). The database writes only the three.
3. **An unreadable timestamp shows no time** — legacy printed "Invalid Date".

## Decisions and deviations (with the reason)
1. **Card keeps its resting `--shadow-sm`.** The visual brief says cards are flat; the S14 `Card` (DESIGN-SYSTEM §4.1, "one shadow token as the system default", asserted by `Card.test.ts`) has a 1px resting shadow. Inicio composes the primitive rather than re-implementing it; if the brief wins, it is a one-line change in `Card.svelte` for every card at once.
2. **The KPI typography is the brief's, not `Card`'s `kpi` sub-variant** (value `--fs-2xl` 700 tabular-nums, label `--fs-sm` muted, scope `--fs-xs` muted, the task's warn tone and an error slot): the tile is a static `Card` with its own content. Five tiles at 1280px leave ~150px of tile, so a money figure is sized to it (`clamp(--fs-lg, 18cqi, --fs-2xl)`; "$3,450.00" at `--fs-2xl` overflowed), and the warning is a glyph-and-words line, not a `Badge` — a Badge never wraps, and its uppercase pill ran past the tile there (seen by eye).
3. **The full audited set, not only `profiles` / `role_presets` / `leader_*`** — the same bug ("un registro") on five more audited tables; guarded by the catalog test above.
4. **A failed background refresh keeps the last good answer** (Retry and the first load always show the error) — waking a phone is not a reason to swap real figures for seven error boxes.
5. **No committed e2e spec.** The `(app)` guard (S37) is not in this tree, and the page deliberately does not start the session itself. The page's behaviour is pinned by component tests over the real `perms` store (a reactive session double underneath) with every repo mocked; the axe spec scans `/admin/` as this tree renders it (the header). The integrated page was checked by eye with a throwaway harness (below).
6. **`LEGACY_PANEL_URL` lives in `dashboard.ts`.** S37's "Abrir panel actual" points at the same `/admin/`; at integration one constant should serve both.

## PORT-DEBT S41 coverage
| Item (PORT-DEBT §3) | Where | Status |
|---|---|---|
| Error state must not render the raw error; add retry | `KpiTile` / `NextEvents` / `RecentActivity` → `StateError` with `RepoError.message` + Reintentar; `CardBoundary` for render bugs | ✅ |
| False affordance on the next-events rows | `NextEvents`: static rows, no hover / pointer / control (component test reads the CSS) | ✅ |
| Delete `autoBalance` / `grid-balance.js` (G-010) | CSS grid `auto-fit, minmax(180px, 1fr)`; nothing sets `gridColumn` | ✅ |
| Reconcile `.dash-card` to the Card system | static `Card`: `--radius-md`, slate, no amber wipe / icon tile / lift | ✅ |
| KPI grid hierarchy — only pending interests is actionable | warn tint + glyph + "Requiere atención" Badge on that tile only | ✅ |
| DO NOT PORT: grid-balance, amber hover, `e.message` | none ported | ✅ |
| (S42) keep and unit-test the ACTION / ENTITY map and `timeAgo` | `#lib/activity-format` + golden (64) + unit (8) | ✅ (for S42 to reuse) |
| (S42) actor avatar | Inicio's activity rows carry initials (`Avatar`, one algorithm) | ✅ on Inicio |

DESIGN-SYSTEM §6.3 (every async view): skeleton per shape ✅ · empty with copy (no primary action exists in the new admin yet) ✅ · error with human copy + Retry, never raw ✅ · error ≠ empty ✅ · force-error → error + retry, slow query → skeleton (component tests) ✅.

## Test counts
| Suite | Before | After |
|---|---|---|
| `golden/activity-format` (new) | — | 64 |
| `unit/activity-format` · `unit/dashboard` · `unit/card-read` (new) | — | 8 · 24 · 7 |
| `unit/capture-activity-format` (new, CAPTURE-gated) | — | 2 skipped |
| `component/KpiTile` · `NextEvents` · `RecentActivity` · `Inicio` (new) | — | 7 · 9 · 7 · 25 |
| **`npm run test`** | **99 files (1 skipped) · 2825 passed · 2 skipped** | **108 files (2 skipped) · 2976 passed · 4 skipped** |

## Verification gate
```
[ ]  1. Install clean     not re-run (lockfile unchanged)
[x]  2. Typecheck         npm run check → 769 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npx eslint . → exit 0 · npx prettier --check --end-of-line auto . → all files pass
[x]  4. Unit tests        npm run test → 106 passed | 2 skipped files · 2976 passed | 4 skipped
[x]  5. Golden parity     tests/golden/activity-format → 48 rows byte-identical to the legacy capture; 3
                          approved diffs checked on both sides; the capture re-runs clean (CAPTURE=1)
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → done; build/admin/index.html
[ ]  7. Preview smoke     see "By eye" below (throwaway harness; the shell is S37's)
[x]  8. Legacy untouched  only web/** and this file
[x] 12. Secrets/PII clean no keys; invented names, example.org addresses, synthetic UUIDs
[ ] 13. Ledger updated    → PR-C2 ledger step
[x] 15. axe               E2E_PORT=4189 npx playwright test tests/e2e/a11y.spec.ts (4 projects) →
                          224 passed (3.6m) on c2/s41 before the S37 merge, /admin/ included
[x] 17. Budget            npm run budget → /admin/ 133.2 kB, no baseline (expected; integrator); every
                          other page ok — `/` 41.8 → 42.3 kB (+3.7 % → +5.0 %, at its limit; see Landmines)
[x] 19. Security          V8: every card gated on perms (UX) over RLS; no read before the session is
                          ready; RepoError.message only, never `detail` or an exception
```

## How to resume if interrupted
- Branch `c2/s41`, worktree `IR-c2-s41`, on top of `b837ef3` (S37's route-group commit).
- Done: everything above, one commit.

## Landmines
1. **`PageHeader.svelte` here is a stub** with S37's announced API (`title`, `description?`, `actions?` snippet; sets `document.title`). On merge keep S37's file.
2. **The page relies on the `(app)` guard**: it renders only after `guardAdmin` settled the session. It never calls `session.ready()`; with no guard (this tree) it shows only the header, which is what the axe spec scans here.
3. **Budget**: `/admin/` needs a baseline (133.2 kB gzip at `/app`, most of it supabase-js). Adding any route that loads the Supabase client grows the route manifest and re-splits chunks the root layout shares (`#lib/config.js`), so `/` went +3.7 % → +5.0 % of its baseline — inside the limit, with no headroom; S37 / S39 / S45 add the same kind of routes.
4. **ICU in the golden**: week-old rows print `toLocaleDateString('es-ES')` ("12 oct 2026", "30 sept 2026") — captured on Node 24 / ICU 78; an image with an older ICU prints "sep". Same call in legacy and port, so a mismatch means the environment changed, not the port.
5. **TZ in tests**: the golden, `RecentActivity` and `dashboard` suites set `process.env.TZ` and restore it; keep it that way — vitest reuses workers across files.
6. **Svelte keeps the whitespace between two adjacent `{expressions}` verbatim** (a newline + indent survives into `textContent`, unlike whitespace next to an element). `RecentActivity` renders the words after the name as one text node for that reason; candidate gotcha for the ledger.
7. **The oracle is legacy `activity-tab.js`**: if an owner-approved legacy change touches its maps again, re-run the capture and record the diff.

## By eye (throwaway harness, not committed)
A preview build with `PUBLIC_SUPABASE_URL=http://localhost:<port>/__supabase` (same origin), a session seeded in `localStorage` (an aal2 JWT), every `/__supabase/**` request answered by `page.route` (counts through `Content-Range`), and — before S37 landed — a temporary `(app)/+layout.ts` calling `guardAdmin`, deleted afterwards. The real page, stores and repos ran end to end; nothing reached a Supabase project.

| Scenario | Widths × themes | Result |
|---|---|---|
| Desarrollador, all cards | 360 / 768 / 1280 × light / dark (Chromium); 390 × light / dark (WebKit) | figures, rows and sentences as expected; no horizontal scroll; axe 0 serious/critical |
| Tesorería, negative month | 768 × light / dark | three tiles, "-$1,854.75" in the negative ink |
| Three reads failing (503) | 1280 × light / dark | each failed tile keeps label + scope above StateError + Reintentar; the other tiles keep their figures; both lists show their own error |
| Every read pending | 1280 × light / dark | tile and list skeletons |
| Nothing upcoming, no activity | 360 × light / dark | both empty states |
| Leader with galeria | 360 × light | Próximos, Este mes, Álbumes + the events list |

Found and fixed there: (1) a long ministry name in a nowrap Badge widened the page to ~490px at 360 — the page's grids now use `minmax(0, 1fr)` columns and the Badge truncates as designed (component test pins the rule); (2) the "Requiere atención" pill overflowed a five-up tile — now a wrapping line; (3) skeletons were 128px against 151–255px tiles and 56px against ~80px event rows — the glyph moved beside the label and the state tokens were tuned (largest remaining growth: one tile row by its warning line).

## On completion (PR-C2 ledger step)
- [ ] ROADMAP S41 row → built; MIGRATION.md board + Current state; PORT-DEBT S41 closed (table above).
- [ ] Candidate gotcha: Svelte expression whitespace (Landmine 6).
- [ ] `budget.json`: baseline `/admin/` (and re-baseline `/`) from the integrated `/app` build.
