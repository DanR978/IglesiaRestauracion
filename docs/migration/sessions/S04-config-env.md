# Session S04 — Config/secrets → `$env` `PUBLIC_*`

**Stream:** foundation
**Depends on:** S02 (stacked on S03 — extends the deploy.yml step S03 added)   **PR:** <#___>   **Branch:** `migrate/S04-config-env`
**Status:** 🟦 PR open

## Goal (one sentence)
Give `web/` its build-time public config (`PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` via `$env/static/public`) such that a missing variable **fails the build** instead of shipping a nullable client.

## In scope
- `web/src/lib/config.ts` — imports from `$env/static/public`, throws on empty (build-time, D-007).
- `web/src/routes/+layout.ts` — imports `$lib/config` so the module is in every build graph (an unused module would be tree-shaken and the guarantee would be hollow).
- `web/.env.example` (committed; `web/.env` was already gitignored by S02).
- `.github/workflows/deploy.yml` — `env:` block on the S03 "Build SvelteKit app" step, reusing the SAME GitHub secrets the legacy `config.js` step consumes (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). No new secrets.

## Out of scope (do NOT touch)
- No Supabase client yet (S06 — `@supabase/supabase-js` is not added here).
- No service-role key, ever, anywhere in `web/` (D-007).
- Legacy `js/lib/config.js` generation step — untouched.

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2 — esp. D-002, D-007 — §3 esp. G-019 Windows env mangling) and `CLAUDE.md`.
- [ ] Confirm S02 ✅ (S03 may still be 🟦 — this stacks on its branch).
- [ ] Legacy source of truth: the "Generate config.js from secrets" step in `deploy.yml` (secret names).
- [ ] Fixture / golden: none. Oracle = the two builds below.

## Steps
1. Write `config.ts` + the `+layout.ts` import + `.env.example`; add the `env:` block in `deploy.yml`.
2. Verify both directions (acceptance criteria).

## Acceptance criteria
- [ ] `BASE_PATH=/app npm run build` with NO env **fails** (`MISSING_EXPORT: "PUBLIC_SUPABASE_URL" is not exported by virtual:env/static/public`). ✅ verified locally
- [ ] Same build with `web/.env` populated **succeeds**; `npm run check` clean. ✅ verified locally (157 files, 0 errors, 0 warnings)
- [ ] An empty-but-declared var also fails (the `required()` throw runs during prerender).
- [ ] `git diff` = the four files above + session file + `MIGRATION.md`; no `web/.env` committed.

## Verification gate
- [ ] Ran `docs/migration/VERIFICATION.md` — applicable boxes (#2 secrets, #6 build, #8 scope, #12 types, #13 ledger); #5/#10/#11 N/A.

## How to resume if interrupted
- Branch: `migrate/S04-config-env` (stacked on `migrate/S03-merged-deploy`). Last known-good commit: see PR.
- Done so far: all four files written; both build directions verified.
- Next concrete action: merge after S03.
- Landmines: on Windows use `MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build` (G-019); keep `typescript@^5` (G-018); the `+layout.ts` import is load-bearing — removing it silently voids the fail-the-build guarantee.

## On completion
- [ ] Update `MIGRATION.md`: status board, Current state, Next up.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
