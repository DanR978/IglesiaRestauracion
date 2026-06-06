-- ============================================================================
-- Church fund accounting — funds (balances) + income/expense categories
-- Date: 2026-05-29
-- Run AFTER 20260527/20260528 (treasury). Idempotent.
--
-- Model (church standard):
--   • Funds HOLD money and carry a running balance (opening + income - expense).
--   • Categories CLASSIFY each transaction (and are what you budget).
-- Every income/expense is tagged with a fund + a category.
-- Seeded with Iglesia Restauración Divina's own funds and categories; all
-- editable in the admin.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Funds ───────────────────────────────────────────────────────────────────
create table if not exists public.fin_funds (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  restricted      boolean not null default false,   -- designated/restricted purpose
  opening_balance numeric(12,2) not null default 0, -- balance before tracking started
  sort            int not null default 0,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── Income categories ───────────────────────────────────────────────────────
create table if not exists public.fin_income_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort       int not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Expense categories (grouped by your 5 headers) ──────────────────────────
create table if not exists public.fin_expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  group_name  text,                               -- Salario · Servicios · Ministerios · Benevolencia · Otros
  needs_note  boolean not null default false,     -- e.g. "Otros" asks for a note
  sort        int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Tag transactions with fund + category ───────────────────────────────────
alter table public.fin_income   add column if not exists fund_id     uuid references public.fin_funds(id) on delete set null;
alter table public.fin_income   add column if not exists category_id uuid references public.fin_income_categories(id) on delete set null;
alter table public.fin_expenses add column if not exists fund_id     uuid references public.fin_funds(id) on delete set null;
alter table public.fin_expenses add column if not exists category_id uuid references public.fin_expense_categories(id) on delete set null;

create index if not exists idx_fin_income_fund   on public.fin_income(fund_id);
create index if not exists idx_fin_expenses_fund on public.fin_expenses(fund_id);

-- ── RLS — finance roles manage; everyone authenticated may read the lists ────
alter table public.fin_funds              enable row level security;
alter table public.fin_income_categories  enable row level security;
alter table public.fin_expense_categories enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fin_funds','fin_income_categories','fin_expense_categories'] loop
    execute format('drop policy if exists %I_finance_all on public.%I', t, t);
    execute format('create policy %I_finance_all on public.%I for all to authenticated
                      using (public.can_finance()) with check (public.can_finance())', t, t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t);
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                      for each row execute function public.audit_capture()', t);
  end loop;
end $$;

-- ── Seed: funds ──────────────────────────────────────────────────────────────
insert into public.fin_funds (name, restricted, sort) values
  ('General',      false, 1),
  ('Benevolencia', true,  2),
  ('Caballeros',   false, 3),
  ('Damas',        false, 4),
  ('Jóvenes',      false, 5),
  ('Niños',        false, 6)
on conflict (name) do nothing;

-- ── Seed: income categories ─────────────────────────────────────────────────
insert into public.fin_income_categories (name, sort) values
  ('Ofrenda domingos', 1),
  ('Ofrenda martes',   2),
  ('Diezmos',          3),
  ('Otros (donaciones)', 4)
on conflict (name) do nothing;

-- ── Seed: expense categories (grouped) ──────────────────────────────────────
insert into public.fin_expense_categories (name, group_name, needs_note, sort) values
  ('Sueldo del pastor',  'Salario',      false, 1),
  ('Pago de la limpieza','Salario',      false, 2),
  ('Renta',              'Servicios',    false, 3),
  ('Luz / agua / internet','Servicios',  false, 4),
  ('Website y programas','Servicios',    false, 5),
  ('Niños',              'Ministerios',  false, 6),
  ('Alabanza',           'Ministerios',  false, 7),
  ('Evangelismo',        'Ministerios',  false, 8),
  ('Eventos especiales', 'Ministerios',  false, 9),
  ('Benevolencia',       'Benevolencia', false, 10),
  ('Ofrenda a predicador','Otros',       false, 11),
  ('Gastos generales',   'Otros',        false, 12),
  ('Otros',              'Otros',        true,  13)
on conflict (name) do nothing;
