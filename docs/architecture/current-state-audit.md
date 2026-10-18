# Current-state audit

> Snapshot 2026-10-18 · repo `f3b8c94` (`origin/develop`; its tree is identical to production
> `origin/main` `d785d38`, so this describes what www.irdlex.org serves). PRs #39 (contact form via
> Resend), #40 and #42 (admin-editable Líderes page) are included. Counts come from grep on that tree.
> The unmerged branch `migrate/S23-S36-public-site` is described only where labeled. Security posture
> is described as **target controls** and existing ledger IDs; see the note in §10.

## 1. Framework, language, build tooling, runtime

| | Legacy (live) | Port (`web/`, served under `/app/`) |
|---|---|---|
| Language | Vanilla ES modules, hand-written HTML/CSS | TypeScript strict, Svelte 5 (runes forced on) |
| Framework | none | SvelteKit 2.69.3 + adapter-static 3.0.10 (static HTML, `fallback: 404.html`, `paths.relative=false`) |
| Build | **None in production.** `deploy.yml` runs generators in place: CSS concatenation (`scripts/build.sh`), `<head>` generation, sitemap, HTML-include inlining, and writes `js/lib/config.js` from GitHub Secrets. Vite ^6.4.1 is dev-server only | Vite ^8.1.4 build in CI and deploy; `BASE_PATH=/app` |
| Third-party code | CDN URLs (§8) | npm, lockfile; supabase-js 2.112.3 is the only runtime dependency |
| Runtime | Browser only; Supabase from the client with the anon key | same |
| Hosting | GitHub Pages, custom domain `www.irdlex.org`, one artifact containing both sites; no response-header control | same artifact |

## 2. Application structure and routing

**Public pages** (19 HTML pages load `js/main.js`; shared header/footer are inlined at deploy):

| URL | What it does | Supabase use |
|---|---|---|
| `/` | Hero video, event promo, latest sermon, gallery teaser, map (MapLibre), verse of the day, newsletter, contact form | reads `special_events`, `gallery_albums`; `newsletter-subscribe`, `contact-submit`, `youtube-live` functions |
| `/eventos/?view=list\|month\|gallery` | Combined events hub with category filter | reads `calendar_events`, `events`, `special_events` |
| `/eventos/evento.html?id=` | Event detail, directions, add-to-calendar | reads `events` |
| `/eventos/evento-especial.html?e=\|?id=` · `/eventos/registro.html?e=\|?id=` | Special-event landing and the multi-participant registration wizard with waiver and signature | reads `special_events`; anon insert into `event_registrations` |
| `/discipulado/` · `/discipulado/grupo/?slug=\|?id=` | Levels and groups; interest pop-up; four-step group sign-up | reads `discipleship_groups`; anon insert into `discipleship_interests` |
| `/galeria/` · `/galeria/album/?slug=\|?id=` | Albums, year picker, photo grid, lightbox | reads `gallery_albums`, `gallery_photos` |
| `/sermones/` | YouTube playlist grid and player | YouTube Data API from the browser |
| `/lideres/` | Leaders roster with opt-in contact icons (D-028) | `leaders_directory()` RPC |
| `/quienes-somos/`, `/vision-valores/`, `/doctrina/`, `/proximos-pasos/`, `/visitanos/`, `/contacto/`, `/donacion/`, `/linktree/`, `/poliza-de-privacidad/` | Content pages; contact form on several; `/visitanos/` directions; `/donacion/` says online giving is "próximamente" | shared reads |
| `/calendario/` → `/eventos?view=month`; `/pastor/` | Client-side redirects | — |

Every main.js page also queries `events` on load, re-polls every 120 s, subscribes to a Realtime
channel, checks maintenance mode, and loads analytics.

**Admin** — one page, `/admin/`, 15 tab panels switched without history entries:

| Tab | Who sees it |
|---|---|
| Inicio, Mi cuenta | everyone signed in |
| Eventos → Calendario / Próximos / Registraciones | admin; treasurer read-only (not Registraciones); leaders with the granted tab |
| Tesorería | admin and treasurer; leaders granted `treasury` see their ministry/project books (D-027) |
| Discipulado, Galería | admin; leaders with the granted tab |
| Analíticas, Líderes, Ministerios, Usuarios, Actividad, Configuración | admin |

