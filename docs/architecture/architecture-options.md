# Architecture options

> Snapshot 2026-10-18 · repo `f3b8c94`. Decision recorded in
> [ADR-0002](architecture-decisions/ADR-0002-frontend-platform.md) (ledger D-030).

## 1. Requirements the research produced

The Church Center research ([church-center-compatibility.md](church-center-compatibility.md))
removes most of the framework question: Church Center can only **link out** to a website, so no
framework gets an integration advantage. What remains are the requirements that link-out and the
app itself impose:

| ID | Requirement | Source |
|---|---|---|
| RQ1 | Works when opened from Church Center in an in-app browser tab, an embedded WebView, or the system browser: no reliance on popups, third-party cookies, service workers or persistent storage | R6, R19, R20 |
| RQ2 | Fast first paint on phones over cellular: prerendered HTML for public pages, small client JS | mobile-compatibility.md |
| RQ3 | Every public URL keeps working, including query-string detail pages | D-001 |
| RQ4 | Supabase Auth (password; TOTP once D-010 lands) typed in place; email links via `token_hash` | ADR-0001 |
| RQ5 | Static hosting on GitHub Pages: no server, no response headers | MIGRATION.md §4 |
| RQ6 | Safe rendering by default (XSS), CSP-capable, RLS stays the boundary | D-002, D-005 |
| RQ7 | WCAG 2.2 AA, Spanish UI | testing-and-rollout.md |
| RQ8 | Maintainable by one owner plus memoryless AI sessions: typing, tests, an append-only ledger | docs/migration/README.md |
| RQ9 | Keep what is already built and verified (Phase 0–1 of the port) | MIGRATION.md §1 |
| RQ10 | Coexist with the live legacy site on the same origin during the strangler-fig port | D-008 |

## 2. Options

| | Option | What it means here |
|---|---|---|
| A | **Continue the SvelteKit port** (upgrade to SvelteKit 3) | Keep `web/` (Svelte 5 runes, TS strict, adapter-static); one upgrade session (S02b) |
| B | **Angular 22** | New Angular app with `outputMode: "static"` prerendering; port the plain-TS libs; rebuild components, routing, tests |
| C | **Stay vanilla**, modernize incrementally | Keep the legacy MPA; refactor in place |
| D | **Astro + Svelte islands** for public pages, an SPA for admin | Re-platform routing/layouts; reuse Svelte components as islands |
| E | **React** (Next.js static export or React Router) | Full rewrite in React |
| F | **Vue** (Nuxt static generation) | Full rewrite in Vue |

## 3. Scoring

●●● strong · ●● adequate · ● weak. "Expectation" marks a judgment not measured in this repo.

| Criterion | A SvelteKit | B Angular 22 | C Vanilla | D Astro+islands | E React | F Vue/Nuxt |
|---|---|---|---|---|---|---|
| Church Center compatibility (RQ1) | ●●● | ●●● | ●●● | ●●● | ●●● | ●●● |
| Auth-flow compatibility (RQ4) | ●●● | ●●● | ●● | ●● | ●●● | ●●● |
| Mobile / embedded-browser reliability (RQ1–2) | ●●● | ●● (expectation: larger runtime) | ●● | ●●● | ●● (expectation) | ●● (expectation) |
| Accessibility & responsive (RQ7) | ●● | ●●● (Angular Aria + CDK) | ● | ●● | ●●● | ●● |
| Maintainability & long-term support | ●● (no published LTS policy) | ●●● (published: v22 active to 2027-06, LTS to 2028-06) | ● | ●● | ●● | ●● |
| Component reuse & design system (RQ9) | ●●● (14 built) | ● (rebuild) | ● | ●● | ● | ● |
| Performance & bundle size (RQ2) | ●●● (expectation: compiled, small runtime) | ●● (expectation) | ●● | ●●● | ●● (expectation) | ●● (expectation) |
| Developer experience & testing (RQ8) | ●●● (harness in place) | ●● (re-establish) | ● (none in CI) | ●● (two toolchains) | ●●● | ●●● |
| Migration complexity & risk | ●●● (one upgrade session) | ● | ●●● (none) but debt stays | ●● | ● | ● |
| Ecosystem maturity & security | ●● | ●●● | ●● | ●● | ●●● | ●● |
| Team & codebase constraints | ●●● (ledger, lint rules, sessions built around it) | ● | ●● | ●● | ● | ● |

## 4. Notes per option

