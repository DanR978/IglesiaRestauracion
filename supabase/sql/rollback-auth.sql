-- ============================================================================
-- rollback-auth.sql — undo 20261019000001_enforce_mfa_and_tiers.sql
-- ============================================================================
-- Run in the Supabase SQL Editor as ONE paste, then redeploy admin-invite from
-- the tag taken before the migration was applied (the hardened function calls
-- admin_revoke_user_sessions, dropped here, and fails closed without it).
-- Idempotent.
--
-- Restores is_aal2() and the five RPCs to their exact previous definitions and
-- drops every policy, trigger and function the migration created. It cannot
-- restore the avatar URLs the migration cleared (those accounts show initials
-- until a photo is uploaded again).
--
-- BREAK-GLASS (dashboard owner, SQL Editor) — not part of the rollback:
--   • A developer locked out of their second factor re-enrolls at next sign-in:
--       delete from auth.mfa_factors where user_id = '<uid>';
--   • Change the last developer on purpose (e.g. hand the role over):
--       alter table public.profiles disable trigger trg_guard_last_developer;
--       -- … the change …
--       alter table public.profiles enable trigger trg_guard_last_developer;
--     The preflight catalog query reports the trigger while it is disabled.
-- ============================================================================
begin;
set local lock_timeout = '5s';

-- ── Policies ────────────────────────────────────────────────────────────────
do $policies$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where (schemaname in ('public', 'storage', 'realtime')
            and policyname in ('aal2_select', 'aal2_insert', 'aal2_update', 'aal2_delete'))
        or (schemaname = 'public'
            and policyname in ('tier_settings_insert', 'tier_settings_update', 'tier_settings_delete',
                               'tier_activity_select',
                               'tier_ministries_insert', 'tier_ministries_update', 'tier_ministries_delete',
                               'tier_users_select',
                               'deny_client_insert', 'deny_client_update', 'deny_client_delete'))
        or (schemaname = 'storage' and tablename = 'objects'
            and policyname in ('event_images_tab_insert', 'event_images_tab_update', 'event_images_tab_delete'))
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $policies$;

-- ── Triggers ────────────────────────────────────────────────────────────────
drop trigger if exists trg_guard_last_developer on public.profiles;
drop trigger if exists trg_audit_access        on public.profiles;
drop trigger if exists trg_audit_access_rows   on public.profiles;
drop trigger if exists trg_audit_access        on public.role_presets;

-- ── is_aal2() and the RPCs, as before ───────────────────────────────────────
-- (00000000000000_baseline.sql)
create or replace function public.is_aal2()
returns boolean language sql stable as $$ select true $$;

-- (20260702000001_designs.sql)
create or replace function public.list_designer_users()
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
      select p.id, p.display_name, p.avatar_url
      from public.profiles p
      where auth.uid() is not null
        and (p.role = 'admin' or p.allowed_tabs @> array['special-events'])
        and p.id <> auth.uid()
    $$;

