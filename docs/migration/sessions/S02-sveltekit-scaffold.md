# Session S02 — SvelteKit + adapter-static scaffold in `web/`

**Stream:** foundation
**Depends on:** none (can run in parallel with S01)   **PR:** <#___>   **Branch:** `migrate/S02-sveltekit-scaffold`
**Status:** ⬜ not started

## Goal (one sentence)
Stand up a buildable, prerendering SvelteKit + adapter-static skeleton in a new `web/` directory that coexists with the legacy site and builds under `BASE_PATH=/app`.

## In scope
- New `web/` project only: `web/{package.json, svelte.config.js, tsconfig.json, vite.config.ts, .gitignore}`, `web/src/app.html`, `web/src/routes/+layout.ts` + `+page.svelte` (hello), `web/static/.nojekyll`.

## Out of scope (do NOT touch)
- The legacy `src/`, `js/`, `css/`, root `package.json`, root `vite.config.js` — the new app lives entirely in `web/` to avoid every collision.
- `deploy.yml` — wiring the build into the deploy is S03.
- Env/secrets — S04.

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2 D-008, §3 G-008) and `CLAUDE.md`.
- [ ] Node available (repo uses Node 24).

## Steps
1. `cd web && npm create svelte@latest` (Svelte 5 / SvelteKit, TypeScript, no demo app) — or hand-author the config files.
2. `npm i -D @sveltejs/adapter-static`.
3. `svelte.config.js`: `adapter-static({ pages:'build', assets:'build', fallback:'404.html', strict:true })`; `kit.paths.base = process.env.BASE_PATH ?? ''`; `kit.prerender.entries = ['*']`. Runes on.
4. Root `src/routes/+layout.ts`: `export const prerender = true; export const trailingSlash = 'always';`
5. `tsconfig.json`: extend `./.svelte-kit/tsconfig.json`; `"strict": true`, `"moduleResolution": "bundler"`.
6. `web/.gitignore`: `build/`, `.svelte-kit/`, `node_modules/`, `.env`. `web/static/.nojekyll` (empty).
7. A hello `+page.svelte`. Build under the subpath and preview.

## Acceptance criteria
- [ ] `cd web && npm i && BASE_PATH=/app npm run build` emits `web/build/` with assets pathed under `/app`.
- [ ] `npm run preview` serves the hello page; `npm run check` (svelte-check) passes clean under strict.
- [ ] `trailingSlash:'always'` produces folder-style URLs (`/x/index.html`).
- [ ] Nothing outside `web/` changed (`git diff --stat` shows only `web/**`).

## Verification gate
- [ ] `docs/migration/VERIFICATION.md` boxes #2 (check), #6 (build), #8 (legacy untouched), #13 (ledger).

## How to resume if interrupted
- Branch: `migrate/S02-sveltekit-scaffold`. Next action: <…>.
- Landmines: do NOT create `src/routes` at the repo root — it collides with the legacy `src/` fragments. Everything is under `web/`. Custom domain ⇒ base is `''` normally, `/app` only via `BASE_PATH` during transition (G-008).

## On completion
- [ ] Update `MIGRATION.md`: mark S02 ✅, set Next up = S03 (and S04/S05 can proceed in parallel).
- [ ] Open PR; link this file.