Roles are `admin`, `ministry_leader` and `treasurer` plus per-account `allowed_tabs`, set through
presets (Desarrollador, Administrador, Tesorería, Medios). Client gating (`applyTabAccess`) is
cosmetic; RLS (`is_admin()`, `has_tab()`, `my_ministry_ids()`, `can_finance()`) is the guard.

**Port routes on `main`:** a placeholder at `/app/` and 14 `/app/kit/*` showcase pages. The S23
branch adds `(public)` and `(bare)` groups (a real homepage; the other public routes are stubs).
No `(admin)` group exists yet (S37).

## 3. Backend architecture and API contracts

- One Supabase project; PostgREST through supabase-js from the browser; RLS on every table (D-002).
- **Schema:** 25 migration files (two baseline dumps + dated migrations; applied by hand, see
  `supabase/README.md`), 37 tables and 6 storage buckets:

  | Domain | Tables |
  |---|---|
  | Events | `events`, `calendar_events`, `calendar_presets`, `special_events`, `event_registrations` |
  | Discipleship | `discipleship_groups`, `discipleship_members`, `discipleship_interests`, `discipleship_messages` |
  | Gallery | `gallery_albums`, `gallery_photos` |
  | Treasury | `fin_funds`, `fin_income`, `fin_income_categories`, `fin_expenses`, `fin_expense_categories`, `fin_payables`, `fin_recurring`, `fin_projects`, `fin_notes`, `fin_receipts` |
  | People and admin | `profiles`, `invitations`, `role_presets`, `ministries`, `admins`, `audit_log`, `admin_notifications`, `app_settings` |
  | Communication | `newsletter_subscribers`, `newsletter_dispatch_log` |
  | Designer | `designs`, `design_shares` |
  | Analytics | `analytics_events`, `analytics_salts` |
  | Leaders | `leader_sections`, `leader_members` |

  Buckets: `avatars`, `gallery`, `event-images`, `design-assets`, `leaders`, `receipts` (private).
- **RPCs called by the client:** `leaders_directory()` (public), `analytics_summary` /
  `analytics_live` (`has_tab('analytics')`), `set_my_avatar`, `set_my_display_name`.
  Policy helpers: `is_admin`, `has_tab`, `has_any_tab`, `my_ministry_id(s)`, `can_finance`,
  `is_finance`, `is_treasurer`, `is_aal2`.
- **Edge Functions (Deno; `deno.land/std@0.177.0`, `esm.sh/@supabase/supabase-js@2`):**

  | Function | Purpose | Called as |
  |---|---|---|
  | `admin-invite` | Account and preset management through `callAdmin(action, payload)`: `list`, `invite`, `resend`, `revoke`, `set-role`, `delete`, `reset-mfa`, `list-presets`, `save-preset`, `delete-preset`; re-checks that the caller is an admin | signed-in admin (JWT verified) |
  | `contact-submit` | Contact form → Resend to the church inbox; drops foreign origins and honeypot hits | anonymous |
  | `newsletter-subscribe` / `-unsubscribe` | Subscription and one-click unsubscribe | anonymous |
  | `newsletter-broadcast` / `-reminders` | Monthly digest and day-before reminders | cron with a shared secret |
  | `receipts-cleanup` | Annual receipt retention (D-018) | cron with a shared secret |
  | `track` | Cookieless first-party analytics; keeps the path, `id`/`e`/`slug`/`view` and `utm_*` | anonymous, origin allow-list |
  | `youtube-live` | Live/upcoming stream check | JWT verified |

## 4. Authentication, authorization, sessions, roles

- **Supabase Auth**, email + password, invite-only. Accounts are created by `admin-invite` with the
  service role; public sign-up is turned off through the Auth configuration that
  `supabase/apply-auth-email.mjs` applies (a manual step, not visible in code).
- **Email links** (invite, recovery) land on `/admin/?action=…&token_hash=…&type=…` and complete
  with `verifyOtp`. That is robust against mail scanners and works in whichever browser opens the
  email.
- **Second factor:** TOTP enrollment lives in Mi cuenta → Seguridad. Client and database enforcement
  is owed by S39 (D-010; G-016).
- **Sessions:** supabase-js defaults in both codebases — localStorage key `sb-<ref>-auth-token`,
  implicit flow, auto-refresh (verified in `@supabase/auth-js` `DEFAULT_OPTIONS`). Legacy and `/app`
  share the key on the same origin. Legacy doesn't subscribe to `onAuthStateChange`, so an expired
  session shows up as failed queries.
