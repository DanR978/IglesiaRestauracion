# Architecture — Church Center first

> Snapshot 2026-10-18, pinned to `f3b8c94` (`origin/develop`; same tree as production `main`).
> [`MIGRATION.md`](../../MIGRATION.md) remains the single source of truth for status and locked
> decisions — if anything here disagrees with it, the ledger wins. Update these pages when a decision
> they describe changes, not every session.
>
> **This folder is public** (GitHub, and served on www.irdlex.org). Never record unpatched
> vulnerabilities, Planning Center account details, personal data, or tester names here.

## Executive summary

1. **What Church Center supports.**
   - It is one shared iOS/Android app (iOS 16.0+, English UI) plus `<subdomain>.churchcenter.com`.
   - Churches can't ship a branded app, use a custom domain, add native screens or plugins, or
     embed a web app (Publishing has no HTML/iframe/script block).
   - The supported mechanism is a **navigation item, home-page button or page link that points to an
     external URL**.
   - How the app opens that URL — in-app browser tab, embedded WebView or system browser — is not
     documented and must be measured.
   - A Church Center user's identity can't reach an outside site.
2. **Recommended integration: link out.** Church Center links point at the canonical
   `https://www.irdlex.org/<path>/` pages, tagged `utm_source=churchcenter`. irdlex.org stays the
   system of record and is identical for people without the app. If the pilot passes, go-live is
   configuration only. Every public URL is frozen (D-001), so the links survive each cutover; each
   cutover still gets a Church Center check.
3. **Framework and architecture: keep the SvelteKit port** (Svelte 5, TypeScript, prerendered public
   pages, browser-rendered admin) **and upgrade it to SvelteKit 3** before the admin shell. On top
   of that:
   - read/write results that distinguish errors from empty data;
   - three-layer CSS tokens with motion tokens;
   - an explicit per-context session policy;
   - WebKit and mobile projects in CI.
4. **Why this beats the alternatives.** Church Center gives no framework an advantage. Angular 22 is
   capable and has a published LTS, but switching would rebuild the components, stores, routing and
   tests the port already has, for no compatibility gain. React, Vue and Astro are full re-platforms;
   staying vanilla keeps the debt that motivated the port.
5. **Major risks and open questions:**
   - the link-open mechanism per platform, which drives storage, downloads, popups and the service worker;
   - whether the free Publishing plan allows external navigation items;
   - separate staff sessions inside the iOS app;
   - WebKit's 7-day storage purge;
   - English-only Church Center UI around a Spanish site;
   - frequent app releases;
   - never submitting minors' data in tests.
6. **First milestone — CC1, the Church Center feasibility pilot.**
   - **What:** a small `noindex` diagnostic page under `/app/` plus a temporary, owner-approved Church
     Center link, run on real iOS and Android devices.
   - **Accepted when:** every required cell of the device matrix is recorded with device, OS and app
     version; the link-open mechanism is known per platform; each public surface is marked link-ready or
     blocked; there are zero legacy code changes and zero real registrations.

## Reading order

| Document | Answers |
|---|---|
| [church-center-compatibility.md](church-center-compatibility.md) | What Planning Center officially supports, with sources, statuses, tests and the configuration guide |
| [current-state-audit.md](current-state-audit.md) | What the app is today (legacy and port) and what to preserve, refactor, replace or retire |
| [architecture-options.md](architecture-options.md) | SvelteKit vs Angular, React, Vue, Astro and vanilla, scored on the brief's criteria |
| [target-architecture.md](target-architecture.md) | Layers and dependency rules, routing, auth and sessions, data, errors, security, deployment |
| [design-system.md](design-system.md) | Token layers, theming, styling strategy, component conventions |
| [mobile-compatibility.md](mobile-compatibility.md) | Supported environments, mobile rules, test matrices, results log |
| [migration-roadmap.md](migration-roadmap.md) | Phase charters, critical path, owner decisions |
| [testing-and-rollout.md](testing-and-rollout.md) | Proposed quality gates, deployment, monitoring, rollback |
| [implementation-backlog.md](implementation-backlog.md) | Prioritized index of the work, by existing IDs |

## Decisions

| ADR | Decision | Ledger |
|---|---|---|
| [ADR-0001](architecture-decisions/ADR-0001-church-center-link-out.md) | Church Center integration by link-out; irdlex.org stays the system of record; Supabase Auth stays the only identity provider | D-029 |
| [ADR-0002](architecture-decisions/ADR-0002-frontend-platform.md) | Continue SvelteKit; upgrade to SvelteKit 3; browser-support policy | D-030 |
| [ADR-0003](architecture-decisions/ADR-0003-design-tokens.md) | Three-layer CSS tokens plus motion tokens; no preprocessor or token pipeline | D-031 |
| [ADR-0004](architecture-decisions/ADR-0004-repo-results.md) | Data-layer results distinguish errors from empty data | D-032 |
| [ADR-0005](architecture-decisions/ADR-0005-staff-oauth.md) | Staff sign-in with Google and Microsoft, federated through Supabase Auth | D-035 |

## Relation to the migration machinery

- [`MIGRATION.md`](../../MIGRATION.md) — status board, locked decisions, gotchas (append-only).
- [`docs/migration/ROADMAP.md`](../migration/ROADMAP.md) — the session backlog. The 2026-10-18
  amendments add Track CC and S02b/S05b/S11b/S12b/S22b.
- [`docs/migration/DESIGN-SYSTEM.md`](../migration/DESIGN-SYSTEM.md) — component appearance and
  state matrices.
- [`docs/migration/PORT-DEBT.md`](../migration/PORT-DEBT.md), [`VERIFICATION.md`](../migration/VERIFICATION.md),
  [`DUAL-MAINTENANCE.md`](../migration/DUAL-MAINTENANCE.md) — unchanged rules this folder builds on.

**Conventions:** statuses are Confirmed / Conditional / Unsupported / Unknown. Every external claim
carries a link and an as-of date; anything unverified is labeled an assumption. Nothing here claims a
device test has passed until it is logged in mobile-compatibility.md §5.