**A — SvelteKit.** Built and on `main`: the scaffold and deploy to `/app/`, the typed Supabase client,
45 plain-TypeScript libs under `web/src/lib` with golden tests against legacy (sanitizer, validators,
money in cents, pdf, waiver, calendar, …), 14 components with `/app/kit/*` showcase pages, tokens and
the `data-theme` mechanism, the repo layer including treasury, Vitest + Playwright, and a CI gate.
SvelteKit 3 became stable on 2026-10-01
([announcement](https://svelte.dev/blog/sveltekit-3-is-here)); its migration guide lists the breaking
changes: config moves from `svelte.config.js` into the Vite plugin, `$lib` becomes `#lib`,
`$app/stores` is removed, `$app/environment` becomes `$app/env`, `$service-worker` is removed, and
`base` leaves `$app/paths`. `npx sv migrate sveltekit-3` automates much of it
([guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3)). Peer floors for `@sveltejs/kit@3.1.0`:
Vite ^8.0.12, Svelte ^5.57.1, TypeScript ^6, Node ≥ 22.17 (npm, 2026-10-18). Risk: SvelteKit publishes
no LTS policy, so staying current is the mitigation.

**B — Angular 22.** A capable, current option: zoneless change detection is the default since v21
([zoneless guide](https://angular.dev/guide/zoneless)); v22 makes OnPush the default and ships Signal
Forms and Angular Aria as stable
([v22 announcement](https://blog.angular.dev/announcing-angular-v22-c52bb83a4664)); `outputMode:
"static"` prerenders without a server ([SSR guide](https://angular.dev/guide/ssr)); and the
[release policy](https://angular.dev/reference/releases) publishes support windows (v22 released
2026-06-03, active to 2027-06, LTS to 2028-06; majors now every 12 months). What it would cost here:
the 45 plain-TS libs would carry over largely as-is, but the 14 components, the rune stores, routing
and prerender setup, the component and e2e tests, the `{@html}` lint gate, and the session/ledger
conventions would all be rebuilt. That restarts most of Phase 1 for no Church Center benefit.

**C — Vanilla.** Works today and needs no build in production. But the house rules depend on
discipline the code doesn't enforce: manual escaping on 288 `innerHTML` writes, 17 `window.__*`
globals behind inline `onclick`, ~25 component-level dark-mode blocks the token system forbids, two
toast systems, and no tests or lint in CI. Those are the reasons the ledger chose a rewrite.

**D — Astro + islands.** Excellent for content pages (no JS by default), and Svelte components could
be reused as islands. But the admin is a real application, so this splits the stack into two routing
and build systems. SvelteKit's prerendering already gives static HTML for public routes.

**E/F — React or Vue.** Mature ecosystems, but each is a full rewrite with no compatibility gain over A.

## 5. Recommendation

**Option A: continue the SvelteKit port and upgrade it to SvelteKit 3 before the admin shell (S37).**

- Church Center doesn't favor any framework (R1, R4, R5). The real requirements — RQ1/RQ2, a robust,
  light mobile website — are met best by prerendered HTML with a small runtime, which the port
  already produces.
- It keeps everything Phase 0–1 built and verified, and the ledger, lint rules, golden tests and
  session machinery that make a single-owner rewrite resumable.
- Angular's strongest advantage, a published LTS window, is real. It doesn't outweigh restarting
  the component library and test harness when the integration target gives Angular nothing extra.
- The upgrade is cheapest now, before admin routes exist: one session (S02b in
  [migration-roadmap.md](migration-roadmap.md)).

## 6. What would change this recommendation

- Planning Center ships a framework-specific SDK, embedding API, or identity hand-off (none exists — R4, R10).
- The SvelteKit 3 upgrade hits a blocker. Then stay on SvelteKit 2 for now; that is not a reason to change frameworks.
- The maintainer team changes to one with deep Angular or React experience and no Svelte experience.
- A native mobile app becomes a requirement. That calls for evaluating native or Capacitor options, not web frameworks.

## 7. Versions (npm `latest`, checked 2026-10-18)

| Package | Version | Published |
|---|---|---|
| @angular/core | 22.2.3 | 2026-10-14 |
| @sveltejs/kit | 3.1.0 | 2026-10-14 |
| svelte | 5.57.2 | 2026-10-06 |
| @sveltejs/adapter-static | 4.0.0 | 2026-10-01 |
| vite | 8.3.4 | 2026-10-08 |
| typescript | 7.0.2 | 2026-07-08 (the port must stay on ^6 — svelte-check 4.7.7 accepts `^5 \|\| ^6`; G-018) |
| svelte-check | 4.7.7 | 2026-10-16 |
| astro | 7.4.0 | 2026-10-15 |
| next | 16.4.2 | 2026-10-15 |
| nuxt | 4.6.2 | 2026-10-16 |
| react-router | 8.4.0 | 2026-09-15 |

The port currently pins kit ^2.69.3, svelte ^5.56.5, TypeScript ^5.9.3, Vite ^8.1.4,
adapter-static ^3.0.10 and supabase-js ^2.112.3 (`web/package.json`).
