-- ============================================================================
-- 20260702000002_multi_ministry.sql — a user (ministry_leader) can lead SEVERAL
-- ministries, not just one
-- ============================================================================
-- Run AFTER 20260701000002_ministry_budget.sql. Run in the Supabase SQL Editor.
--
-- Adds profiles.ministry_ids uuid[] as the canonical list of ministries a user
-- leads (e.g. a "Youth & Kids Manager" leads both Youth AND Kids). The old
-- single profiles.ministry_id stays in sync (= first element) for backward
-- compatibility with my_ministry_id() and event-scoping code that still reads it.
--
-- The church budget a media user sees now aggregates across ALL of their
-- ministries (fin_expenses / fin_recurring allocated to any of them).
-- Idempotent.
-- ============================================================================

-- ── Column + backfill ────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists ministry_ids uuid[] not null default '{}';

-- Seed the array from the existing single ministry for accounts created before
-- this migration (only when the array is still empty).
update public.profiles
   set ministry_ids = array[ministry_id]
 where ministry_id is not null
   and (ministry_ids is null or cardinality(ministry_ids) = 0);

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- The set of ministries the current user leads. Falls back to the legacy
-- single column so it keeps working even if a row was never backfilled.
create or replace function public.my_ministry_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select case
           when cardinality(coalesce(ministry_ids, '{}')) > 0 then ministry_ids
           when ministry_id is not null then array[ministry_id]
           else '{}'::uuid[]
         end
    from public.profiles where id = auth.uid();
$$;

-- Keep the single-ministry helper working (first ministry) for any caller that
-- still expects one value.
create or replace function public.my_ministry_id()
returns uuid language sql stable security definer set search_path = public as $$
  select (public.my_ministry_ids())[1];
$$;

-- ── Budget income policies now match ANY of the user's ministries ────────────
-- The church's payments allocated to any ministry I lead are my budget income.
drop policy if exists pp_fin_expenses_budget on public.fin_expenses;
create policy pp_fin_expenses_budget on public.fin_expenses for select to authenticated
  using (project_id is null and ministry_id is not null and ministry_id = any(public.my_ministry_ids()));

-- Recurring budget the treasurer set up for any ministry I lead (read-only).
do $$
begin
  if to_regclass('public.fin_recurring') is not null then
    execute 'drop policy if exists pp_fin_recurring_budget on public.fin_recurring';
    execute 'create policy pp_fin_recurring_budget on public.fin_recurring for select to authenticated
             using (ministry_id is not null and ministry_id = any(public.my_ministry_ids()))';
  end if;
end $$;
