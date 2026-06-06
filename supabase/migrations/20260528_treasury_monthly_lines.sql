-- ============================================================================
-- Treasury patch — monthly budget lines + allocation labels
-- Date: 2026-05-28
-- Run this if you applied an EARLIER copy of 20260527 (before line_key/label
-- existed). `create table if not exists` can't add columns to a table that
-- already exists, so this ALTERs them in. Idempotent / safe to re-run.
-- ============================================================================

-- fin_budgets → monthly lines (a line is a ministry OR e.g. the pastor)
alter table public.fin_budgets add column if not exists line_key text;
alter table public.fin_budgets add column if not exists label    text;

-- Backfill line_key for any pre-existing rows (ministry rows keyed by uuid)
update public.fin_budgets set line_key = ministry_id::text where line_key is null and ministry_id is not null;
update public.fin_budgets set line_key = id::text          where line_key is null;
alter table public.fin_budgets alter column line_key set not null;

-- Swap the uniqueness from (ministry_id, period) to (line_key, period)
alter table public.fin_budgets drop constraint if exists fin_budgets_ministry_id_period_key;
do $$
begin
  alter table public.fin_budgets add constraint fin_budgets_line_key_period_key unique (line_key, period);
exception when duplicate_object then null; when duplicate_table then null;
end $$;

-- Allocation label (non-ministry lines such as 'Pastor') on expenses + recurring
alter table public.fin_expenses  add column if not exists label text;
alter table public.fin_recurring add column if not exists label text;
