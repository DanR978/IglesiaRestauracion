# Migration roadmap — phase charters

> Snapshot 2026-10-18 · repo `f3b8c94`. Sessions, prerequisites and status live in
> [`docs/migration/ROADMAP.md`](../migration/ROADMAP.md) and `MIGRATION.md` §1. This page adds the
> phase-level charters the brief asked for, plus the Church Center track. Where they disagree, the
> ledger wins.

## 1. How the brief's phases map onto this repo

| Brief phase | Where it lives |
|---|---|
| Church Center research & feasibility | this documentation set; pilot **CC1** |
| Audit & architecture decisions | [current-state-audit.md](current-state-audit.md), ADR-0001…0004 (D-029…D-032) |
| Framework & migration strategy | ADR-0002: continue SvelteKit (Phase 0–1 ✅); **S02b** SvelteKit 3 |
| Foundation, tooling, quality gates | Phase 0 ✅ + **S05b** |
| Design tokens & theming | S11 ✅ + **S11b** (ADR-0003) |
| Shared components | S13–S21 ✅ + owed components (design-system.md §2) + **S12b** |
| Authentication & routing compatibility | Phase 3, S37–S40 (+ amendments) |
| Feature migration & API integration | Phases 2, 4, 5; data contract **S22b** (ADR-0004) |
| Church Center integration | **CC1** pilot → **CC2** go-live |
| Mobile, a11y, performance, security verification | gates in [testing-and-rollout.md](testing-and-rollout.md), on every session |
| Deployment, monitoring, rollback | Phase 6 + testing-and-rollout.md |

## 2. Two independent tracks

```
Track CC (configuration + measurement)    CC1 pilot ──► CC2 go-live ──► Church Center check at every cutover
                                              │
                                              └─► findings may raise Phase 2's priority (decision §5.5)

Track port (code)                         S02b ─► S05b ─► S22b ─► S37 ─► S38 ─► S39 ─► … (2026-08-25 order)
                                          S12b after CC1 · S11b after the S23 branch merges
```

Church Center goes live on the **legacy** site; it does not wait for the port. URL stability
(D-001) keeps the links valid as surfaces cut over.

## 3. Charters

### CC1 — Church Center feasibility pilot
- **Objectives:** measure how the Church Center app opens external links on iOS and Android, and
  what then works.
- **Deliverables:**
  - a `noindex` diagnostic route `/app/diagnostico/` (+ `viewport-fit=cover` in `web/src/app.html`);
  - a temporary, dated navigation item or home button, approved by the owner;
  - the device matrix filled in ([mobile-compatibility.md §4–5](mobile-compatibility.md));
  - Planning Center support answers logged;
  - ADR-0001 "Findings".

  Spec: [`docs/migration/sessions/CC1-church-center-pilot.md`](../migration/sessions/CC1-church-center-pilot.md).
- **Dependencies:** a Planning Center organization, Publishing Essential, a campus listed in app
  search, the app activated (organization admin); test devices.
- **Risks → mitigations:**
  - Personal data submitted during tests → no submits (PII rule).
  - The temporary item is visible to the congregation → dated, labeled, removed at close.
  - Results drift as the app updates → record app versions; re-check after notable releases.
- **Testing:** the real-device matrix; Android can also be inspected via `chrome://inspect`.
- **Acceptance:**
  - every required cell has pass / fail / N/A with device, OS, app version and date;
  - the link-open mechanism is identified per platform;
  - each public surface is marked link-ready or blocked (with reason);
  - zero legacy code changes and zero real registrations;
  - every failure is filed in PORT-DEBT or DUAL-FIX-BACKLOG.
- **Done:** the diagnostic route is merged, the results are logged, the temporary item is removed and ADR-0001 is updated.
- **Rollback:** delete the navigation item (immediate); revert the route PR.

### CC2 — Church Center go-live
- **Objectives:** put the link-ready surfaces into Church Center navigation.
- **Deliverables:** navigation items + home buttons with UTM URLs; the configuration register filled;
  an announcement to the congregation (owner).
- **Dependencies:** CC1 acceptance for each linked surface.
- **Risks → mitigations:**
  - A surface fails in the app → don't link it (decision §5.5).
  - Labels truncated → test on a device before publishing.
