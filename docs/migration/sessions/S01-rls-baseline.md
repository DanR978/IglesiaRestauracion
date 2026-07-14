# Session S01 — RLS audit + committed schema baseline

**Stream:** foundation
**Depends on:** none (this is the first session — it gates every typed session)   **PR:** <#___>   **Branch:** `migrate/S01-rls-baseline`
**Status:** ⬜ not started

## Goal (one sentence)
Make the Supabase schema + RLS policies reproducible from git (they are currently dashboard-only), so DB types can be generated deterministically and the security boundary the new client relies on is reviewable.

## In scope
- Run the read-only `supabase/rls-audit.sql` against the live DB and record findings.
- `supabase init` + `supabase link --project-ref snqwxgyhfiinouewxgiy` (adds `supabase/config.toml`).
- Commit `supabase/migrations/00000000000000_baseline.sql` from `supabase db dump --schema public` (the dashboard-created base schema + policies + helper functions).

## Out of scope (do NOT touch)
- Any application code (`js/`, `css/`, `web/` doesn't exist yet).
- The 16 existing `supabase/migrations/*.sql` — never edit or reorder them; this session only **adds** the baseline.
- Any actual RLS *change* — this session captures current state; hardening (e.g. the `aal2` policy) is S39.

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2, §3-G-004) and `supabase/README.md` (it documents exactly which tables/helpers are dashboard-only).
- [ ] Have a Supabase access token / `supabase login` with access to project `snqwxgyhfiinouewxgiy`.
- [ ] Legacy source of truth: `supabase/README.md`, `supabase/rls-audit.sql`, `supabase/migrations/*`.

## Steps
1. `supabase login`; `supabase init` (if no `config.toml`); `supabase link --project-ref snqwxgyhfiinouewxgiy`.
2. Run `supabase/rls-audit.sql` in the SQL editor (or `supabase db execute`). Record, in the PR body: any `public` table with `rls_enabled = false`; any policy granting `authenticated`/`anon` broad `USING (true)`; and confirm the two PII invariants — `event_registrations` and `discipleship_interests` are **anon INSERT-only, no anon SELECT**.
3. `supabase db dump --schema public > supabase/migrations/00000000000000_baseline.sql`. Verify the dump captured the helper functions `is_admin()`, `my_ministry_id()`, `has_tab()`, `is_finance()` — if any live in another schema, dump that schema too or hand-add the definitions (see gotcha).
4. Locally: `supabase db reset` and confirm the baseline + the 16 existing migrations apply cleanly in order.
5. If the audit surfaced a real hole (e.g. a permissive `profiles` UPDATE that allows self-role-escalation, or an anon SELECT on a PII table), **do not fix it here** — record it as a new `G-xxx` gotcha and a `post-migration`/security issue, and flag it to the human. (These map to audit findings SEC-02.)

## Acceptance criteria
- [ ] `supabase/migrations/00000000000000_baseline.sql` committed; `supabase db reset` applies baseline + all existing migrations with no error.
- [ ] `is_admin()`, `my_ministry_id()`, `has_tab()`, `is_finance()` exist in the local DB after reset.
- [ ] PR body records the audit result and confirms (or flags) the anon-INSERT-only / no-anon-SELECT invariant on `event_registrations` and `discipleship_interests`.
- [ ] `MIGRATION.md` G-004 struck through as closed.

## Verification gate
- [ ] Applicable boxes from `docs/migration/VERIFICATION.md` (here: #4 not yet, #12 secrets clean, #13 ledger). No app build yet.

## How to resume if interrupted
- Branch: `migrate/S01-rls-baseline`. Done so far: <bullets>. Next action: <…>.
- Landmines: never edit existing migrations; a `db dump` may miss cross-schema helper functions (verify each one is in the dump).

## On completion
- [ ] Update `MIGRATION.md`: mark S01 ✅ (Phase 0), set Next up = S02, strike G-004, append any audit-found gotcha as G-xxx.
- [ ] Open PR; link this file.