-- (20260703000001_profile_avatar.sql)
create or replace function public.set_my_avatar(p_url text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set avatar_url = nullif(btrim(coalesce(p_url, '')), '') where id = auth.uid();
$$;

-- (20260704000002_profile_self_service.sql)
create or replace function public.set_my_display_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if length(v_name) < 2 then
    raise exception 'El nombre debe tener al menos 2 caracteres.';
  end if;
  if length(v_name) > 80 then
    v_name := left(v_name, 80);
  end if;
  update public.profiles set display_name = v_name where id = auth.uid();
  return v_name;
end;
$$;

-- (20261012_site_analytics.sql) — only where that file is applied.
do $analytics$
begin
  if to_regprocedure('public.analytics_summary(timestamptz, timestamptz, text, text)') is null
     or to_regprocedure('public.analytics_live()') is null then
    return;
  end if;

  execute $ddl$
create or replace function public.analytics_summary(
  p_from   timestamptz,
  p_to     timestamptz,
  p_tz     text default 'America/New_York',
  p_bucket text default 'day'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz     text := p_tz;
  v_bucket text := p_bucket;
  v_out    jsonb;
begin
  if not public.has_tab('analytics') then
    raise exception 'No tienes acceso a las analíticas.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Rango de fechas inválido.' using errcode = '22023';
  end if;
  if v_bucket is null or v_bucket not in ('hour', 'day', 'month') then v_bucket := 'day'; end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'America/New_York'; end if;

  with pv as (
    select * from public.analytics_events
    where kind = 'pageview' and created_at >= p_from and created_at < p_to
  ),
  ok as (select * from pv where not not_found),
  ev as (
    select * from public.analytics_events
    where kind = 'event' and created_at >= p_from and created_at < p_to
  ),
  s as (select * from public._analytics_sessions(p_from, p_to)),
  series as (
    select b as bucket from generate_series(
      date_trunc(v_bucket, p_from at time zone v_tz),
      date_trunc(v_bucket, (p_to - interval '1 microsecond') at time zone v_tz),
      ('1 ' || v_bucket)::interval) b
  ),
  ts as (
    select se.bucket, count(ok.id) as pageviews, count(distinct ok.visitor_hash) as visitors
    from series se
    left join ok on date_trunc(v_bucket, ok.created_at at time zone v_tz) = se.bucket
    group by se.bucket
  ),
  pages as (
    select path,
           (array_agg(title order by created_at desc) filter (where title is not null))[1] as title,
           count(*) as views,
           count(distinct visitor_hash) as visitors,
           round(avg(engaged_ms) / 1000.0) as avg_engaged_s,
           round(avg(scroll_pct)) as avg_scroll
    from ok group by path order by views desc, path limit 25
  ),
  entries as (
    select entry_path as path, count(*) as sessions,
           round(100.0 * count(*) filter (where pages = 1) / count(*), 1) as bounce_rate
    from s group by entry_path order by sessions desc, path limit 10
  ),
  exits as (
    select exit_path as path, count(*) as sessions
    from s group by exit_path order by sessions desc, path limit 10
  ),
  sources as (
    select source, count(*) as sessions, count(distinct visitor_hash) as visitors,
           round(100.0 * count(*) filter (where pages = 1) / count(*), 1) as bounce_rate
    from s group by source order by sessions desc, source nulls first limit 15
  ),
  campaigns as (
    select utm_campaign as campaign, source, utm_medium as medium, count(*) as sessions
    from s where utm_campaign is not null
    group by utm_campaign, source, utm_medium order by sessions desc limit 10
  ),
  dim as (
    select 'device' as d, device as k, count(distinct visitor_hash) as visitors from ok group by device
    union all
    select 'browser', browser, count(distinct visitor_hash) from ok group by browser
    union all
    select 'os', os, count(distinct visitor_hash) from ok group by os
    union all
    select 'lang', split_part(lower(lang), '-', 1), count(distinct visitor_hash) from ok group by 2
    union all
    select 'tz', tz, count(distinct visitor_hash) from ok group by tz
  ),
  events as (
    select name, label, count(*) as count, count(distinct visitor_hash) as visitors
    from ev group by name, label order by count desc, name limit 30
  ),
  missing as (
    select path, count(*) as hits,
           (array_agg(referrer_host) filter (where referrer_host is not null))[1] as referrer
    from pv where not_found group by path order by hits desc, path limit 15
  ),
  heat as (
    select extract(dow from created_at at time zone v_tz)::int as d,
           extract(hour from created_at at time zone v_tz)::int as h,
           count(*) as n
    from ok group by 1, 2
  )
  select jsonb_build_object(
    'tz',        v_tz,
    'bucket',    v_bucket,
    'totals',    public._analytics_totals(p_from, p_to),
    'previous',  public._analytics_totals(p_from - (p_to - p_from), p_from),
    'series',    coalesce((select jsonb_agg(jsonb_build_object(
                    't', to_char(bucket, 'YYYY-MM-DD"T"HH24:MI'), 'pv', pageviews, 'v', visitors)
                    order by bucket) from ts), '[]'::jsonb),
    'pages',     coalesce((select jsonb_agg(to_jsonb(pages)) from pages), '[]'::jsonb),
    'entries',   coalesce((select jsonb_agg(to_jsonb(entries)) from entries), '[]'::jsonb),
    'exits',     coalesce((select jsonb_agg(to_jsonb(exits)) from exits), '[]'::jsonb),
    'sources',   coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(campaigns)) from campaigns), '[]'::jsonb),
    'dims',      coalesce((select jsonb_object_agg(d, rows) from (
                    select d, jsonb_agg(jsonb_build_object('k', k, 'v', visitors) order by visitors desc) as rows
                    from (select d, k, visitors,
                                 row_number() over (partition by d order by visitors desc) as rn
                          from dim) ranked
                    where rn <= 12 group by d) x), '{}'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(events)) from events), '[]'::jsonb),
    'not_found', coalesce((select jsonb_agg(to_jsonb(missing)) from missing), '[]'::jsonb),
    'heatmap',   coalesce((select jsonb_agg(to_jsonb(heat)) from heat), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$
$ddl$;

  execute $ddl$
create or replace function public.analytics_live()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_tab('analytics') then
    raise exception 'No tienes acceso a las analíticas.' using errcode = '42501';
  end if;

  return (
    with recent as (
      select distinct on (visitor_hash) visitor_hash, path
      from public.analytics_events
      where kind = 'pageview' and created_at > now() - interval '5 minutes'
      order by visitor_hash, created_at desc
    )
    select jsonb_build_object(
      'visitors', (select count(*) from recent),
      'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc)
                         from (select path, count(*) as n from recent
                               group by path order by n desc limit 5) p), '[]'::jsonb)
    )
  );
end;
$$
$ddl$;
end $analytics$;

-- ── Functions the migration added ───────────────────────────────────────────
drop function if exists public.guard_last_developer();
drop function if exists public.audit_access_change();
drop function if exists public.is_developer();
drop function if exists public.has_system_tab(text);
drop function if exists public.account_has_system_tab(uuid, text);
drop function if exists public.admin_revoke_user_sessions(uuid);
drop function if exists public.avatar_url_is_valid(uuid, text);

commit;

-- Section 8 (calendar_events.created_by ON DELETE SET NULL) is a bug fix that
-- needs no rollback: restoring the old key would make account deletion fail again.
