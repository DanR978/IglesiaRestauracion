# Implementation backlog

> Snapshot 2026-10-18 · repo `f3b8c94`. A prioritized **index of existing IDs**: sessions in
> `docs/migration/ROADMAP.md`, rows in `PORT-DEBT.md` / `DUAL-FIX-BACKLOG.md`, and decisions or
> gotchas in `MIGRATION.md`. It introduces no new numbering. CC1 findings are filed into PORT-DEBT (port
> surfaces) or DUAL-FIX-BACKLOG (qualifying legacy fixes), then indexed here.

## P0 — next

| ID | Item | Depends on | Done when |
|---|---|---|---|
| CC1 | Church Center feasibility pilot ([session spec](../migration/sessions/CC1-church-center-pilot.md)) | owner: Planning Center access, decisions §5.2–5.3 in [migration-roadmap.md](migration-roadmap.md#5-owner-decisions) | matrix logged; link-open mechanism known; surfaces marked link-ready / blocked |
| DF-(next) | Security fixes scheduled with the owner (details withheld until patched) | one `fix/` branch each (DUAL-MAINTENANCE #1, D-012) | each fixed, then documented with its reproduction in DUAL-FIX-BACKLOG |
| Owner | Pending manual steps already in the ledger: the G-015 maintenance migration, the D-027 shared-treasury migration, the D-028 review-fix migration, branch protection | — | MIGRATION.md §1 "Current state" cleared |

## P1 — before the admin shell (S37)

| ID | Item | Depends on | Done when |
|---|---|---|---|
| S02b | SvelteKit 3 upgrade (ADR-0002): TypeScript pinned ^6, adapter-static 4, `#lib`, config in `vite.config.ts`, `$app/env` | — | VERIFICATION 1–13 green on Kit 3 |
| S05b | Cross-engine e2e in CI, axe, JS budget, import-boundary lint, VERIFICATION boxes 14–19 | S02b | boxes added to VERIFICATION.md and green |
| S22b | `ReadResult` / `RepoError` across all repos (ADR-0004) | S02b | no repo returns an empty value for a failure; tests updated |
| CC2 | Church Center go-live on the live site | CC1 | items published; register filled; visits visible in Analíticas |
| S12b | Mobile viewport and overlays: `viewport-fit=cover`, safe areas, `dvh`, keyboard, one focus-trap stack, back closes overlays, legacy `sw.js` skips `/app/*` (G-034) | CC1 | e2e on 4 projects green; no component prop changes |

## P2 — with the sessions that own them

| ID | Item | Notes |
|---|---|---|
| S11b | Motion tokens, `color-scheme`, enforcement tests (ADR-0003) | after the S23 branch merges |
| S24 | Entry marker (`utm_source=churchcenter` → sessionStorage) in the analytics beacon | payload unchanged otherwise (D-026) |
| S28 | Redirect stubs forward `location.search` and the hash | keeps Church Center and QR links valid |
| S35 | Service worker optional; works when absent; replaces G-034 handling | |
| S36 | VERIFICATION box 20 (Church Center check) on every cutover PR | |
| S37 | Admin routes with history entries; frame-guard on admin routes | |
| S38/S39 | `onAuthStateChange` + session-expired screen; `token_hash` links kept; `/app/` in the Auth redirect allow-list; CodeInput (`@zag-js/svelte` pin input, paste, `one-time-code`); MFA enforcement (D-010, G-016) | ASVS V6/V7/V8 Level 2 checklist |
| Owed components | IconButton, Badge, Alert, State components, FormField, Switch, SegmentedControl, MultiSelect, PasswordField, CodeInput | built by their first consuming session (design-system.md §2) |
| PORT-DEBT S16, S17, S21, S29, S37, S46 | Focus traps, menus, raw errors and horizontal scroll, the year wheel, the drawer, hover-only photo actions | the mobile-relevant rows |
| PORT-DEBT S30 | YouTube key moves to build time | |
| PORT-DEBT S32–S34 | Registration abuse controls; signature size cap; typed-name alternative (WCAG 2.5.7) | |

## P3 — on a trigger only

| Trigger | Item |
|---|---|
| The church adopts Planning Center Giving or Registrations | Church Center modal on irdlex.org (new ADR, CSP, privacy policy) |
| Staff ask for Planning Center sign-in and all have Planning Center logins | Planning Center OIDC through an Edge Function (new ADR) |
| The Calendar API gains event creation (developers #1481) | Re-evaluate publishing events to Church Center |
| S65 | CSP (`csp` hash mode), exact pins + SRI, the frame-guard confirmed, internal docs out of the artifact (G-035) |

## Legacy candidates — only by owner exception

DUAL-MAINTENANCE allows legacy changes only for security, legal or production-down issues. These
improve Church Center traffic but are none of those. They need an explicit owner exception (precedent:
D-026/D-027/D-028), and only if CC1 shows real impact:

- stop downloading the ~5 MB verse file on every page;
- make `select` and `textarea` compute ≥ 16px on phones;
- drop the unused jQuery and Bootstrap;
- raise the `--fs-sm` floor (about 8.8px on phones).

## Findings on `migrate/S23-S36-public-site` (local branch — verify before acting)

From a read-only review on 2026-10-18; none verified in a browser.

- The mobile drawer may render at the header's height: `backdrop-filter` on the open header makes it
  the containing block of the fixed drawer.
- The smoke spec still expects the placeholder text the branch removed.
- `YT_API_KEY` isn't passed to the CI/deploy builds, so the sermon snapshot is empty.
- The hero background video has no pause control (WCAG 2.2.2).
- One hex literal in `FloatingUI.svelte` (the hex test scans CSS files only).
- In the dark admin theme, `strong` text uses the slate accent at about 2.1:1.
- `RichText` renders nothing during prerender (no `DOMParser` in Node).
- `StateBox` makes Retry optional; DESIGN-SYSTEM §5.3 requires it.