- **Testing:** E2/E5 smoke of each linked URL.
- **Acceptance:** each item opens its page on both platforms; Church Center visits appear in Analíticas.
- **Done:** the register is current; monitoring is noted in testing-and-rollout.md.
- **Rollback:** edit or remove items in Publishing.

### Foundation additions — S02b, S05b, S22b, S12b, S11b
- **Objectives:** put the port on SvelteKit 3, make cross-engine/a11y/performance gates binding,
  fix the data contract, harden the mobile viewport and overlays, and layer the tokens — before
  admin UI code multiplies.
- **Deliverables:**
  - **S02b:** Kit 3 (TypeScript pinned ^6, adapter-static 4, `#lib`, config in `vite.config.ts`, `$app/env`).
  - **S05b:** Playwright `chromium` / `webkit` / `Mobile Safari` / `Mobile Chrome` projects in CI, axe, a JS budget, import-boundary lint, new VERIFICATION boxes.
  - **S22b:** `ReadResult` / `RepoError` across the repos (ADR-0004).
  - **S12b:** safe areas, `dvh`, keyboard handling, one focus-trap stack, back closes full-screen overlays, `/app/*` excluded from the legacy service worker (G-034).
  - **S11b:** motion tokens, `color-scheme`, enforcement tests (ADR-0003).
- **Dependencies:**
  - S02b: none.
  - S05b and S22b: after S02b.
  - S12b: after CC1.
  - S11b: after the S23 branch merges.
  - S22b: coordinate with the S23 branch's loaders.
- **Risks → mitigations:**
  - Kit 3 churn → codemod first, separate commits per step.
  - TS 7 pulled in by accident → exact pin + G-018 note.
  - Rebase conflicts with the S23 branch → land S02b and S22b, then rebase S23 once.
  - Frozen component props (ROADMAP note) → S12b changes internals only.
- **Testing:** the full VERIFICATION gate; golden suites unchanged; new e2e projects green.
- **Acceptance:** `check`, `lint`, `test`, `build` and the new e2e projects pass in CI; no change to live legacy files except the one-line `sw.js` skip (S12b, with a cache bump).
- **Done:** ledger updated; ROADMAP rows ✅.
- **Rollback:** each session is one squash-merged PR; revert it.

### Phase 2 — Public site + cutover (S23–S36)
- **Objectives:** port and cut over public surfaces with SEO parity (ROADMAP Phase 2), now also
  validated inside Church Center.
- **Deliverables:** ROADMAP S23–S36, plus the amendments for S24 (entry marker), S28 (redirects keep
  the query string), S35 (service worker optional), and S36 (Church Center check per cutover).
- **Dependencies:** foundation additions (S02b, S05b, S22b); the S23 branch.
- **Risks → mitigations:**
  - A broken shared link → D-001 + redirect stubs + a link check.
  - Stale cached pages → SW cache bump (G-003).
  - Registration downtime in season → freeze (DUAL-MAINTENANCE).
- **Testing:** golden, SEO diff, e2e on 4 projects, Church Center check (VERIFICATION box 20).
- **Acceptance:** per-URL cutover PRs, each revertible in one commit; analytics continuity (D-026).
- **Done:** every public URL is served by the port; legacy public code is deleted only in its cutover PR.
- **Rollback:** revert the cutover PR; bump the SW cache.

### Phase 3 — Admin shell + auth (S37–S40)
- **Objectives:** admin routing and shell, state stores, auth with enforced MFA (D-010), admin repos.
- **Deliverables:** ROADMAP S37–S40, plus:
  - `onAuthStateChange` handling and a Spanish session-expired screen;
  - `token_hash` email links kept;
  - `/app/` added to the Auth redirect allow-list;
  - a CodeInput with paste and `one-time-code`;
  - shallow routing for overlays;
  - a frame-guard on admin routes.
- **Dependencies:** S02b, S05b, S22b, S11 ✅, S15/S16 ✅.
- **Risks → mitigations:**
  - Lockout during MFA enforcement → staged rollout with the owner.
  - G-021 deep links → the root `404.html` boot strategy.
- **Testing:** auth e2e against staging; negative authorization tests (D-006); ASVS 5.0 V6/V7/V8 Level 2 checklist.
- **Acceptance:**
  - an enrolled account can't reach `/admin/*` at `aal1`;
  - `aal2` is enforced in RLS;
  - every Spanish error path is covered.
