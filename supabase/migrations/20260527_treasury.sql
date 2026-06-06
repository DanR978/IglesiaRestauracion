-- ============================================================================
-- Treasury / Budgeting — income · budgets · expenses · payables · notes
-- + a church-wide "treasurer" role
-- Date: 2026-05-27
-- Run in the Supabase SQL Editor (default `postgres` role). Idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 0) Roles — add 'treasurer' (church-wide, no ministry, like admin)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'ministry_leader', 'treasurer'));

-- invitations: allow treasurer, scoped church-wide
alter table public.invitations drop constraint if exists invitations_role_check;
do $$
begin
  -- the role column may have its own inline check; normalize it
  begin
    alter table public.invitations add constraint invitations_role_check
      check (role in ('admin','ministry_leader','treasurer'));
  exception when duplicate_object then null; end;
end $$;

alter table public.invitations drop constraint if exists invitations_role_ministry_chk;
alter table public.invitations add constraint invitations_role_ministry_chk check (
  (role in ('admin','treasurer') and ministry_id is null) or
  (role = 'ministry_leader'      and ministry_id is not null)
);

-- Helpers
create or replace function public.is_treasurer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'treasurer')
$$;

create or replace function public.can_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_treasurer()
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Finance tables
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_income (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  source      text not null,                 -- e.g. "Ofrenda dominical", "Donación"
  fund        text,                           -- optional designation
  amount      numeric(12,2) not null check (amount >= 0),
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Budgets are MONTHLY and per "line". A line is a ministry OR a custom line
-- such as the pastor's allowance. line_key keeps them unique per month and
-- lets PostgREST upsert on plain columns.
--   ministry line → line_key = '<ministry uuid>', ministry_id set, label null
--   pastor line   → line_key = 'pastor',          ministry_id null, label set
create table if not exists public.fin_budgets (
  id          uuid primary key default gen_random_uuid(),
  line_key    text not null,
  label       text,                           -- display label for non-ministry lines
  ministry_id uuid references public.ministries(id) on delete cascade,
  period      text not null,                  -- monthly: 'YYYY-MM'
  amount      numeric(12,2) not null check (amount >= 0),
  note        text,
  updated_at  timestamptz not null default now(),
  unique (line_key, period)
);

create table if not exists public.fin_expenses (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  ministry_id uuid references public.ministries(id) on delete set null,
  label       text,                           -- non-ministry allocation line (e.g. 'Pastor')
  payee       text,
  category    text,
  amount      numeric(12,2) not null check (amount >= 0),
  status      text not null default 'paid' check (status in ('paid','pending')),
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.fin_payables (
  id          uuid primary key default gen_random_uuid(),
  creditor    text not null,                  -- who is owed
  amount      numeric(12,2) not null check (amount >= 0),
  due_on      date,
  ministry_id uuid references public.ministries(id) on delete set null,
  status      text not null default 'open' check (status in ('open','paid')),
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create table if not exists public.fin_notes (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  ministry_id uuid references public.ministries(id) on delete set null,
  pinned      boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Recurring outflows — stipends, rent, subscriptions (e.g. pastor paid monthly).
-- A "post this month" action in the UI spawns a fin_expenses row from one of
-- these, so recurring pay still lands in the ledger, budgets and reports.
create table if not exists public.fin_recurring (
  id           uuid primary key default gen_random_uuid(),
  payee        text not null,                 -- e.g. "Pastor — estipendio"
  ministry_id  uuid references public.ministries(id) on delete set null,
  label        text,                           -- non-ministry allocation line (e.g. 'Pastor')
  category     text,
  amount       numeric(12,2) not null check (amount >= 0),
  frequency    text not null default 'monthly' check (frequency in ('monthly','weekly','yearly')),
  day_of_month smallint check (day_of_month is null or day_of_month between 1 and 31),
  active       boolean not null default true,
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_fin_income_date   on public.fin_income(occurred_on desc);
create index if not exists idx_fin_expenses_date on public.fin_expenses(occurred_on desc);
create index if not exists idx_fin_expenses_min  on public.fin_expenses(ministry_id);
create index if not exists idx_fin_budgets_min   on public.fin_budgets(ministry_id);
create index if not exists idx_fin_payables_stat on public.fin_payables(status, due_on);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — full control for admins/treasurer; ministry leaders read their own
-- ────────────────────────────────────────────────────────────────────────────
alter table public.fin_income    enable row level security;
alter table public.fin_budgets   enable row level security;
alter table public.fin_expenses  enable row level security;
alter table public.fin_payables  enable row level security;
alter table public.fin_notes     enable row level security;
alter table public.fin_recurring enable row level security;

-- Income / payables / notes / recurring: finance roles only.
do $$
declare t text;
begin
  foreach t in array array['fin_income','fin_payables','fin_notes','fin_recurring'] loop
    execute format('drop policy if exists %I_finance_all on public.%I', t, t);
    execute format(
      'create policy %I_finance_all on public.%I for all to authenticated
         using (public.can_finance()) with check (public.can_finance())', t, t);
  end loop;
end $$;

-- Budgets + expenses: finance roles full; ministry leaders read-only on their own.
drop policy if exists fin_budgets_finance_all on public.fin_budgets;
create policy fin_budgets_finance_all on public.fin_budgets
  for all to authenticated using (public.can_finance()) with check (public.can_finance());
drop policy if exists fin_budgets_leader_read on public.fin_budgets;
create policy fin_budgets_leader_read on public.fin_budgets
  for select to authenticated using (ministry_id = public.my_ministry_id());

drop policy if exists fin_expenses_finance_all on public.fin_expenses;
create policy fin_expenses_finance_all on public.fin_expenses
  for all to authenticated using (public.can_finance()) with check (public.can_finance());
drop policy if exists fin_expenses_leader_read on public.fin_expenses;
create policy fin_expenses_leader_read on public.fin_expenses
  for select to authenticated using (ministry_id = public.my_ministry_id());

-- Audit history for every finance table (reuses audit_capture from 20260526).
do $$
declare t text;
begin
  foreach t in array array['fin_income','fin_budgets','fin_expenses','fin_payables','fin_notes','fin_recurring'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I
         for each row execute function public.audit_capture()', t);
  end loop;
end $$;
