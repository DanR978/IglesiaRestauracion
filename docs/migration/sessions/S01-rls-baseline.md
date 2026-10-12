# Session S01 — RLS audit + committed schema baseline

**Stream:** foundation
**Depends on:** none (this is the first session — it gates every typed session)   **PR:** <#___>   **Branch:** `migrate/S01-rls-baseline`
**Status:** ✅ done (2026-07-14) — PR `migrate/S01-rls-baseline`

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
- [x] `supabase/migrations/00000000000000_baseline.sql` committed **+ `00000000000001_baseline_storage.sql`** (a `--schema public` dump misses the 15 `storage.objects` policies — G-013); `supabase db reset` applies both baselines + all 16 migrations with no error.
- [x] `is_admin()`, `my_ministry_id()`, `has_tab()`, `is_finance()` exist in the local DB after reset (24 functions total).
- [x] Audit run; the anon-INSERT-only / no-anon-SELECT invariant on `event_registrations` and `discipleship_interests` is **CONFIRMED**. Findings recorded as G-013…G-017.
- [x] `MIGRATION.md` G-004 struck through as closed.

## Verification gate
- [x] Applicable boxes from `docs/migration/VERIFICATION.md` (#8 legacy untouched, #12 secrets clean, #13 ledger). No app build yet — `web/` does not exist until S02.

## How to resume if interrupted
- Branch: `migrate/S01-rls-baseline`. Done so far: <bullets>. Next action: <…>.
- Landmines: never edit existing migrations; a `db dump` may miss cross-schema helper functions (verify each one is in the dump).

## On completion
- [x] Update `MIGRATION.md`: S01 ✅, Next up = S02, G-004 struck, G-013…G-017 appended.
- [x] Open PR; link this file.

## Outcome (2026-07-14)

**Departures from the "out of scope" line, both forced by the acceptance criterion** (`db reset`
applies clean) and both content-preserving — call them out in review:

1. **The 16 migrations were renamed** `YYYYMMDD_x.sql` → `YYYYMMDDHHMMSS_x.sql`. The CLI keys
   `schema_migrations` on the leading digits, so six files shared version `20260630` and `db reset`
   died on a duplicate key. Order preserved; SQL untouched; only the self/cross-referencing filename
   comments inside them were rewritten (G-014).
2. **`…_ministry_budget.sql` gained 4 `drop policy if exists` lines.** It drops the *old* policy
   names but not the *new* ones it creates, so despite its "Idempotent" header it failed on re-run
   (`pp_fin_income_church already exists`). No semantic change.

**Not fixed here, by instruction (step 5) — flagged for the human / S39:** G-015 (Modo
mantenimiento is dead in prod — one unapplied migration), G-016 (`is_aal2()` is a `select true`
stub, so DB-side MFA is not enforced), G-017 (event-images bucket writable by any authenticated
user; `fin_*` category reads open to all authenticated; unvalidated anon newsletter insert).

**Prod was not modified.**
