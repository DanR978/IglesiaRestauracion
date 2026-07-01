-- ============================================================================
-- 20260704_ministry_budget_projects.sql — ministry budgets as project tabs
-- ============================================================================
-- Run AFTER 20260701_fin_projects.sql and 20260702_multi_ministry.sql.
--
-- A ministry a leader is assigned to becomes its OWN tab in their project
-- treasury (a fin_projects row with ministry_id set, auto-created by the app the
-- first time that ministry has a church budget). Its income is seeded read-only
-- from the treasurer's allocations to that ministry (project_id IS NULL rows the
-- leader already reads via pp_fin_expenses_budget); its expenses are the leader's
-- own project entries. No RLS change: fin_projects is still owner-scoped.
-- Idempotent.
-- ============================================================================

alter table public.fin_projects
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;

create index if not exists fin_projects_ministry_idx on public.fin_projects(ministry_id);