- **Done:** ledger updated; G-016 closed.
- **Rollback:** revert the PR; the RLS migration ships with a reviewed down-path.

### Phase 4 — Admin CRUD tabs (S41–S51)
- **Objectives:** port each tab with its PORT-DEBT fixes.
- **Deliverables:** per ROADMAP, including the Analíticas (D-026) and Líderes (D-028) tabs.
- **Dependencies:** Phase 3.
- **Risks → mitigations:**
  - Re-porting legacy bugs → PORT-DEBT rows become acceptance criteria.
- **Testing:** golden, component, e2e; no horizontal scroll at 360px (admin-ux).
- **Acceptance / Done:** per ROADMAP row.
- **Rollback:** per PR.

### Phase 5 — Hard subsystems (S52–S63)
- **Objectives:** treasury in cents, registrations admin, designer wrap.
- **Deliverables:** per ROADMAP (S52 ✅, S56b backend ✅, S56c parser ✅).
- **Dependencies:** Phases 3–4 as listed in ROADMAP.
- **Risks → mitigations:**
  - Money drift → integer cents (D-003) + golden diffs.
  - PII exposure → the S58 rules.
  - Leaked Realtime channels → the S62 teardown test.
- **Testing:** over-verify S55, S58, S62.
- **Acceptance / Done:** per ROADMAP.
- **Rollback:** per PR; migrations additive and hand-applied.

### Phase 6 — Cutover & decommission (S64–S65)
- **Objectives:** move the admin to `/admin`, delete legacy, collapse the deploy, harden.
- **Deliverables:** ROADMAP S64–S65 with CSP (`csp` hash mode), exact pins and SRI, the frame-guard confirmed, internal docs kept out of the artifact.
- **Dependencies:** all prior phases; off-season only.
- **Risks → mitigations:**
  - Regressions → 2 weeks of clean logs before S65.
  - Lost SEO → SEO diff.
- **Testing:** the full gate + a Church Center check of every linked URL.
- **Acceptance:** `BASE_PATH=''`; no legacy trees; one SvelteKit build.
- **Done:** ledger closed out.
- **Rollback:** revert S65 (legacy restored), then S64.

### Deferred — Planning Center integrations
Only when an ADR-0001 revisit trigger fires: Church Center modal for Planning Center Giving, Planning
Center OIDC for staff, reading Planning Center Calendar into the site. Each would need its own ADR,
a privacy-policy review, and an Edge Function for any server secret.

## 4. Critical path

- **Church Center value:** CC1 → CC2. No code is needed except the diagnostic route.
- **Port:** S02b → S05b → S22b → S37 → S38 → S39 → S53 → S56 → S56b/S56c UIs (the 2026-08-25 order),
  with Phase 2 resuming afterwards, unless decision §5.1 changes it.

## 5. Owner decisions

These block or shape the work above. Each lists its consequence.

1. **Sequencing.**
   - (a) Keep the 2026-08-25 order: admin/treasury first.
   - (b) Follow D-024 on the S23 branch: "Phase 2 resumed".

   Church Center users only see public surfaces, so (b) brings the port to them sooner; (a) brings
   treasury screens sooner. Either way, S02b goes first: cheapest before routes exist.
2. **Planning Center access and tier.** Who is the organization admin; Essential vs Plus (R2). Without access, CC1 can't start.
3. **Temporary diagnostic link.** Approve a dated navigation item or home button on the real organization for CC1.
4. **MFA timing.** D-010 enforces it in S39. Sooner requires a legacy security change under DUAL-MAINTENANCE.
5. **If CC1 finds a blocker on a legacy surface:**
   - (a) leave that page out of Church Center navigation;
   - (b) an owner-approved legacy exception, as with D-026/D-027/D-028;
   - (c) port that surface sooner.
6. **Branch protection** on `main` and `develop`. Until it's on, every gate is advisory.
7. **Internal docs in the Pages artifact** (G-035): prune them in `deploy.yml`, add a robots `Disallow`, or accept.
8. **VBS freeze.** The ledger still records the July freeze on `registro` and `/admin` as active. Confirm or lift.
9. **Staging Supabase project** for PII-touching end-to-end tests: confirm it exists or create one.
10. **Client error reports** through `track` (target-architecture.md §9): approve or decline (privacy).
11. **S23 branch** (local only): push it as a backup, and choose when to merge. S11b and S22b sequence around it.
