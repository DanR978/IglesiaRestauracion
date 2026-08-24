# Session S06 — Typed Supabase client (non-nullable, browser-guarded)

**Stream:** foundation
**Depends on:** S01, S04 (stacked on the S04/S05 landing PR)   **PR:** <#___>   **Branch:** `migrate/S06-typed-client`
**Status:** 🟦 PR open

## Goal (one sentence)
Give `web/` its permanent data-access root: a **non-nullable**, schema-typed Supabase client that is browser-guarded so prerender opens no socket.

## In scope
- `web/src/lib/db/database.types.ts` — generated schema types (see the generation note below).
- `web/src/lib/db/client.ts` — `createClient<Database>` fed by `$lib/config` (which already fails the build when unset, D-007), with `persistSession`/`autoRefreshToken`/`detectSessionInUrl` enabled only in the browser.
- `@supabase/supabase-js` as a runtime dep (bundled — the no-bare-imports rule is legacy-only).
- Vitest stubs for the SvelteKit virtual modules (`tests/stubs/env-public.ts`, `tests/stubs/app-environment.ts`) + aliases in `vitest.config.ts`, so unit tests can import config/client.
- `web/tests/unit/client.test.ts` — no-network-on-import proof + type-level assertions against the generated schema.

## Out of scope (do NOT touch)
- No repos (S22/S40/S52 build those on top). No auth flows (S39). No UI.
- No service-role key, ever (D-002/D-007).
- Legacy `js/lib/supabase.js` — untouched; its nullable-`sb` pattern is exactly what this session retires for the new app.

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2 — D-002, D-007 — §3 esp. G-004, G-015) and `CLAUDE.md`.
- [ ] Confirm S01 + S04 ✅/landed.
- [ ] Legacy source of truth: `js/lib/supabase.js` (what NOT to replicate: the nullable singleton).
- [ ] Fixture / golden: none (new module). Oracle = the unit tests + strict typecheck.

## Type-generation note (deviation, recorded)
The roadmap row says `supabase gen types --local`; **Docker is unavailable on this machine**, so the
types were generated from the **linked production project** instead:
`supabase gen types typescript --project-id snqwxgyhfiinouewxgiy --schema public`.
Given G-015 (git and prod have drifted), generating from prod captures the schema that RLS actually
enforces today — arguably the safer oracle until the drift is resolved. Regenerate the same way
after any applied migration (S56b adds `fin_receipts`, S39 touches policies). 1,665 lines, 34
tables, includes `events`, `fin_income`, `fin_expenses`, `profiles`.

## Steps
1. `npm i @supabase/supabase-js`; generate `database.types.ts` (command above).
2. Write `client.ts` (browser-guarded options); add the vitest stubs + aliases; write the tests.
3. Run the gate (below); push; CI validates on the PR.

## Acceptance criteria
- [ ] `supabase.from('events')` compiles under strict TS; type assertions on `events`/`fin_income` Rows pass. ✅ verified locally
- [ ] Importing `$lib/db/client` with `browser=false` calls `fetch` zero times (spy test). ✅
- [ ] `npm run check` / `lint` / `test` / `BASE_PATH=/app build` all green. ✅
- [ ] No `if (!supabase)` guard anywhere — the client is non-nullable by construction.

## Verification gate
- [ ] Ran `docs/migration/VERIFICATION.md` — applicable boxes (#1 tests, #2 secrets, #6 build, #8 scope, #12 types, #13 ledger); #5/#10/#11 N/A.

## How to resume if interrupted
- Branch: `migrate/S06-typed-client` (stacked on `migrate/S04-config-env`). Last known-good commit: see PR.
- Done so far: everything in scope written and verified locally.
- Next concrete action: merge after the S04/S05 landing PR.
- Landmines: regenerate types from the LINKED project, not `--local`, until Docker exists; the vitest `$app/environment` stub reports `browser=false` on purpose — component tests that need `browser=true` must override per-test, not edit the stub; `tslib` is a devDep because vitest resolves `@supabase/functions-js`'s CJS entry, which requires it un-hoisted — don't remove it.

## On completion
- [ ] Update `MIGRATION.md`: status board, Current state, Next up.
- [ ] Open/refresh the PR; paste the gate results; link this file.
- [ ] Set this file's Status and PR number.
