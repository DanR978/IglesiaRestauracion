# ADR-0002 — Frontend platform: continue SvelteKit, upgrade to SvelteKit 3

- **Status:** Accepted on merge of this change (2026-10-18)
- **Ledger:** D-030 (`MIGRATION.md` §2) — confirms the §0 target; nothing reversed
- **Evidence:** [architecture-options.md](../architecture-options.md)

## Context

The owner asked whether to migrate to Angular. The governed port already targets SvelteKit +
Svelte 5 + TypeScript with adapter-static (`MIGRATION.md` §0), and Phase 0–1 is complete. Church
Center only links out to websites (ADR-0001), so no framework has an integration advantage. SvelteKit
3 became stable on 2026-10-01; the port is on SvelteKit 2.69.

## Decision

1. **Keep SvelteKit + Svelte 5 (runes) + TypeScript strict + adapter-static.** Angular 22, React
   (Next.js / React Router), Vue (Nuxt), Astro + islands and staying vanilla were evaluated and
   rejected for this application.
2. **Upgrade to SvelteKit 3 in a dedicated session (S02b) before S37**, while no admin routes exist:
   - kit ^3.1, adapter-static ^4, Svelte ≥ 5.57.1, Vite ≥ 8.0.12, vite-plugin-svelte ^7, Node ≥ 22.17 (CI already runs 24).
   - **TypeScript pinned to ^6.** TypeScript 7 is npm `latest`, but svelte-check 4.7.x accepts only `^5 || ^6` and Kit 3 peers on `^6` (G-018).
   - Run `npx sv migrate sveltekit-3`, then fix what it lists: config into `vite.config.ts`, `$lib` → `#lib`, `$app/environment` → `$app/env`, the `base` import from `$app/paths`.
3. **Browser-support policy:**
   - Compile to Vite's `baseline-widely-available` target. For Vite 8 that is Chrome/Edge 111, Firefox 114, Safari/iOS 16.4 ([Vite](https://vite.dev/config/build-options)); it is configurable.
   - Feature-detect anything newer.
   - Contexts opened from Church Center (in-app browser tab, WebView, system browser) are first-class test targets.
   - WebKit runs in CI (S05b).
   - The Church Center app allows iOS 16.0; 16.0–16.3 is best-effort, and those devices can update within iOS 16.

## Consequences

- **+** Keeps the Phase 0–1 investment, the golden tests and the ledger machinery.
- **+** The upgrade lands before any admin code depends on Kit 2 APIs.
- **−** Kit 3 churn: the `#lib` rename touches every import, the config moves, and the env module is renamed. The codemod mitigates most of it.
- **−** SvelteKit publishes no LTS window (Angular does: v22 LTS to 2028-06). Mitigation: stay on current minors; one upgrade session per major.
- **−** The Svelte ecosystem is smaller than React's or Angular's. Mitigation: adopt headless a11y libraries per widget only where justified ([design-system.md](../design-system.md)).

## Alternatives considered

See the scoring in [architecture-options.md §3](../architecture-options.md#3-scoring). In short:
Angular 22 is capable, but rebuilding the 14 components, the stores, routing/prerender and the test
harness buys no Church Center compatibility; React and Vue are full rewrites; Astro splits the stack;
vanilla keeps the debt that motivated the port.

## Revisit triggers

A Planning Center framework SDK or embed API appears · the Kit 3 upgrade is blocked (fall back to
staying on Kit 2, not switching frameworks) · the maintainer team changes · a native app becomes a
requirement.
