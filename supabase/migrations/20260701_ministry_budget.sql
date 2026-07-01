-- ============================================================================
-- 20260701_ministry_budget.sql — private project entries + ministry budget income
-- ============================================================================
-- Run AFTER 20260630_page_permission_rls.sql and 20260701_fin_projects.sql.
--
-- Goal:
--   • A media user's own project entries (fin_income/fin_expenses with a
--     project_id) are PRIVATE — the treasurer never sees them.
--   • The treasurer's books are the project_id-IS-NULL rows only.
--   • A media user sees, as budget INCOME, the church's expenses allocated to
--     THEIR ministry (the treasurer's recurring/one-off payments to that
--     ministry) — read-only.
-- Idempotent.
-- ============================================================================

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'treasurer'));
$$;

create or replace function public.my_ministry_id()
returns uuid language sql stable security definer set search_path = public as $$
  select ministry_id from public.profiles where id = auth.uid();
$$;

-- Ensure RLS is ON for the finance tables (so the policies below bind even on a
-- from-scratch rebuild). These are admin/finance-only tables — never public —
-- so enabling RLS can't break anon reads.
do $$
begin
  if to_regclass('public.fin_income')   is not null then execute 'alter table public.fin_income   enable row level security'; end if;
  if to_regclass('public.fin_expenses') is not null then execute 'alter table public.fin_expenses enable row level security'; end if;
end $$;

-- ── fin_income: church (treasurer) sees project_id IS NULL; a user manages
--    income tied to a project they own. ───────────────────────────────────────
drop policy if exists pp_fin_income          on public.fin_income;
drop policy if exists pp_fin_income_projects on public.fin_income;

create policy pp_fin_income_church on public.fin_income for all to authenticated
  using       (public.is_finance() and project_id is null)
  with check  (public.is_finance() and project_id is null);

create policy pp_fin_income_owner on public.fin_income for all to authenticated
  using       (project_id is not null and exists (select 1 from public.fin_projects fp where fp.id = fin_income.project_id  and fp.owner_id = auth.uid()))
  with check  (project_id is not null and exists (select 1 from public.fin_projects fp where fp.id = fin_income.project_id  and fp.owner_id = auth.uid()));

-- ── fin_expenses: same church + owner, PLUS media reads its ministry's church
--    expenses as budget income (read-only). ───────────────────────────────────
drop policy if exists pp_fin_expenses          on public.fin_expenses;
drop policy if exists pp_fin_expenses_projects on public.fin_expenses;

create policy pp_fin_expenses_church on public.fin_expenses for all to authenticated
  using       (public.is_finance() and project_id is null)
  with check  (public.is_finance() and project_id is null);

create policy pp_fin_expenses_owner on public.fin_expenses for all to authenticated
  using       (project_id is not null and exists (select 1 from public.fin_projects fp where fp.id = fin_expenses.project_id and fp.owner_id = auth.uid()))
  with check  (project_id is not null and exists (select 1 from public.fin_projects fp where fp.id = fin_expenses.project_id and fp.owner_id = auth.uid()));

-- The church's payments allocated to my ministry are my budget income.
drop policy if exists pp_fin_expenses_budget on public.fin_expenses;
create policy pp_fin_expenses_budget on public.fin_expenses for select to authenticated
  using (project_id is null and ministry_id is not null and ministry_id = public.my_ministry_id());

-- Media also needs to read fin_recurring rows for its ministry (to show the
-- recurring budget the treasurer set up). Read-only.
do $$
begin
  if to_regclass('public.fin_recurring') is not null then
    execute 'drop policy if exists pp_fin_recurring_budget on public.fin_recurring';
    execute 'create policy pp_fin_recurring_budget on public.fin_recurring for select to authenticated
             using (ministry_id is not null and ministry_id = public.my_ministry_id())';
  end if;
end $$;
