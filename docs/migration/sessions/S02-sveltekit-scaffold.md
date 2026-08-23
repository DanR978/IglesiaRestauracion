# Session S02 — SvelteKit + adapter-static scaffold in `web/`

**Stream:** foundation
**Depends on:** none (can run in parallel with S01)   **PR:** <#___>   **Branch:** `migrate/S02-sveltekit-scaffold`
**Status:** ✅ done (2026-07-14) — PR `migrate/S02-sveltekit-scaffold`

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
- [x] `cd web && npm i && BASE_PATH=/app npm run build` emits `web/build/` with assets pathed under `/app`. (On Windows/Git Bash prefix `MSYS_NO_PATHCONV=1` — G-019.)
- [x] `npm run preview` serves the hello page (`BASE_PATH` must be set for preview too, or it serves at `/`); `npm run check` → **0 errors, 0 warnings** under strict.
- [x] `trailingSlash:'always'` produces folder-style URLs (`/x/index.html`); `404.html` fallback emitted for deep links.
- [x] Nothing outside `web/` changed, apart from the mandated ledger/session-doc updates.

## Verification gate
- [x] `docs/migration/VERIFICATION.md` boxes #2 (check), #6 (build), #8 (legacy untouched), #13 (ledger).

## How to resume if interrupted
- Branch: `migrate/S02-sveltekit-scaffold`. Next action: <…>.
- Landmines: do NOT create `src/routes` at the repo root — it collides with the legacy `src/` fragments. Everything is under `web/`. Custom domain ⇒ base is `''` normally, `/app` only via `BASE_PATH` during transition (G-008).

## On completion
- [x] Update `MIGRATION.md`: S02 ✅, Next up = S03 (S04/S05 unblocked); G-018…G-020 appended.
- [x] Open PR; link this file.

## Outcome (2026-07-14)

Resolved toolchain: SvelteKit 2.69 · Svelte 5.56 (runes) · Vite 8 · adapter-static 3 · **TypeScript 5**
(pinned — `svelte-check@4` crashes on TS 7, G-018).

Three things worth knowing, all recorded as gotchas:

- **G-018** `npm i -D typescript` resolves to 7.x and breaks `svelte-check`. `web/` pins `^5`.
- **G-019** Git Bash rewrites `BASE_PATH=/app` → `C:/Program Files/Git/app`, so the build dies on
  `paths.base`. Use `MSYS_NO_PATHCONV=1` locally; CI is fine. `npm run preview` needs `BASE_PATH` too.
- **G-020** `paths.relative = false` (a deliberate departure from the SvelteKit default). The fallback
  page is served at arbitrary depth, where relative asset URLs would 404. **S37's deep-link/reload
  requirement depends on this.**

Verified in the built artifact: `build/index.html` assets are `/app/_app/…`; `build/404.html` carries
`base: "/app"` + 8 absolute asset refs, so the SPA boots from a deep link.

`web/` is **not deployed** — the live site is untouched until S03 wires the build into `deploy.yml`.
