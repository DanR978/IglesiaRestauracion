-- ============================================================================
-- 20260701_fin_projects.sql — per-user "project" financial trackers
-- ============================================================================
-- Run in the Supabase SQL Editor, AFTER 20260630_page_permission_rls.sql
-- (it relies on the public.is_finance() helper, re-created here for safety).
--
-- A ministry user (ministry_leader) with the Tesorería page granted can create
-- personal PROJECTS (Youth, Kids, Event…) and track income + expenses per
-- project, each with its own balance. Entries are ordinary fin_income /
-- fin_expenses rows tagged with project_id, so the church TREASURER's full
-- books automatically include every project. Idempotent.
-- ============================================================================

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'treasurer')
  );
$$;

-- 1) Projects — owned by the user who created them. ───────────────────────────
create table if not exists public.fin_projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  icon       text,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists fin_projects_owner_idx on public.fin_projects (owner_id);

-- 2) Tag income + expenses with an optional project. NULL = general church
--    entry (the treasurer's normal books). ────────────────────────────────────
alter table public.fin_income   add column if not exists project_id uuid references public.fin_projects(id) on delete set null;
alter table public.fin_expenses add column if not exists project_id uuid references public.fin_projects(id) on delete set null;
create index if not exists fin_income_project_idx   on public.fin_income (project_id);
create index if not exists fin_expenses_project_idx on public.fin_expenses (project_id);

-- 3) RLS ──────────────────────────────────────────────────────────────────────
alter table public.fin_projects enable row level security;

-- Projects: the owner manages their own; treasurer/admin see them all.
drop policy if exists pp_fin_projects on public.fin_projects;
create policy pp_fin_projects on public.fin_projects
  for all to authenticated
  using (owner_id = auth.uid() or public.is_finance())
  with check (owner_id = auth.uid() or public.is_finance());

-- NOTE: the fin_income/fin_expenses access policies (treasurer = church books
-- with project_id IS NULL; owner = their own project rows; media = their
-- ministry's budget) are owned entirely by 20260701_ministry_budget.sql so
-- there's a single source of truth and re-running this file can't resurrect
-- broader access. Apply ministry_budget.sql right after this one.
