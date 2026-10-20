# Session S37 — Admin shell, navigation and the expired-session screen

**Stream:** admin (shell + routing)
**Depends on:** S02b (Kit 3, D-030), S05b (gates), S22b (repo results), S38 (session / perms stores, `guardAdmin`, `ROUTES`), the PR-C2 primitives (IconButton, Avatar, Badge, StateLoading / StateError, ConfirmHost, ToastHost, ActionSheetHost), S11 (tokens, D-038 admin theme)   **PR:** PR-C2 (not opened yet)   **Branch:** `c2/s37` → `migrate/S37-S45-admin`
**Status:** 🟦 built on the branch — PR-C2 not opened yet

## Goal (one sentence)
Every signed-in admin page renders inside one accessible, responsive frame — topbar, grouped navigation (a drawer at ≤900px that the Back gesture closes), the account footer with a confirm-guarded logout, a content column — behind the S38 guard, with a Spanish "Tu sesión expiró" screen, a Spanish error page, a frame guard and `noindex` on every admin route (D-036, D-037).

## In scope
- Routes: `web/src/routes/(admin)/admin/+layout.svelte` (surface root, hosts, frame guard), `+error.svelte`; `(admin)/admin/(app)/+layout.ts` (the guard), `+layout.svelte` (AdminShell), `+page.svelte` (Inicio's title only — S41 builds the page). `(admin)/admin/+layout.ts` (`ssr = false`, D-036) is unchanged.
- `web/src/lib/components/admin/shell/`: `AdminShell`, `Topbar`, `Sidebar`, `NavGroup`, `NavItem`, `AccountFooter`, `PageHeader`, `ExpiredSession`, `page-title.svelte.ts` (the page-title store), `sign-out.svelte.ts` (the deliberate sign-out), `shell.ts` (the contract).
- `web/src/hooks.server.ts` — `noindex, nofollow` + a generic `<title>` in every (admin) page's prerendered HTML.
- `web/src/lib/auth/notice.ts` (new) — the sign-in notice contract S39's page reads (`?aviso=`).
- `web/src/app.d.ts` (new) — `App.PageState.drawer` for shallow routing.
- Test harness: `web/tests/stubs/app-state.svelte.ts`, `app-navigation.ts` + their two aliases in `web/vitest.config.ts`.
- Tests: `tests/component/{AdminShell,AdminShell.app-base,AdminShell.logout,PageHeader,AdminLayout}.test.ts` (+ `fixtures/AdminShellHarness.svelte`, `fixtures/shell-stores.svelte.ts`), `tests/unit/{admin-shell,hooks-server}.test.ts`, `tests/unit/auth/notice.test.ts`, `tests/e2e/admin-shell.spec.ts`.

## Out of scope (do NOT touch)
- The sign-in routes `(admin)/admin/acceso/**` (S39), Inicio's content (S41), Mi cuenta `(app)/cuenta/` (S45), the notifications bell (S43 — it goes in the topbar's `end` slot), the preset name (S47).
- The CSP (plan item 11), `budget.json` (the integrator re-baselines), legacy files, the database.

