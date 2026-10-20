# Testing and rollout

> Snapshot 2026-10-18 · repo `f3b8c94`. The binding gate is
> [`docs/migration/VERIFICATION.md`](../migration/VERIFICATION.md). Boxes 14–19 below are live there
> since S05b (2026-10-19); box 20 is still proposed, for the first cutover PR. Until branch
> protection is turned on for `main` and `develop`, every gate is advisory (MIGRATION.md §1).

## 1. Proposed gates

| Box | Gate | Threshold | How |
|---|---|---|---|
| 14 | Cross-engine e2e | 0 failures | Playwright projects `chromium`, `webkit`, `Mobile Safari` (iPhone), `Mobile Chrome` (Pixel), run in CI on PRs touching `web/` |
| 15 | Automated accessibility | 0 serious/critical violations on every public route and `/app/kit/*` page, light and dark | `@axe-core/playwright` (4.14.0 on 2026-10-18; one new dev dependency) |
| 16 | Manual WCAG 2.2 AA checks for the surface ported | each applicable criterion recorded in the PR | 2.4.11 Focus Not Obscured (sticky header, bottom bars), 2.5.7 Dragging Movements (signature pad, reordering), 2.5.8 Target Size, 3.2.6 Consistent Help, 3.3.7 Redundant Entry (multi-participant registration), 3.3.8 Accessible Authentication (paste allowed, `autocomplete`) — [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) |
| 17 | Performance budget | initial JS per prerendered route ≤ the recorded baseline + 5%; lab LCP ≤ 2.5 s and CLS ≤ 0.1 on a throttled mobile profile | a Node script sums the gzip size of the JS each page in `web/build` references and compares it with a committed budget file (no new dependency); lab LCP/CLS via Playwright + Chromium throttling. Field INP only if client reports are approved ([web.dev](https://web.dev/articles/vitals)) |
| 18 | Supply chain | `npm audit --omit=dev --audit-level=high` clean, or an exception recorded in the PR; any runtime CDN URL carries an exact version | CI step |
| 19 | Security checklist (sessions touching auth, data or Edge Functions) | checklist pasted in the PR | OWASP ASVS 5.0 ([project](https://owasp.org/projects/asvs)) Level 1 for public surfaces; Level 2 for V6 Authentication, V7 Session Management, V8 Authorization on the admin |
| 20 | Church Center check (cutover PRs) | the cut-over URL opens from its Church Center link and passes its flow on E2 and E5 | manual, recorded in [mobile-compatibility.md §5](mobile-compatibility.md#5-results-log) |

Box 6 ("prerender ran with no network access") already conflicts with S26's build-time Supabase and
YouTube reads. S05b reconciles it: build-time reads are allowed, and a failed read renders the
loading state rather than an empty one (ADR-0004).

## 2. Test layers

| Layer | Tool | Lives in | Covers |
|---|---|---|---|
| Unit + golden parity | Vitest (jsdom) | `web/tests/unit`, `web/tests/golden` | pure libs vs legacy outputs (VERIFICATION box 5) |
| Component | Vitest + Testing Library | `web/tests/component` | props, states, a11y attributes |
| End-to-end | Playwright (4 projects) | `web/tests/e2e` | flows, theme, reduced motion, mobile viewports |
| Accessibility | axe + manual WCAG 2.2 | e2e + PR checklist | box 15–16 |
| Device | real phones | mobile-compatibility.md | Church Center contexts (box 20, CC1) |
| Database | staging integration suite | — | RLS behavior (not unit-tested, VERIFICATION) |

**PII and production safety:** end-to-end tests that submit registrations or interests run only
against a staging Supabase project, with no real personal data (VERIFICATION PII rule). Device tests
against production stop before submit. Contact and newsletter submissions in production need an
owner-approved test identity and cleanup.

## 3. Deployment flow

1. Work on a feature/migration branch → PR into `develop` (CI: `web` + `ledger`).
2. Release PR `develop` → `main` → `deploy.yml` publishes one Pages artifact (legacy at the root,
   SvelteKit under `/app/`).
3. Each cutover is one squash-merged PR per surface, revertible in one commit; it bumps the service
   worker cache (G-003) and runs boxes 14–20.
4. Database migrations are never applied by CI. They are idempotent files a human pastes into the
   SQL Editor, with a verification query (`supabase/README.md`).

## 4. Church Center configuration changes

- Made by an organization admin in Publishing; recorded in the configuration register
  ([church-center-compatibility.md §6](church-center-compatibility.md#6-configuration-guide-organization-admin)).
- After each change: open the item on one iOS and one Android device.
- **Rollback:** edit or remove the item and *Save & Publish* — immediate. URLs never need to change
  after a cutover (D-001), so no link maintenance is planned.

## 5. Monitoring

| Signal | Source | Cadence |
|---|---|---|
| Church Center visits by surface | Analíticas tab: `utm_source=churchcenter`; referrer host (Church Center web, Android `android-app://` per CC1) | weekly after CC2 |
| Deploy health | GitHub Actions + Pages deployment status | every release |
| Edge Function errors | Supabase function logs (`contact-submit`, `newsletter-*`, `track`, `admin-invite`) | weekly |
| Client errors | `track` error events, **only if approved** (target-architecture.md §9) | weekly |
| Platform drift | Planning Center changelog and the App Store "What's New" for Church Center | monthly; re-run the E2/E5 smoke after a release that mentions links, browsers or navigation |

## 6. Rollback runbook

| What failed | Action |
|---|---|
| A Church Center link misbehaves | Remove or edit the navigation item; log it in the register; file the cause |
| A cutover regressed | Revert the cutover PR → release → bump the SW cache; the legacy surface returns because legacy files are deleted only in that PR |
| A port foundation change regressed (`/app` only) | Revert its PR; no live URL is affected |
| A migration misbehaved | Migrations are additive; apply the reviewed corrective SQL by hand; never `db push` from the full directory |
| A deploy failed | Pages keeps the previous artifact; fix forward on a branch |
