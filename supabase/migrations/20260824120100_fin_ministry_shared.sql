-- ============================================================================
-- 20260824120100_fin_ministry_shared.sql — D-019: ministry treasury data is
-- ministry-SHARED, not owner-private (guarded by D-027)
-- ============================================================================
-- Run in the Supabase SQL Editor as ONE run — paste the whole file. Idempotent:
-- safe to re-run, including over an earlier, unguarded version of this file.
-- It has no dependency on 20260824120000_fin_receipts.sql.
--
-- MIGRATION.md D-019 (locked 2026-08-23): every leader of a ministry
-- (ministry_id = ANY(public.my_ministry_ids())) sees the same ministry-scoped
-- treasury data — the fin_projects rows carrying that ministry_id and their
-- fin_income / fin_expenses entries. Personal (non-ministry) projects stay
-- private between leaders. (Finance can still read every entry through the
-- legacy dashboard policies fin_income_finance_all / fin_expenses_finance_all —
-- a MIGRATION.md gotcha, not changed here.)
--
-- D-027 (2026-10-13): amended BEFORE it was first applied. Applying the sharing
-- policies alone, against the prod baseline in an offline Postgres harness,
-- opened five holes:
--   • any user could tag a row of their own with a ministry they don't lead,
--     and so write into (and, as a tab's write target, read) its books;
--   • a leader removed from a ministry kept full access to their old ministry
--     row, including the entries their former mates kept writing into it;
--   • a row's owner could re-tag, privatize, archive or delete a shared row;
--   • a leader could UPDATE a mate's shared entry into their own private
--     project (USING via pp_fin_*_ministry, WITH CHECK via pp_fin_*_owner);
--   • a ministry_leader without the 'treasury' page (e.g. the Medios preset)
--     got the ministry's projects and entries through the API.
-- So the guard (§1) ships in the same file, ahead of the sharing (§2), and the
-- two can never be applied apart. Legacy js/pages/admin/project-treasury.js
-- now aggregates ministry tabs by ministry_id across every leader's row.
--
-- NO aal2 PREDICATE HERE, deliberately. The S56b spec marks the aal2 spot with
-- `/* +aal2 */` only in the fin_receipts and storage sketches; the D-019 sketch
-- carries no marker, and adding one would make ministry-shared access STRICTER
-- than the owner policies it widens (at S39 a non-MFA leader would keep their
-- own rows but silently lose their ministry-mates'). S39 should sweep aal2
-- across the whole fin_* family in one consistent pass. See NOTES.md.
-- ============================================================================

set local lock_timeout = '3s';

-- ════ §1 Guard (D-027) ═══════════════════════════════════════════════════════
-- RESTRICTIVE, deliberately: these AND with every permissive policy, present or
-- future, so re-running an older file (20260701000001_fin_projects.sql
-- recreates the owner-wide pp_fin_projects) cannot reopen the holes. Finance
-- (is_finance) is untouched by all of them.

-- ── fin_projects: a non-finance user only ever reaches personal rows, or rows
--    of a ministry they CURRENTLY lead with the treasury page. Entry access
--    follows: every fin_income / fin_expenses policy resolves its project
--    through an EXISTS on fin_projects, which runs under the caller's RLS. ────
drop policy if exists pp_fin_projects_scope on public.fin_projects;
create policy pp_fin_projects_scope on public.fin_projects
  as restrictive for all to authenticated
  using      (public.is_finance() or ministry_id is null
              or (ministry_id = any(public.my_ministry_ids()) and public.has_tab('treasury')))
  with check (public.is_finance() or ministry_id is null
              or (ministry_id = any(public.my_ministry_ids()) and public.has_tab('treasury')));

-- ── Ministry rows are finance-managed. A leader can neither modify nor delete
--    one (not even their own), nor turn a personal project into a ministry
--    one or back — so a private history never silently becomes shared, and
--    shared entries can't be pulled out of the ministry. ──────────────────────
drop policy if exists pp_fin_projects_ministry_update on public.fin_projects;
create policy pp_fin_projects_ministry_update on public.fin_projects
  as restrictive for update to authenticated
  using      (public.is_finance() or ministry_id is null)
  with check (public.is_finance() or ministry_id is null);

drop policy if exists pp_fin_projects_ministry_delete on public.fin_projects;
create policy pp_fin_projects_ministry_delete on public.fin_projects
  as restrictive for delete to authenticated
  using (public.is_finance() or ministry_id is null);

-- ── Entries: only finance may move a movimiento to another project. A trigger,
--    because a policy can't compare the old row with the new one. auth.uid()
--    is null for the SQL editor and the service role (edge functions), and
--    new.project_id is null when the FK's ON DELETE SET NULL fires — both
--    pass. ───────────────────────────────────────────────────────────────────
create or replace function public.fin_entry_project_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.project_id is not null
     and new.project_id is distinct from old.project_id
     and auth.uid() is not null
     and not public.is_finance() then
    raise exception 'Solo tesorería puede mover un movimiento a otro proyecto.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_fin_income_project_guard on public.fin_income;
create trigger trg_fin_income_project_guard
  before update of project_id on public.fin_income
  for each row execute function public.fin_entry_project_guard();

drop trigger if exists trg_fin_expenses_project_guard on public.fin_expenses;
create trigger trg_fin_expenses_project_guard
  before update of project_id on public.fin_expenses
  for each row execute function public.fin_entry_project_guard();

-- ════ §2 Sharing (D-019) ═════════════════════════════════════════════════════
-- ADDITIVE. The existing owner policies are NOT dropped:
--   pp_fin_projects        (baseline)  owner_id = auth.uid() or is_finance()
--   pp_fin_income_owner    (20260701000002_ministry_budget.sql)
--   pp_fin_expenses_owner  (20260701000002_ministry_budget.sql)
--   pp_fin_income_church / pp_fin_expenses_church / pp_fin_expenses_budget
-- Postgres ORs permissive policies together, so each policy below only WIDENS
-- what the owner policies allow — within the §1 guard, which ANDs over all of
-- them. The three names created here exist nowhere else.

-- ── fin_projects: ministry-mates can READ the ministry's container rows ─────
-- Read only. Changing a ministry row is finance's (§1).
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