## Prereqs
- [x] The plan (D-033…D-041, PR-C2 item 5), the visual brief, `DESIGN-SYSTEM.md` §1/§4/§5/§6, `docs/architecture/design-system.md`, `target-architecture.md` §3–§9, `docs/admin-ux.md`, `MIGRATION.md` §2–§3, PORT-DEBT S37/S38 rows, the S38 / S40 session files.
- [x] Legacy source of truth: `admin/index.html` (#app: `.topbar`, `#admNav`, `#admNavBackdrop`, the account footer), `css/pages/admin/shell.css`, `js/pages/admin/index.js` (drawer wiring), `account.js` (`renderNavAccount`), `auth.js` (`logout`, `applyTabAccess`).
- [x] Installed behaviour read from source: Kit 3.1.0 (`pushState`, `__SVELTEKIT_HAS_UNIVERSAL_LOAD__`, link options, hooks types), auth-js 2.112.3 (`_signOut`, AAL from the JWT, the BroadcastChannel), Svelte 5.57 (`MediaQuery`).

## What changed

### Routes
| File | What it does |
|---|---|
| `(admin)/admin/+layout.svelte` | `<div data-surface="admin" data-sveltekit-preload-data="tap">` (D-021) holding the page, `ToastHost`, `ConfirmHost`, `ActionSheetHost`. **Frame guard (D-037):** when `window.top !== window.self` (or the browser will not say) it renders only a Spanish refusal — "El panel no se puede abrir aquí" — and a link that opens the page in its own tab; no page, no hosts. No theme code: the root layout already applies the admin preference on admin paths (D-038). |
| `(admin)/admin/+error.svelte` | "No encontramos esta página" (404) or "Algo salió mal": calm copy, no technical text, "Ir a Inicio" + "Abrir panel actual". |
| `(admin)/admin/(app)/+layout.ts` | `load = ({ url }) => guardAdmin(url)` — browser-only (`ssr = false`), runs on every navigation in the group. |
| `(admin)/admin/(app)/+layout.svelte` | `<AdminShell>{@render children()}</AdminShell>`. |
| `(admin)/admin/(app)/+page.svelte` | `<PageHeader title="Inicio" />` — S41 replaces it. |
| `src/hooks.server.ts` | At prerender, every page whose route id starts with `/(admin)/` (the shells never render `<svelte:head>`) gets `<meta name="robots" content="noindex, nofollow" />` and `<title>Panel · Iglesia Restauración Divina</title>` before `</head>` — each only if missing. Public pages pass through. |

`npm run build` emits `build/admin/index.html` (the shell; under `BASE_PATH=/app` it is served at `/app/admin/`). Every route S39/S41/S45 add under the group is emitted the same way.

### The shell (`web/src/lib/components/admin/shell/`)
| Component | Props | Notes |
|---|---|---|
| `AdminShell` | `children: Snippet`, `topbarEnd?: Snippet`, `navBadge?: Snippet<[Surface]>` | Reads `session` + `perms`; owns the drawer's history entry, the logout confirm, the re-guard. |
| `Topbar` | `title`, `menuId`, `controls`, `expanded`, `onMenu`, `end?` | Burger (IconButton `touch`, `aria-expanded`/`aria-controls`) + page title at ≤900px; church name wider. |
| `Sidebar` | `id`, `sections`, `pathname`, `home`, `legacy`, `account {name, role, avatarUrl}`, `drawer`, `open`, `onClose`, `trigger?`, `onLogout`, `loggingOut?`, `badge?` | The column, and at ≤900px the drawer (trap, lock, Escape, focus return, inert when closed). |
| `NavGroup` | `label`, `children` | `<span id>` + `<ul role="list" aria-labelledby>` — not a heading (keeps the outline to the page's h1). |
| `NavItem` | `href` (resolved), `label`, `icon`, `current?`, `badge?: Snippet`, `onclick?` | `<li><a aria-current="page">`; the badge is inside the link (its words join the name). |
| `AccountFooter` | `name`, `role`, `avatarUrl?`, `onLogout`, `busy?` | Avatar 36 (decorative), name, Spanish role, logout IconButton. Presentational. |
| `PageHeader` | `title: string`, `description?: string`, `actions?: Snippet` | h1 (`--fs-xl`), one muted line, actions right-aligned (stacked under the title at ≤640px). Sets `document.title` = "<title> · Panel · Iglesia Restauración Divina" and the topbar title. Moves no focus. |
| `ExpiredSession` | `href` | "Tu sesión expiró" (h1 focused on appear) + "Iniciar sesión de nuevo" (`data-sveltekit-reload`). |

Modules: `page-title.svelte.ts` (`pageTitle.current`, `setPageTitle(title) → release`), `sign-out.svelte.ts` (`signOutAndLeave(scope)`, `signingOut.current`), `shell.ts` (constants, `groupNav`, `isCurrentRoute`, `documentTitle`, `isFramed`, `leaveTo`, `LEGACY_PANEL_HREF = '/admin/'`).

What the session decides, after the guard let the page in:

| `session.status` | Screen |
|---|---|
| `ready` | the shell around the page |
| `expired` | ExpiredSession, replacing the panel (its data goes too); open action sheets close |
| `error` (or a Retry in flight) | `PageHeader "No pudimos abrir el panel"` + StateError (`session.error.message`, Reintentar → `session.retry()`) |
| `signed-out` / `needs-mfa` / `needs-enroll` / `forbidden` | loading state while the page leaves (full load) for where `accessTarget` sends it — a Retry or a background read can end there after the page loaded; not during a deliberate sign-out |
| `loading` | loading state |

### The sign-in notice (`#lib/auth/notice.ts`) — the contract with S39
`?aviso=sesion-cerrada | sesion-expirada` on the sign-in URL. Both trips are full page loads (nothing of the old session stays in memory), so history/in-memory state cannot carry it. `withSignInNotice(target, notice)`, `signInNoticeFrom(params) → 'signed-out' | 'expired' | null`, `SIGN_IN_NOTICES` (`Sesión cerrada.` / `Tu sesión expiró.`), `SIGN_IN_NOTICE_PARAM`. Unknown values are no notice; the words never come from the URL.

### Decisions and deviations (with the reason)
1. **The page owns its title** (PORT-DEBT S37 asked to pick one): `PageHeader` is the h1 and the tab title; the topbar repeats it at ≤900px (hidden from assistive tech — the h1 is on the page at every width). The church's name sits in the topbar on desktop and the drawer's head on a phone.
2. **Logout and the expired screen leave by a full page load** (`location.replace` / `data-sveltekit-reload`), not client navigation: after a sign-out nothing of the old account stays in memory (the next person to sign in on a shared device gets a fresh app; legacy logout reloads too).
3. **The notice travels in the query** (`#lib/auth/notice.ts`, new) — see above. S39 reads it; the integrator reconciles if S39 chose another carrier.
4. **The closed drawer is `inert`, not `visibility: hidden`.** Under reduced motion the global guard (`* { transition-duration: 0.01ms !important }`) gives every descendant a running `visibility` transition, so the drawer's text stayed computed `hidden` for a frame or more after opening — axe flagged `link-name` intermittently. `inert` takes the closed drawer out of the tab order and the accessibility tree with no style change; the shadow is drawn only while open.
5. **A "Cerrar menú" button in the drawer's head** (not in the brief): an explicit way out besides Escape / Back / the scrim, for touch and switch users.
6. **The shell re-guards** when the session turns away after load (Retry, a background read) — a full-page leave to `accessTarget`'s answer. A deliberate sign-out (`signOutAndLeave`) suppresses it and adds the notice instead.
7. **Role label = `perms.roleLabel`** (the one `ROLE_LABELS` map behind `ROLE_BADGES`). **The preset name is not shown:** no `role_presets` read exists in this PR (S47 owns that repo); legacy's footer also showed the role.
8. **`pushState('', { drawer: true })`** as briefed. Kit 3.1 marks `pushState` deprecated for `goto(url, { state, shallow: true })`, but `svelte/no-navigation-without-resolve` rejects `goto('')`; `pushState('')` is lint-clean. Revisit when the rule allows it.
9. **PageHeader's wrapper is a `<div>`**, so the topbar is the page's one banner.
10. **`hooks.server.ts` also writes a generic `<title>`**, so the tab is named before the app boots.
11. **Harness:** `$app/state` / `$app/navigation` stubs + aliases (Vitest's import analysis cannot resolve them otherwise); `src/app.d.ts` for `App.PageState`.

## Visual spec (the PR-C2 visual brief, binding — copied)

> Authority order: `docs/migration/DESIGN-SYSTEM.md` §1 (aesthetic contract) → `docs/architecture/design-system.md` (token layers, component conventions) → `docs/admin-ux.md` → this brief (the concrete defaults that keep five agents' output coherent). Calm, legible, restrained, obviously clickable. Volunteers on phones.
>
> **Surfaces & structure**
> - Page background `--color-bg-light`; raised panels/cards `--color-surface` + 1px border `rgba(127,127,127,.18)` (theme-neutral idiom), radius `--radius-md`. Cards are flat: no hover lift, no shadow. `--shadow-sm/md` only for overlays/menus/drawer (D-020).
> - Content column: max-width 1200px, centred, side padding from `--pd-*` tokens (≥16px at 360px).
> - Topbar: 60px (56px ≤640px), solid `--color-dark`, light ink `--color-white`, sticky `--z-menu`; holds burger (≤900px), the page title (≤900px only — the page's own h1 carries it on desktop) and a right-side slot. No brand dot, no user chip (PORT-DEBT S37).
> - Sidebar: 238px, `--color-surface`, right border as above; group labels `--fs-xs`, weight 600, `--color-muted`, letter-spacing .04em; nav items 40px min-height (44px touch at ≤900px), radius `--radius-sm`, icon 18px + label `--fs-sm` weight 500; hover = `rgba(127,127,127,.12)` tint; active = solid `--color-dark` fill + `--color-white` ink + `aria-current="page"`. Footer pinned: 36px Avatar + name (`--fs-sm` 600) + Spanish role (`--fs-xs` muted) + logout IconButton.
> - ≤900px: sidebar becomes a 264px (max 82vw) drawer over a `rgba(0,0,0,.4)` scrim, `--shadow-lg`.
>
> **Typography** (only `--fs-*`, never px/rem font sizes)
> - Page title h1 `--fs-xl` weight 700 `--color-text`; optional description `--fs-base` `--color-muted`.
> - Section h2 `--fs-lg` weight 600; card title h3 `--fs-md` weight 600; body `--fs-base`; meta/secondary `--fs-sm` `--color-muted`; form labels `--fs-sm` weight 600 `--color-text`.
> - KPI value `--fs-2xl` weight 700 `font-variant-numeric: tabular-nums`; KPI label `--fs-sm` muted; scope label `--fs-xs` muted.
>
> **Colour**
> - Ink: `--color-text` / `--color-muted` on reversing surfaces; never `--color-dark` as text on the page.
> - Accent (slate, admin scope): fills `--color-secondary`/`--color-accent`; accent TEXT uses `--color-accent-ink` (new, AA in both themes — D-038).
> - Semantic only where it means something (success/danger/warn, `--status-*`, `--money-*`); a status always pairs icon + label (D-023). No gradients, glows, glass, purple, gold/amber/teal accents.
>
> **Controls & states**
> - Every interactive element: default / hover (inside `@media (hover:hover)`) / focus-visible (global ring) / active / disabled; async actions show a loading state (Button `loading`).
> - Targets ≥24px always, ≥44px for primary controls, checkboxes, radios, toggles, nav items on touch.
> - Inputs ≥16px effective font-size on mobile; label above control; hint below; inline error with `aria-invalid` + `aria-describedby`; errors in human Spanish.
> - Destructive actions: ConfirmDialog (danger variant). Success/failure feedback: toast for transient, Alert for in-flow.
>
> **Motion**
> - House easing `cubic-bezier(0.22, 1, 0.36, 1)`, 120–300ms; every animation/transition has a `prefers-reduced-motion: reduce` guard (motion tokens arrive in S11b — use the literal until then).
>
> **Content**
> - Spanish UI copy, sentence case, verbs on buttons ("Guardar cambios", "Cerrar sesión").
> - Empty states: icon + one calm sentence + a primary action where one exists.
> - Errors: what happened + what to do + Retry; never raw backend text.
> - No placeholder content, lorem ipsum, fake metrics, sparklines or "coming soon" tiles.

**As built for the shell:** topbar `3.75rem` / `3.5rem` (60 / 56px) in `--adm-topbar-h`, declared on `html:has(.adm-shell)` so the sticky sidebar, the drawer head and `scroll-padding-top` read one value; sidebar `14.875rem` (238px) and drawer `16.5rem` (264px, max 82vw) in rem so they grow with the reader's font size; content column `max-inline-size: 1200px` with `--pd-md` padding (19.6px at 360px); the current nav item adds a `--color-text` edge — in dark mode the slate fill is ~1.4:1 against the sidebar and the edge carries the state (WCAG 1.4.11), in light it melts into the fill; the scrim is `color-mix(in srgb, var(--static-black) 40%, transparent)` (= `rgba(0,0,0,.4)` without a literal); group labels sentence case (no uppercase); logout's confirm is not the danger variant — signing out destroys nothing.

## PORT-DEBT coverage (S37 row)
| Item | Where | Status |
|---|---|---|
| Reproduce the shell: sticky 60px dark topbar (`--z-menu`), 238px grouped sidebar (Principal / Eventos / Finanzas / Comunidad / Administración), active = solid `--color-dark` pill + white ink, account footer pinned (36px avatar photo-or-initials, name, **Spanish** role, separate logout); ≤900px a 264px (max 82vw) drawer behind a burger over a dimmed backdrop; content drops the left margin | `AdminShell`, `Topbar`, `Sidebar`, `NavGroup`, `NavItem`, `AccountFooter` | ✅ |
| Resolve the missing page titles — topbar-hosts-title **or** page-owns-title, consistently | page-owns-title: `PageHeader` (h1 + `document.title` + mobile topbar via the page-title store) | ✅ |
| Drawer focus management: trap, restore to the burger, close on Escape | `Sidebar` (focus-trap stack, `returnFocusTarget(burger)`, Escape only when topmost) + Back / scrim / "Cerrar menú" / a nav pick | ✅ |
| Nav badge / count slot | `NavItem` `badge` snippet; `AdminShell` `navBadge(surface)` passthrough (no consumer yet: S43/S51) | ✅ slot |
| Body classes strictly UX gating; the guard stays RLS | no body classes at all; the nav is `perms.nav` (S38, UX only); RLS + the aal2 layer decide | ✅ |
| DO NOT PORT the amber brand dot / glow | not ported (no dot, slate only) | ✅ |
| DO NOT PORT the orphaned `.topbar__user` / `.topbar__logout` and its 640px rule | no user chip; logout lives in the footer | ✅ |
| DO NOT PORT the forced-theme flash guard as a copied inline script | nothing added; `app.html`'s S11 boot + the root layout's `applyThemeFor` (D-038) | ✅ |

## Behaviour diffs vs legacy (review these)
1. **Sections are routes** (D-036): nav items are links with history entries, open in a new tab, and say which page is open (`aria-current`); legacy swapped panels in place with `.active`.
2. **The nav lists only what the new admin serves** (Inicio, Mi cuenta) plus ONE "Abrir panel actual" link to the legacy `/admin/` (hidden when the account has nothing there).
3. **Logout asks first** ("¿Cerrar sesión?") and ends **this device's** session (`signOut('local')`); legacy signed out at once with supabase-js's default **global** scope. Then the sign-in page says "Sesión cerrada."
4. **A session ended elsewhere shows "Tu sesión expiró"** in place of the panel, with "Iniciar sesión de nuevo" back to the same page; legacy showed nothing and its requests failed.
5. **The drawer** closes on Escape, Back, the scrim, "Cerrar menú" or a nav pick; traps focus, returns it to the burger, locks the page; its closed links are not reachable (legacy left them in the tab order off-screen, closed only on a backdrop click or a tab pick).
6. **Topbar:** the page's title at ≤900px; the church's name on a desktop (legacy: "IGLESIA RESTAURACIÓN DIVINA" with an amber dot at every width).
7. **Footer:** name and role are text, not a button (legacy opened Mi cuenta from it) — Mi cuenta is in the nav.
8. **Admin pages carry `noindex, nofollow`**, refuse to render inside a frame, and have a Spanish error page (legacy: none of the three).

## Test counts
| Suite | Before (b837ef3) | After |
|---|---|---|
| Vitest (`npm run test`) | 98 files + 1 skipped · 2825 passed, 2 skipped | 106 files + 1 skipped · 2894 passed, 2 skipped |
| new: `tests/component/AdminShell.test.ts` 27 · `.app-base` 4 · `.logout` 3 · `PageHeader` 5 · `AdminLayout` 2 · `tests/unit/admin-shell` 13 · `auth/notice` 6 · `hooks-server` 9 | — | 69 |
| Playwright `admin-shell.spec.ts` (17 × 4 projects) | — | 68 passed |

Component tests cover: drawer open/close (Escape, scrim, "Cerrar menú", Back, a nav pick), `aria-expanded` / `aria-controls`, the focus trap and its return, a confirm over the drawer taking Escape first, `inert` when closed, no drawer above 900px, nav `aria-current` at base `''` and `/app`, the legacy href `/admin/` at both bases, the badge slot, the footer, logout confirm → `signOut('local')` → the notice URL (and no guard redirect), `signOutAndLeave('global')`, the expired screen (focus, href with `next`, `data-sveltekit-reload`, title), the error state with Retry, leaving for each turned-away status, the frame guard, the noindex/title transform.

The e2e spec (no backend: every off-origin request is mocked or aborted; the session is seeded in localStorage as a 3-part JWT at aal2) covers: the prerendered shell's HTML (noindex, title, client-rendered), the signed-out redirect (and `next`), the legacy email contract, the rendered shell (landmarks, nav, legacy link, footer), the skip link, reload, logout end to end (POST `/auth/v1/logout`, storage cleared, notice URL), the expired screen via supabase-js's cross-tab channel, the topbar's scroll padding (WCAG 2.4.11), no sideways scroll at 360 / 1280, the drawer at 360px (dialog, focus held through Tab, Escape + focus return, Back, scrim, "Cerrar menú", a pick + Back), axe light/dark at 1280 and with the drawer open at 360 (repeated 5× per project: 80/80).

## Verification gate
```
[ ]  1. Install clean     not re-run (lockfile unchanged)
[x]  2. Typecheck         npm run check → 782 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npx eslint . → exit 0 · npx prettier --check --end-of-line auto . → all files pass
[x]  4. Unit tests        npm run test → 106 files | 1 skipped · 2894 passed | 2 skipped
[ ]  5. Golden parity     n/a
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → done; build/admin/index.html
                          carries noindex, nofollow + the title
[x]  7. Preview smoke     tests/e2e/admin-shell.spec.ts → 68 passed (4 projects)
[x]  8. Legacy untouched  only web/** and this file
[x] 12. Secrets/PII clean no keys; synthetic user/UUIDs only; the e2e never reaches a backend
[ ] 13. Ledger updated    → PR-C2 ledger step
[x] 14. Cross-engine e2e  admin-shell.spec.ts: chromium, webkit, Mobile Safari, Mobile Chrome all green
[~] 15. Automated a11y    a11y.spec.ts → 216 passed, 8 failed: /admin/ × light/dark × 4 projects. A signed-out
                          visit redirects to /admin/acceso/, S39's page, absent on this branch → Kit's
                          title-less 404 (document-title). With a stand-in sign-in route (scratch worktree,
                          not committed) /admin/ passes all 16 scans. The shell itself: 0 serious/critical
                          (admin-shell.spec, light + dark, desktop + drawer open).
[x] 16. WCAG 2.2          2.4.1 skip link · 2.4.2 titled pages · 2.4.3 focus order (drawer trap + return) ·
                          2.4.11 focus not obscured (scroll-padding-top = topbar) · 2.5.8 targets (40px rows,
                          44px on touch, 44px hit areas on the burger / close / logout) · 1.4.11 the current
                          item's edge · 3.2.3 consistent navigation · 1.3.1 landmarks, labelled lists ·
                          4.1.2 aria-current / aria-expanded / aria-controls / dialog + aria-modal
[!] 17. Budget            npm run budget → /admin/ has no baseline (139.4 kB); and 12 existing pages over
                          the 5% tolerance — see "Budget" below
[ ] 18. Supply chain      no dependency change
[x] 19. Security          V7: one deliberate sign-out path (local scope), full reload after it, expired
                          sessions replace the page; V8: nav from perms (UX only), RLS decides; framing
                          refused (D-037); noindex on admin routes
```

### Budget
Every existing page grew by ~1.6–1.7 kB gzip (`/` 41.8 → 43.5 kB measured at b837ef3 vs here). None of it is shell code; it is framework code the briefed design switches on, and every page carries the shared runtime:
- **≈0.67 kB — the first universal `load` in the app** (`(app)/+layout.ts` → `guardAdmin`). Kit 3 compiles universal-load support out of the client runtime while no route has one (`__SVELTEKIT_HAS_UNIVERSAL_LOAD__`, `client.js:1139`).
- **≈0.37 kB — shallow routing** (`pushState` and the shallow-navigation core it pulls into the runtime chunk). target-architecture §4 has every full-screen overlay use it, so the first user pays for all.
- **≈0.39 kB — the route manifest** in `app.js` (the new admin routes and nodes).
- **≈0.27 kB — chunk shifts:** `#lib/config` split into its own chunk (shared with the admin's client), and Kit's external-redirect checks behind `redirect()` (S38's guard).
Measured by bisection in a scratch build (a trivial `(app)` group with a `load` alone: +1.0 kB). The integrator's re-baseline covers it; `budget.json` is untouched. `/admin/` itself: Svelte + Kit runtimes, the icon sprite, and supabase-js behind the session store (no editors, PDF or canvas code).

## How to resume if interrupted
- Branch `c2/s37` (off `migrate/S37-S45-admin` @ b837ef3): the S37 commits on top.

## Landmines (S39 / S41 / S45 and the integrator read these)
1. **PageHeader is the page's first element.** Pages render inside the shell's content column (`max-inline-size: 1200px`, `--pd-md` padding) — no outer container of their own. Title, description and the page's primary actions go through `PageHeader` (`title`, `description?`, `actions?`); it sets the tab title and the mobile topbar title. Section headings inside the page start at h2.
2. **The sign-in notice is `?aviso=sesion-cerrada | sesion-expirada`** (`#lib/auth/notice.ts`): S39's sign-in page shows `SIGN_IN_NOTICES[signInNoticeFrom(page.url.searchParams)]` when not null. The expired link also carries the guard's `next`.
3. **To sign out from a page (S45), call `signOutAndLeave(scope)`** (`#lib/components/admin/shell/sign-out.svelte.js`) — never `session.signOut` alone: the shell would read the `signed-out` status as a session that ended under the page and send the visit to sign in with `next` (and no notice). It always leaves (auth-js drops this device's session even when the server is unreachable); to report a failure in place, `session.signOut('others')` first (it keeps this session and returns the server's answer), then `signOutAndLeave('local')`.
4. **The shell re-guards** on `signed-out` / `needs-mfa` / `needs-enroll` / `forbidden` after load (full-page leave). A page that steps a session down on purpose must expect to be left.
5. **`App.PageState`** lives in `src/app.d.ts` (`drawer?: boolean`). A branch adding its own shallow-routing state adds a field there; if another branch created the file too, merge the two interfaces.
6. **Vitest aliases `$app/state` and `$app/navigation`** to `tests/stubs/` (a runes `page` + router spies). A branch adding its own stubs for these keeps one pair. Tests that drive navigation import `page` / `resetPage` from `tests/stubs/app-state.svelte` (Kit's types do not know `resetPage`).
7. **Admin route links in `.svelte`**: `ROUTES.*` / `surface.route` are resolved strings; `<a href={…}>` with them needs the documented lint disable (NavItem has one) or a component prop (Button/IconButton `href` is not checked).
8. **The legacy panel link is the constant `/admin/`** (`LEGACY_PANEL_HREF`), never `resolve()`d; with `BASE_PATH=''` (S64) it would point at the new admin itself — remove the link at the cutover.
9. **`a11y.spec.ts` on `/admin/`** depends on S39's sign-in page (the signed-out redirect target); see box 15.
10. **Reduced motion + `visibility`:** the global guard (`base/motion.css`) gives every element a 0.01ms transition, so toggling `visibility` on a container lags its descendants by a frame — axe can read them hidden. Prefer `inert` (or `display`) for closed overlays (S12b).

## On completion (PR-C2 ledger step)
- [ ] MIGRATION.md: S37 on the board; candidate gotchas — G-0xx Kit 3 strips universal-load support until the first route `load` (every page pays ~0.7 kB when it lands); G-0xx reduced-motion `transition-duration` on `*` makes inherited `visibility` lag (use `inert`).
- [ ] ROADMAP S37 row → done (amended done-when per D-036: prerendered `ssr = false` shells, no fallback).
- [ ] budget.json re-baseline (integrator).

## Public-page cost (2026-10-19, PR-C2 integration)

One SvelteKit app means one client runtime, so the integrated admin grew every public page's
initial JS. Measured on the `/app` build (gzip, `npm run budget`) and the throttled lab profile
(`perf.spec.ts`, chromium):

| | `/` initial JS | files | `/kit/states/` LCP |
|---|---|---|---|
| Before the admin (budget baseline) | 40.3 kB | 14 | — |
| Admin integrated, untuned | 45.1 kB (+11.8%) | 18 | 2524–2696 ms (over 2.5 s) |
| After the reductions below | 41.8 kB (+3.7%) | 8 | 2212 ms |

Reductions:
- **The (app) guard runs in the layout component, not a universal `load`** — Kit strips its
  universal-load support from the client until one exists (≈ 0.7 kB on every page). Same
  decisions, same redirect targets (`guardAdmin` logic unchanged); the shell renders nothing until
  the session store settles.
- **Client chunk groups** (`web/client-chunks.ts`): the startup code every page loads (Kit's client,
  the Svelte runtime, the root layout's theme and config) is regrouped into a few files instead of
  a dozen, and admin-only modules stay in admin chunks — fewer preloads competing with the
  render-blocking CSS, and a shorter dependency map in `app.js`. A unit test and a build guard keep
  admin chunks out of public pages' preloads.
- **Small per-component stylesheets are inlined** (`inlineStyleThreshold`, 4 KB): a page with
  several primitives spent a whole extra round trip on them before first paint over HTTP/1.1 (G-041);
  Kit's hash-mode CSP hashes the inlined `<style>` blocks.

What remains is inherent to one app: shallow routing, `goto` / `beforeNavigate`, and the admin
routes' entries in the client manifest. Admin pages themselves are 133–165 kB (supabase-js, the
session check and the shell) and are client-rendered shells (D-036): `perf.spec.ts` records their
LCP and gates their CLS; `budget.json` holds their size. Re-measure at the public cutover (S23+).

