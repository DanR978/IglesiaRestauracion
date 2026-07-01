-- ============================================================================
-- 20260630_page_permission_rls.sql — let non-admin staff actually load the
-- pages their preset grants
-- ============================================================================
-- Run in the Supabase SQL Editor.
--
-- Frontend tab visibility is driven by profiles.allowed_tabs, but the DB never
-- had RLS granting a `ministry_leader` access to the tables behind those tabs.
-- Admins bypass RLS, so a Medios user sees the tabs but the data never loads.
--
-- Adds has_tab/has_any_tab/is_finance helpers + additive `pp_*` policies. All
-- policies only GRANT access (OR'd with whatever exists). We deliberately do
-- NOT enable RLS on tables that might be off (would break public reads).
-- Idempotent.
-- ============================================================================

create or replace function public.has_tab(tab text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.allowed_tabs @> array[tab])
  );
$$;

create or replace function public.has_any_tab(tabs text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.allowed_tabs && tabs)
  );
$$;

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'treasurer')
  );
$$;

-- Grant helper: additive full-CRUD policy, skipping missing tables. Does NOT
-- enable RLS (force-enabling on a currently-off table could break public reads).
create or replace function public._pp_grant(tbl text, pol text, using_expr text, check_expr text)
returns void language plpgsql as $$
begin
  if to_regclass('public.' || tbl) is null then
    raise notice 'skip %, table not found', tbl;
    return;
  end if;
  execute format('drop policy if exists %I on public.%I', pol, tbl);
  execute format(
    'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
    pol, tbl, using_expr, check_expr);
end $$;

-- Ministries — any signed-in staff can READ (names/colors on events, pickers).
do $$
begin
  if to_regclass('public.ministries') is not null then
    execute 'drop policy if exists pp_ministries_read on public.ministries';
    execute 'create policy pp_ministries_read on public.ministries for select to authenticated using (true)';
  end if;
end $$;

-- Registraciones (special-events)
select public._pp_grant('special_events',     'pp_special_events',
  'public.has_tab(''special-events'')', 'public.has_tab(''special-events'')');
select public._pp_grant('event_registrations','pp_event_registrations',
  'public.has_tab(''special-events'')', 'public.has_tab(''special-events'')');

-- Eventos
select public._pp_grant('events',         'pp_events',
  'public.has_any_tab(array[''upcoming'',''calendario'',''special-events''])',
  'public.has_any_tab(array[''upcoming'',''calendario''])');
select public._pp_grant('calendar_events','pp_calendar_events',
  'public.has_any_tab(array[''upcoming'',''calendario'',''special-events''])',
  'public.has_any_tab(array[''upcoming'',''calendario''])');

-- Galería
select public._pp_grant('gallery_albums','pp_gallery_albums', 'public.has_tab(''galeria'')', 'public.has_tab(''galeria'')');
select public._pp_grant('gallery_photos','pp_gallery_photos', 'public.has_tab(''galeria'')', 'public.has_tab(''galeria'')');

-- Discipulado
select public._pp_grant('discipleship_groups',   'pp_discipleship_groups',    'public.has_tab(''discipulado'')', 'public.has_tab(''discipulado'')');
select public._pp_grant('discipleship_interests','pp_discipleship_interests', 'public.has_tab(''discipulado'')', 'public.has_tab(''discipulado'')');
select public._pp_grant('discipleship_members',  'pp_discipleship_members',   'public.has_tab(''discipulado'')', 'public.has_tab(''discipulado'')');

-- Tesorería (treasurer + admin) — finance tables
select public._pp_grant('fin_income',             'pp_fin_income',             'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_expenses',           'pp_fin_expenses',           'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_recurring',          'pp_fin_recurring',          'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_payables',           'pp_fin_payables',           'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_notes',              'pp_fin_notes',              'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_funds',              'pp_fin_funds',              'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_income_categories',  'pp_fin_income_categories',  'public.is_finance()', 'public.is_finance()');
select public._pp_grant('fin_expense_categories', 'pp_fin_expense_categories', 'public.is_finance()', 'public.is_finance()');

drop function public._pp_grant(text, text, text, text);