- **Public site:** anonymous. A signed-in staff member's token also rides on public-page requests on
  the same origin.

## 5. Data models and state management

- Domains as in §3. Money is `numeric` dollars in the database; the port computes in integer cents
  (D-003).
- **Legacy state:** module-scoped variables plus `js/pages/admin/state.js` (`currentProfile`,
  `isAdmin()`, …). **Port state:** rune stores (`toast`, `confirm`, `lightbox`, action sheet,
  `theme`); S38 adds session, permissions and ministries.
- **Realtime channels:** events (every public page), discipleship groups, gallery albums/photos,
  admin notifications, registrations, discipleship interests.
- **Port repos:** ~39 read and ~46 write functions across events, gallery, discipleship,
  registrations, receipts and treasury. Reads return a safe empty on error; ADR-0004 changes that.
  No UI consumes them on `main` yet.

## 6. CSS, design conventions, component patterns

| | Legacy | Port |
|---|---|---|
| Build | `css/style.css` (~355 KB) concatenated from `css/{tokens,base,layout,components,sections,pages,utilities}`; 24 admin CSS files (~183 KB) linked directly from `admin/index.html` | `app.css` cascade tokens → base → layout → utilities (test-enforced) + scoped component styles |
| Tokens | raw ramps and semantic roles in one `:root`; two type scales (`--fs-*`, `--size-*`) | ported names; `--fs-*` re-tuned monotonic (D-015/D-022); money/status vocabulary (D-016/D-023); admin slate scope (D-014/D-021) |
| Dark mode | token override in `css/tokens/colors.css` **plus ~25 component-level `prefers-color-scheme` blocks in 17 files**, which defeat forced themes | one mechanism, only in `tokens/colors.css` (D-017); no `color-scheme` declared |
| Hard-coded values | ~528 hex literals in 63 files (about half are `var()` fallbacks); ~550 literal rem/em font sizes vs 173 `var(--fs-*)` | no hex outside comments in primitives; 14 raw-palette references in 4 primitives |
| Naming | BEM; per-feature admin namespaces; `ird-btn` global button | BEM, `ird-` primitives |
| Breakpoints | desktop-first; ~25 distinct values in use | canonical 768/640/600/480 + 900/1100 |

## 7. Responsive behavior and mobile issues

Issues that matter for link-out traffic (details and rules in [mobile-compatibility.md](mobile-compatibility.md)):

- **Text and inputs:** `--fs-sm` is `clamp(0.55rem, 0.05rem + 1vw, 0.9rem)`, about 8.8px on a 360px
  phone (its comment says 14–16px). The ≥ 16px input rule in `css/base/forms.css` loses to more
  specific `select`/`textarea` rules in several forms, so iOS zooms on focus.
- **Payload on every page:** a 5,066,023-byte verse JSON fetched with a cache-buster (only the home
  page renders it), jQuery 3.6.4 + Bootstrap 4.6.2 (unused), a Realtime socket and a 2-minute events
  poll.
- **Popups and downloads:** directions call `window.open` from inside geolocation callbacks; the iOS
  add-to-calendar is a blob `.ics`; admin PDFs use pdfmake `.download()`; CSV/QR exports are blob
  downloads; the gallery's download link points at a cross-origin URL, so the `download` attribute is
  ignored.
- **Layout:** public pages set `viewport-fit=cover` and pad fixed bottom UI with safe-area insets;
  the admin does neither. Several admin controls are 15–34px; some admin actions appear only on hover.
- **Navigation and state:** admin tabs, sermons and hub views add no history entries; wizard state
  lives only in memory; scroll locking isn't reference-counted.
- **Service worker (`sw.js`, scope `/`):** caches every successful HTML response
  (including each `?id=` URL) with no eviction; skips only `/admin`, `sw.js` and `manifest.json`, so
  it also intercepts `/app/*` (G-034). Registration waits for `load` after a dynamic import.

## 8. Dependencies and maintenance status

