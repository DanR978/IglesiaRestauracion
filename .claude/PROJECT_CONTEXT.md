# Project Context

> Orientation for anyone (human or AI) working in this repo. Read alongside
> [CLAUDE.md](CLAUDE.md) (engineering rules) and [TASKS.md](TASKS.md) (active backlog).
> The root [README.md](../README.md) has the full feature/tech tour — this file
> captures the things that aren't obvious from the README.

## What this is

The official website + admin console for **Iglesia Restauración Divina** (irdlex.org),
a bilingual (Spanish-first) church in Lexington, KY. Public-facing marketing/ministry
site plus a private admin platform for managing events, registrations, finances, and users.

- **Live:** https://www.irdlex.org
- **Audience:** Hispanic Christian community; copy is primarily Spanish.
- **Hosting:** GitHub Pages (custom domain via `CNAME`), deployed by GitHub Actions on push to `main`.

## Architecture at a glance

- **No framework.** Vanilla ES Modules under `js/`, hand-rolled component helpers in
  `js/components/`, page controllers in `js/pages/`, shared libs in `js/lib/`.
- **Routing** is folder/`index.html` (clean trailing-slash URLs). Each public section is its own folder.
- **CSS is generated.** Edit sources in `css/{tokens,base,layout,components,sections,pages,utilities}/`
  and run `npm run build:css`. **Never hand-edit `css/style.css` or `css/admin.css`** — they are build output.
- **HTML partials** in `src/` (header, footer, contact form, event blocks) are inlined into pages at build time via `npm run inline`.
- **Page `<head>`s are generated** from a data map by `scripts/build-heads.mjs` — edit the map, not the per-page head.
- Full pipeline: `npm run build:site`. Dev server: `npm run dev` (Vite — **not** Live Server, or `import.meta.env` crashes).

## Backend (Supabase)

Auth + Postgres + Storage + Edge Functions + Realtime. Browser uses the public anon key;
**RLS is the security boundary** (anon read / authenticated write). Service-role keys live only
in Edge Functions, never in the browser. `js/lib/config.js` is generated at deploy from GH secrets (gitignored).

**Edge Functions** (`supabase/functions/`): `youtube-live` (proxies YouTube Data API, keeps key server-side),
`admin-invite` (invite-only account creation), `newsletter-subscribe`.

**Migrations** (`supabase/migrations/`) — key tables:
- Admin platform: `app_settings`, `audit_log`, `admin_notifications`, page-permission grants.
- Finances / treasury: `fin_funds`, `fin_income`, `fin_expenses`, `fin_budgets`, `fin_payables`,
  `fin_recurring`, `fin_notes`, `fin_income_categories`, `fin_expense_categories` (fund accounting).
- Events: `special_events` + `event_registrations` (the event sign-up + QR feature).
- `newsletter_subscribers`.

> ⚠️ Migrations are applied **manually** to the hosted Supabase project. There is no automated
> migration runner — when you add a migration, the schema must be applied by hand before the UI relying on it works.

## Admin console

Single entry at `admin/index.html` (noindex, loads `css/admin.css`). Covers: event CRUD wizard,
calendar management, image uploads, **registrations management**, **treasury/finances**, **user management**
(invite-only accounts, roles, per-page permissions). Admin UX conventions (collapsible panels,
no horizontal scroll, contrast) are documented in [docs/admin-ux.md](../docs/admin-ux.md).

## Current focus / in-flight work

> **Roles/access overhaul + treasury plan (2026-06-30):** see
> **[CONTEXT-roles-treasury.md](CONTEXT-roles-treasury.md)** for full detail — the new
> role-preset/access model (Desarrollador/Administrador/Tesorería/Medios), palette/maintenance/
> notifications changes, the **pending manual deploy steps** (3 migrations + `admin-invite`
> redeploy), and the planned treasury work (paid-payable bug, Presupuestos removal, per-ministry budgeting).

- **Admin auth hardening** — invite-only accounts, **role presets** (replaced per-user ministry +
  page checklists), two admin tiers (Desarrollador/Administrador), MFA, RLS tightening.
- **Event registration improvements** — see [TASKS.md](TASKS.md): multiple children per parent,
  emergency contact, consent form w/ signature, celebration modal, QR landing animation,
  admin age-groups, registration lifecycle (close/complete/auto-complete).

## Conventions & gotchas

- **Mobile-first**, Spanish-first copy, neon/animated but church-appropriate UI; prefer CSS animations over JS.
- Generated artifacts (`css/style.css`, `css/admin.css`, page `<head>`s, inlined partial bodies, `sitemap.xml`,
  `js/lib/config.js`) — **change the source, then rebuild**; don't edit the output.
- Public site has **no build framework runtime** — keep dependencies minimal; `qrcode` is the only runtime dep.
- When touching schema, follow the CLAUDE.md rule: migration → types → validation → API → UI, all updated together.
