# Session S02b — SvelteKit 3 upgrade

**Stream:** foundation
**Depends on:** S02–S22 (Phase 1 complete), D-030 / ADR-0002   **PR:** [#50](https://github.com/DanR978/IglesiaRestauracion/pull/50) (PR-C1)   **Branch:** `migrate/S02b-S05b-S22b-foundations`
**Status:** 🟦 PR open — `migrate/S02b-S05b-S22b-foundations` (PR-C1, with S05b and S22b)

## Goal (one sentence)
Move `web/` from SvelteKit 2.69 to SvelteKit 3.1 (D-030) with every existing gate green and no change to what `/app/` serves, before any admin route depends on Kit 2 APIs.

## In scope
- `web/package.json` + lockfile: kit 3, adapter-static 4, Svelte ≥ 5.57.1, TypeScript 6, `engines`, `prepare`.
- The `sv migrate sveltekit-3` tasks, one commit each, and the harness work the codemod skips:
  `svelte.config.js` → `sveltekit({...})` in `vite.config.ts`, a shared `svelte-options.ts`,
  `vitest.config.ts`, `tsconfig.json`, the Vitest stubs, `src/env.ts`.
- `$lib` → `#lib`, `$app/environment` → `$app/env`, `$env/static/public` → `$app/env/public`, `base` → `resolve()`/`asset()`.
- Comment-only updates in `.github/workflows/ci.yml` and `deploy.yml` (where D-007 is now enforced).

## Out of scope (do NOT touch)
- Live legacy files (`js/`, `css/`, `src/`, root HTML, `sw.js`) — none changed.
- `MIGRATION.md`, `ROADMAP.md` — a later ledger step in this PR updates them (follow-ups listed below).
- S05b gates (cross-engine e2e, axe, budgets, `npm audit` in CI) and S22b repo results.
- `npm audit fix` for the dev-only advisories (see Verification).

## Prereqs
- [x] Read `MIGRATION.md` §0–3 (D-007, D-030–D-032, G-018–G-021, G-024, G-029), ADR-0002, ADR-0004, `testing-and-rollout.md`, `target-architecture.md` §3, VERIFICATION, this template.
- [x] Baseline gates recorded on `a8749cf` before the first change (numbers below).
- [x] Local `web/.env` from `.env.example` with `PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `PUBLIC_SUPABASE_ANON_KEY=local-test-key` (gitignored, not committed).

## What changed (commit by commit)

| Commit | What |
|---|---|
| `dc3a327` | codemod `package-json` (prerequisite) + lockfile |
| `5e40488` | codemod `tsconfig` (prerequisite): extends `$app/tsconfig`, explicit `include` |
| `de0a915` | codemod `svelte-config`: config moved into `sveltekit({...})`, `svelte.config.js` deleted |
| `f6cc745` | codemod `environment`: `$app/env`, `$app/env/public`, generated `src/env.ts` |
| `980915d` | `paths`, **hand-applied** (the codemod's output was discarded, see below) |
| `fc0c824` | codemod `lib-alias`: `package.json#imports` + `#lib/….js` specifiers |
| `9e06a6c` | finish the `#lib` rename the text match missed (`vi.mock` specifiers, lint-test snippets, prose) |
| `7e8649b` | pin the toolchain (versions below), `engines.node >=22.17`, `prepare: svelte-kit sync \|\| echo ''` |
| `d4113f8` | harness: `svelte-options.ts`, `vite.config.ts`, `vitest.config.ts`, stubs, `realtime.test.ts`, `tsconfig.json` |
| `5aa9fca` | kit routes typed against the generated `Path` / `AssetPath` unions |
| `0ade683` | `src/env.ts` schemas (D-007) + `tests/unit/env.test.ts` |
| `18619a9` | workflow comments name `src/env.ts` (no step changed) |

Codemod tasks that changed nothing here (no commit): `external-redirects`, `shallow-routing`, `params`,
`imports`, `app-state`. `collect-migration-instructions` wrote `MIGRATION_TASKS.md` (not committed): its two
findings were the three `$app/paths` pages already migrated (matched on the CSS tokens `--font-base` /
`--fs-base`) and "CORS for static assets in dev" (not used). No `@migration-task` marker was left in the tree.

**Installed:** @sveltejs/kit 3.1.0 · @sveltejs/adapter-static 4.0.0 · svelte 5.57.2 · vite 8.1.4 ·
@sveltejs/vite-plugin-svelte 7.2.0 · typescript 6.0.3 · svelte-check 4.7.7 · eslint-plugin-svelte 3.23.1
(Node 24.14.0 locally; CI runs 24).

### Harness decisions
- **`web/svelte-options.ts`** exports `preprocess` (`vitePreprocess()`) and `compilerOptions` (`{ runes: true }`).
  `vite.config.ts` and `vitest.config.ts` both import it; Vitest's bare `svelte()` plugin gets
  `configFile: false` so it never looks for a `svelte.config.*` again. The module must never be named
  `svelte.config.*`: Kit 3 refuses to start when such a file exists.
- **`vite.config.ts`** keeps every option: adapter-static (`build`/`build`, `precompress: false`, `strict: true`),
  `paths.base` from `BASE_PATH`, `paths.relative: false`, `prerender.entries: ['*']`, the sprite-id
  `handleMissingId` whitelist (G-023). The adapter `fallback` is **dropped** (D-036, G-021): the build no
  longer emits `app/404.html`. `BASE_PATH` is narrowed to Kit's `'' | /${string}` type by a type guard that
  fails with a G-019 hint, instead of a cast.
- **`vitest.config.ts`**: the `$lib` alias is gone — `#lib/*` is a `package.json` subpath import, which Vite
  resolves natively. `$app/env` and `$app/env/public` are **anchored regex** aliases to
  `tests/stubs/app-env.ts` / `app-env-public.ts` (renamed from `app-environment.ts` / `env-public.ts`): a
  string key is a prefix match, so `'$app/env'` would also capture `'$app/env/public'`.
- **`tsconfig.json`** extends `$app/tsconfig` (generated into `node_modules/$app/` by `svelte-kit sync`) and
  includes `src`, `tests`, `svelte-options.ts`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`.
- **`src/env.ts`** (D-007 now lives here). Kit 3 re-exports **only declared** variables, and its default check
  rejects an *unset* variable but accepts `''` — which is what an unset GitHub secret interpolates to. Both
  `PUBLIC_*` values are `public` + `static` with schemas: non-empty, and the URL must be `https:` or plain
  `http:` on `localhost` / `127.0.0.1` / `[::1]`. Messages never echo the value. `#lib/config.ts` keeps
  `required()` as the runtime second line.
- **`eslint-plugin-svelte` ^3.23.1** is required, not cosmetic: 3.23.0 runs
  `svelte/no-navigation-without-resolve` only for Kit 1/2 and silently skips it on Kit 3. Probed after the
  bump: `<a href="/kit/card/">` in a route is reported, `resolve('kit/card/')` is not.

### Defects found in `sv migrate` 1.1.1 (why `paths` was applied by hand)
The `paths` task re-prints every `.svelte` file it touches. On the four kit pages it:
- de-escaped text: `<code>&lt;a&gt;</code>` became a real `<code><a></a></code>`, and the button label
  `(&lt;a&gt;)` became an unclosed `<a>` inside the Button's own anchor;
- reflowed prose and inserted blank lines;
- rewrote `href="{base}/kit/card/"` as `href="{resolve('')}/kit/card/"`, which renders `/app//kit/card/`.

The raw output was kept out of git; the commit is the hand-written equivalent (`resolve('kit/card/')`,
`asset(…)` for files in `static/`). The `lib-alias` task is a plain text substitution (no re-printing), but
its greedy match left `vi.mock('#lib/db/client', …)` and a few lint-test strings without `.js` (fixed in
`9e06a6c`).

### Kit 3 behaviour changes observed (no code change needed)
- Kit 3 checks for a new deployment on its own: every open `/app` tab fetches `/app/_app/version.json`
  whenever it regains focus or becomes visible (`runtime/client/client.js:3117-3128`), and hourly —
  `version.pollInterval` now defaults to 3 600 000 ms (Kit 2.69.3: `0`, and no focus checks). Cheap on Pages;
  PR-C2's CSP keeps `connect-src 'self'` for it (already in the plan).
- The inline boot script now imports `entry/start` → `kit.init(…)` → `entry/app`, plus a `payload` entry;
  the hash-mode CSP (D-037) must cover Kit's generated inline script as well as the theme boot script.
- Static public values are still inlined at build (found only in the root layout chunk).
- `/app/` prints `Montado en /app/` (was `/app`): `resolve('/')` includes the trailing slash.
- Kit 3 treats **any** `…/server/…` directory outside `routes`/`static` as server-only (Kit 2: `$lib/server`).
- `npm ls` lists `$app@ extraneous` — the generated `node_modules/$app/`. Expected; `npm prune` removes it and
  the next `svelte-kit sync` (any `npm run check`, or `prepare`) recreates it.

## Verification gate

Baseline = `a8749cf` (Kit 2.69.3), run in this worktree before the first change.
After = `18619a9`, run in the worktree **and** in a clean-room copy
(`git -c core.autocrlf=false -c core.eol=lf archive HEAD web`, G-025) with `npm ci`.

```
[x]  1. Install clean     npm ci (npm 11.5.2, clean room)  → 300 packages, exit 0; `prepare` generated node_modules/$app
[x]  2. Typecheck         npm run check                    → before 622 FILES · after 628 FILES (clean room) — 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint                     → prettier: all files pass · eslint: 0 problems
[x]  4. Unit tests        npm run test                     → before 63 files passed | 1 skipped · 1590 passed | 2 skipped
                                                             after  64 files passed | 1 skipped · 1610 passed | 2 skipped
                                                             unit 721 → 741 (+20: tests/unit/env.test.ts) · component 336 → 336 · golden 533 → 533
[x]  5. Golden parity     npm run test:golden              → 12 files · 533 passed, under TZ=America/New_York and TZ=Asia/Tokyo
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build
                                                           → 15 prerendered pages, assets under /app/_app, no network reads;
                                                             file list identical to baseline except app/404.html (fallback dropped, D-036)
[x]  7. Preview smoke     npx playwright test              → before 86 passed · after 86 passed (chromium, base '')
                          vite preview at /app             → /app/, /app/kit/button/, a static asset, version.json: 200; /app/kit/card → 308
[x]  8. Legacy untouched  git diff --stat a8749cf..HEAD    → web/** plus two comment-only workflow edits; no legacy file
[ ]  9. Parity walk       n/a — no surface changed (kit pages only re-typed their links)
[ ] 10. SEO diff          n/a
[ ] 11. SW cache bumped   n/a (not a cutover)
[x] 12. Secrets/PII clean patch grep (service_role, JWT, sk_, api keys) → only "never the service-role key" comments
[x] 13. Ledger updated    → MIGRATION.md, PR-C1 ledger step (2026-10-19)
```

D-007 checked by hand: an empty `PUBLIC_SUPABASE_URL`, an empty `PUBLIC_SUPABASE_ANON_KEY` and
`PUBLIC_SUPABASE_URL=http://example-ref.supabase.co` each stop `vite build` with "Invalid environment
variables" and the schema's message; the local `.env` builds.

`npm audit --omit=dev --audit-level=high` → 0 vulnerabilities. Full `npm audit` → 6 dev-only
(2 moderate, 4 high: brace-expansion, nanoid, postcss, postcss-selector-parser, source-map-js, undici),
down from 9 (1 low, 3 moderate, 5 high) at baseline; left for S05b's box 18.

**Kit 3 still emits an empty shell for an `ssr = false` prerendered route (D-036).**
`node_modules/@sveltejs/kit/src/runtime/server/page/index.js:113-150` (Kit 3.1.0): comment at 113, condition at
116-119 — `ssr === false && !((state.prerendering || state.prerender_default === true) && should_prerender_data)`
— then `render_response({ … page_config: { ssr: false, csr } … })` at 131-150. `should_prerender_data()`
(`src/utils/page_nodes.js:89-94`) is true only for a server `load` or a server `trailingSlash`, so a universal
`+layout.ts` with `ssr = false` gets the shell. Kit 2.69.3 had the same branch at `page/index.js:120-123`
(`!(state.prerendering && …)`); for a prerendered route the two conditions are identical. Confirmed by building
a temporary `ssr = false` route: `build/<route>/index.html` held no component markup and booted with
`kit.start(app, element)` (no hydration data); the probe route was removed.

## Landmines for the local S23 branch (`migrate/S23-S36-public-site`, rebase onto PR-C1)
Read from its committed state (`fecc017`); the worktree may hold more.
- **`#lib`**: ~86 added lines reference `$lib/…`. Re-run `npx sv@1.1.1 migrate sveltekit-3 --cwd web --tasks lib-alias --no-install --confirm`,
  then add `.js` to any specifier it leaves bare (`vi.mock(…)` calls and similar).
- **Do not run the `paths` task on S23's `.svelte` files** — it re-prints them (defects above). Apply by hand:
  - `resolve('/sermones/')`-style pathnames become `resolve('sermones/')`. A leading `/` now means a **route
    id**, and group routes have ids like `/(public)/sermones`; `resolve('/')` stays.
  - `import { base } from '$app/paths'` (the noindex test `base !== ''`) no longer exists; `resolve('/') !== '/'` says the same.
  - `$app/types`: `Pathname` → `Path` without the leading slash (`DONATE_PATH: Path = 'donacion/'`), `Asset` → `AssetPath`.
- **Config**: there is no `svelte.config.js`. Kit options go in `sveltekit({...})` in `web/vite.config.ts`; Svelte
  compile options in `web/svelte-options.ts` (Vitest reads them there).
- **Env**: anything read through `$app/env/*` must be declared in `web/src/env.ts`. S23's YouTube key is read
  from `process.env` in `src/lib/server/youtube.ts`, so it is unaffected; declaring it there as a private,
  static, validated variable is an option.
- **`app.html`**: S02b does not change it, so S23's Google Fonts block rebases cleanly. PR-C2 also edits it
  (noindex, frame guard, theme key) — expect a textual conflict there, not here. D-037: whichever of S23 and
  PR-C2 lands second adds `fonts.googleapis.com` (styles) and `fonts.gstatic.com` (fonts) to the CSP.
- **Tests**: mock `$app/env`, not `$app/environment`; the Vitest stubs are `tests/stubs/app-env*.ts`.
- **Repos**: S22b changes every repo's return type (ADR-0004); S23's `newsletter` repo and homepage loaders adapt then.

## Ledger follow-ups (for the PR-C1 ledger step — not edited here)
- D-007: "→ SvelteKit `$env/static/public`" now reads "→ the variables `web/src/env.ts` declares → `$app/env/public`";
  the empty-value guarantee is the schemas in `src/env.ts`.
- G-018: `web/` pins `typescript@^6` (D-030), not `^5`.
- G-019: `npm run preview` re-reads `vite.config.ts` (not `svelte.config.js`); the config now throws a G-019 hint on a mangled `BASE_PATH`.
- G-020: the `relative: false` rationale no longer involves a fallback page; G-021 resolved by D-036 (fallback dropped).
- G-023: `handleMissingId` lives in `vite.config.ts`.
- New gotchas: `sv migrate` 1.1.1 re-prints `.svelte` files and de-escapes text; eslint-plugin-svelte < 3.23.1
  skips `no-navigation-without-resolve` on Kit 3; npm 11.5.2's `npm install` crashes on this lockfile
  (`Cannot read properties of null (reading 'edgesOut')`) — use npm ≥ 11.21 to change dependencies (`npm ci`
  is unaffected); Kit 3 fetches `version.json` on focus/visibility and hourly by default; on Windows an open VS Code window can hold
  `node_modules/@rolldown/binding-win32-x64-msvc/*.node`, so `npm ci` fails with EPERM half-way — close it,
  or restore with `npm install`.

## How to resume if interrupted
- Branch: `migrate/S02b-S05b-S22b-foundations`. Last known-good: the commit that adds this file.
- Done: everything above; all gates green in the worktree and in the clean room.
- Next concrete action: S05b (gates) and S22b (repo results) on the same branch, then the PR-C1 ledger step.
- Landmines: the worktree's checkout is CRLF (`core.autocrlf=true`), so `prettier --check` reads every untouched
  file as unformatted until it is rewritten — the codemod's `npm run format` already did that here; in a fresh
  worktree use `prettier --check --end-of-line auto` or the clean-room archive (G-025). `web/test-results/` is
  Playwright output and not gitignored — never commit it.

## On completion
- [ ] Update `MIGRATION.md` (ledger step): status board, Current state, Next up, the follow-ups above.
- [x] Open PR-C1 (#50); paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