| Dependency | Where | Version | Pinned | Notes |
|---|---|---|---|---|
| supabase-js | legacy `js/lib/supabase.js` | jsDelivr `+esm` | — | port: npm 2.112.3 (npm latest 2.118.0); exact pins for runtime CDN code are a target control ([target-architecture.md §11](target-architecture.md#11-security-target-controls)) |
| pdfmake + vfs_fonts | `js/lib/pdf.js` | 0.2.10 (cdnjs) | yes | preserved (D-009, G-007) |
| pdf.js | `js/lib/pdf.js` | 3.11.174 (cdnjs) | yes | report previews |
| qrcode | `js/lib/qr.js` | 1.5.4 (jsDelivr) | yes | also a vestigial root npm dependency |
| maplibre-gl | `js/pages/home/map.js` | 6.11.2 (jsDelivr, CSS with SRI) | yes | OpenFreeMap tiles |
| @zag-js/vanilla, pin-input | `js/lib/captcha.js` | 1.44.0 (esm.sh) | yes | |
| jQuery / Bootstrap bundle | `js/app/ui.js` | 3.6.4 / 4.6.2 (cdnjs) | yes | loaded but unused |
| Font Awesome | all pages | 6.5.0 (cdnjs, SRI on public pages and in the port) | yes | |
| GA4 | `js/lib/analytics.js` | `G-GXK6QZWMC9` | — | alongside first-party `track` (D-026) |
| Edge Function deps | `supabase/functions/*` | std 0.177.0, supabase-js `@2` (major only) | partial | |

## 9. Testing, deployment, CI/CD, environment

- **Legacy:** no tests or lint run in CI. The root `npm test` (two Node tests) is never invoked.
- **Port:** Vitest under jsdom (unit, golden-parity suites against legacy outputs, component tests),
  Playwright e2e specs (Chromium only, no `projects`, **not run in CI**), svelte-check, ESLint with
  the custom `local/no-raw-html` rule (G-029), Prettier. No coverage threshold, no axe, no
  performance budget.
- **CI (`ci.yml`, pull requests):** job `web` — `npm ci` → `check` → `lint` → `test` → build with
  `BASE_PATH=/app`; job `ledger` — PRs labeled `migration` must touch `MIGRATION.md`. Node 24.
- **Deploy (`deploy.yml`, push to `main`):** legacy generators → build `web/` → copy to `app/` →
  prune → upload the repo root. The prune keeps `docs/`, root `*.md` and `.claude/*.md`, so those
  are publicly served (G-035). `build-css.yml` commits a regenerated `style.css`.
- **Branch flow:** feature branch → `develop` → release PR → `main`. Branch protection is still
  pending (MIGRATION.md §1).
- **Environments:** one production Supabase project. A local stack (Docker) rebuilds the schema from
  git. A staging project for PII-touching end-to-end tests is required by the PII rule but not
  confirmed to exist.

## 10. Technical debt, duplication, security

- **Debt:** 288 `innerHTML` writes guarded by manual escaping; 17 `window.__*` globals behind inline
  `onclick`; duplicate global modal IDs (G-009); two toast systems; four menu implementations;
  orphaned `css/admin.css`; cosmetic settings toggles (G-011); `index.html` loads
  `js/components/live-embed.js`, whose target elements no page contains.
- **Security** is tracked where it already lives: open ledger items G-015, G-016, G-017, G-030,
  G-031 and G-032; PORT-DEBT rows S30 (client-side YouTube key) and S32–S34 (registration abuse
  controls). Target controls are in
  [target-architecture.md §11](target-architecture.md#11-security-target-controls). Security fixes
  identified by this audit are scheduled with the owner and get documented together with their fixes
  (`docs/migration/DUAL-FIX-BACKLOG.md`), because this folder is public.

### Preserve · refactor · replace · retire

| Action | Items |
|---|---|
| **Preserve** | Supabase schema, RLS and Edge Functions (D-002, D-009); every public URL (D-001); `pdf.js`, `waiver`, the Fabric engine (D-009, D-011); analytics backend (D-026); leaders backend (D-028); Resend email setup; token names |
| **Refactor (in the port)** | repo results (ADR-0004); token layers + motion (ADR-0003); one overlay focus-trap stack; auth flows with session-expiry handling (S38/S39) |
| **Replace** | legacy pages → SvelteKit routes per the ROADMAP; `include.js` chrome → layouts; two toast systems → one; inline `onclick` globals → event handlers; legacy `sw.js` → SvelteKit service worker (S35); browser-side YouTube key → build-time fetch (S30) |
| **Retire** | jQuery/Bootstrap loading; the per-page verse download; `css/admin.css`; cosmetic toggles (G-011); the dead live-embed call |
