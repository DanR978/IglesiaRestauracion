-- ============================================================================
-- 20260824120100_fin_ministry_shared.sql — D-019: ministry treasury data is
-- ministry-SHARED, not owner-private
-- ============================================================================
-- Run in the Supabase SQL Editor, AFTER 20260824120000_fin_receipts.sql.
-- Idempotent — safe to re-run.
--
-- MIGRATION.md D-019 (locked 2026-08-23): every leader of a ministry
-- (ministry_id = ANY(public.my_ministry_ids())) sees the same ministry-scoped
-- treasury data — the fin_projects rows carrying that ministry_id and their
-- fin_income / fin_expenses entries. Personal (non-ministry) project entries
-- stay owner-private, invisible even to finance, exactly as today.
--
-- ADDITIVE ONLY. The existing owner policies are NOT dropped:
--   pp_fin_projects        (baseline)  owner_id = auth.uid() or is_finance()
--   pp_fin_income_owner    (20260701000002_ministry_budget.sql)
--   pp_fin_expenses_owner  (20260701000002_ministry_budget.sql)
--   pp_fin_income_church / pp_fin_expenses_church / pp_fin_expenses_budget
-- Postgres ORs permissive policies together, so each policy below only ever
-- WIDENS access; nothing an owner could do stops working. The three names
-- created here do not exist anywhere in the baseline or in any committed
-- migration, so there is no collision to resolve.
--
-- Legacy UI behaviour is unchanged by this file: `js/pages/admin/project-treasury.js`
-- filters by owner_id client-side, so a legacy leader still sees only their own
-- rows. The NEW app aggregates ministry entries by fin_projects.ministry_id
-- (every duplicate per-owner ministry project included); consolidating those
-- duplicate rows is deferred to the S64 cutover PR (D-019).
--
-- NO aal2 PREDICATE HERE, deliberately. The S56b spec marks the aal2 spot with
-- `/* +aal2 */` only in the fin_receipts and storage sketches; the D-019 sketch
-- carries no marker, and adding one would make ministry-shared access STRICTER
-- than the owner policies it widens (at S39 a non-MFA leader would keep their
-- own rows but silently lose their ministry-mates'). S39 should sweep aal2
-- across the whole fin_* family in one consistent pass. See NOTES.md.
-- ============================================================================

-- ── fin_projects: ministry-mates can READ the ministry's container rows ─────
-- Read only. Renaming / archiving / deleting a project stays with its owner and
-- finance via the baseline pp_fin_projects policy (revisit at S56b review).
drop policy if exists pp_fin_projects_ministry_read on public.fin_projects;
create policy pp_fin_projects_ministry_read on public.fin_projects for select to authenticated
  using (ministry_id is not null and ministry_id = any(public.my_ministry_ids()));

-- ── fin_income: full CRUD on entries of ministry-linked projects ────────────
drop policy if exists pp_fin_income_ministry on public.fin_income;
create policy pp_fin_income_ministry on public.fin_income for all to authenticated
  using      (project_id is not null and exists (select 1 from public.fin_projects fp
                where fp.id = fin_income.project_id and fp.ministry_id is not null
                  and fp.ministry_id = any(public.my_ministry_ids())))
  with check (project_id is not null and exists (select 1 from public.fin_projects fp
                where fp.id = fin_income.project_id and fp.ministry_id is not null
                  and fp.ministry_id = any(public.my_ministry_ids())));

-- ── fin_expenses: the same, for the expense half ────────────────────────────
drop policy if exists pp_fin_expenses_ministry on public.fin_expenses;
create policy pp_fin_expenses_ministry on public.fin_expenses for all to authenticated
  using      (project_id is not null and exists (select 1 from public.fin_projects fp
                where fp.id = fin_expenses.project_id and fp.ministry_id is not null
                  and fp.ministry_id = any(public.my_ministry_ids())))
  with check (project_id is not null and exists (select 1 from public.fin_projects fp
                where fp.id = fin_expenses.project_id and fp.ministry_id is not null
                  and fp.ministry_id = any(public.my_ministry_ids())));
