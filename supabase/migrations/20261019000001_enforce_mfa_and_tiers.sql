-- ============================================================================
-- 20261019000001_enforce_mfa_and_tiers.sql — server-side two-step verification
-- (aal2) and the developer tier (MIGRATION.md D-033 / D-034)
-- ============================================================================
-- Run in the Supabase SQL Editor as ONE paste. Idempotent — safe to re-run.
--
-- ORDER
--   • Apply AFTER every pending migration file. The aal2 layer covers the tables
--     that exist when this runs, so re-run it after applying any later file —
--     and after re-running 20260702000001_designs.sql,
--     20260703000001_profile_avatar.sql, 20260704000002_profile_self_service.sql
--     or 20261012_site_analytics.sql, which re-create RPCs hardened below.
--   • No enrollment cutoff needed (D-033 as amended 2026-10-20): an account
--     WITH a verified factor whose session has not passed it (aal1) reads and
--     writes only what a signed-out visitor can, plus its own profile row; an
--     account without a factor works as before.
--   • Check with supabase/sql/preflight-auth.sql (the catalog query must return
--     zero rows). Undo with supabase/sql/rollback-auth.sql.
--
-- WHAT IT ENFORCES
--   1. is_aal2() reads the `aal` claim of the caller's JWT; an account with no
--      verified second factor passes too (optional setup, D-033 as amended).
--   2. A RESTRICTIVE aal2 layer — policies aal2_select / aal2_insert /
--      aal2_update / aal2_delete, `to authenticated` — on every public table
--      with RLS, on storage.objects writes and on Realtime private-channel
--      messages. Restrictive policies AND with every permissive policy, present
--      or future, so re-running an older file (they re-create helpers and
--      permissive policies) cannot loosen it; that is also why the check lives
--      here and not inside has_tab() / is_admin(). anon is untouched.
--      What an aal1 session keeps — at most what anon has, plus its own profile
--      (newsletter sign-ups go through the newsletter-subscribe function):
--        events, calendar_events, special_events  every row (all public)
--        gallery_albums, gallery_photos            published rows
--        discipleship_groups                       published, listed groups
--        event_registrations, discipleship_interests  the public sign-up insert
--        app_settings                              key = 'features'
--        profiles                                  its own row
--        leaders_directory()                       public RPC, unchanged
--   3. aal2 inside the SECURITY DEFINER RPCs, which RLS does not reach:
--      analytics_summary, analytics_live, list_designer_users, set_my_avatar
--      (which also accepts only the caller's own URL in this project's avatars
--      bucket) and
--      set_my_display_name. Stored avatar URLs of any other shape are cleared.
--   4. Tiers. One developer predicate, account_has_system_tab(): role 'admin'
--      plus the system tab, on a confirmed, non-banned account — no admin
--      short-circuit. has_system_tab(tab) adds aal2; is_developer() is
--      has_system_tab('users').
--        app_settings writes → 'settings'     audit_log reads   → 'activity'
--        ministries writes   → 'ministries'   invitations reads → 'users'
--      profiles, role_presets and invitations take no client writes: their only
--      writers are admin-invite (service role) and the set_my_* RPCs.
--      event-images uploads/deletes → holders of an event tab (admins included).
--   5. A locking trigger refuses a profile change or delete that would leave no
--      developer — also when auth.users cascades a delete into profiles.
--   6. audit_log rows for access changes on profiles and role_presets made by a
--      client session. Service-role and GoTrue-session changes are skipped:
--      admin-invite writes its own rows with the caller's id; changes made from
--      the Supabase dashboard are not audited here.
--   7. admin_revoke_user_sessions(uuid) — service role only.
--   8. calendar_events.created_by → ON DELETE SET NULL (like every other
--      created_by), so deleting an account that created events succeeds.
-- ============================================================================


-- Every policy statement below takes an ACCESS EXCLUSIVE lock on a table the
-- live site reads. If one queues behind another transaction, fail fast rather
-- than stall the site's reads behind it (as 20260824120000_fin_receipts.sql).
set local lock_timeout = '5s';


-- ════ 1. is_aal2() ═══════════════════════════════════════════════════════════
-- GoTrue stamps every access token with `aal`; it reads 'aal2' once a second
-- factor was verified in that session. anon and service-role tokens carry none.
-- Amended 2026-10-20 (D-033): setting up a second factor is optional, so only
-- an account that HAS a verified factor must have used it — Supabase's own
-- pattern for optional MFA. An account without one works at aal1. The name
-- stays: every policy and RPC below calls it.
create or replace function public.is_aal2()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      or ((select auth.uid()) is not null
          and not exists (select 1 from auth.mfa_factors f
                           where f.user_id = (select auth.uid()) and f.status = 'verified'))
$$;


-- ════ 2. The developer tier ══════════════════════════════════════════════════
-- The ONE developer predicate (also mirrored by admin-invite's isDeveloper()).
-- An unconfirmed account (a pending invitation) or a banned one holds nothing.
create or replace function public.account_has_system_tab(p_user_id uuid, p_tab text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = p_user_id
       and p.role = 'admin'
       and p.allowed_tabs @> array[p_tab]
       and u.email_confirmed_at is not null
       and (u.banned_until is null or u.banned_until <= now())
       and u.deleted_at is null
  );
$$;
revoke execute on function public.account_has_system_tab(uuid, text) from public, anon, authenticated;
grant  execute on function public.account_has_system_tab(uuid, text) to service_role;

-- The caller holds `tab` as a system tab, in a session that passed its second
-- factor. Unlike has_tab(), being an admin is not enough on its own.
create or replace function public.has_system_tab(tab text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and public.account_has_system_tab((select auth.uid()), tab);
$$;
revoke execute on function public.has_system_tab(text) from public, anon;
grant  execute on function public.has_system_tab(text) to authenticated, service_role;

create or replace function public.is_developer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_system_tab('users');
$$;
revoke execute on function public.is_developer() from public, anon;
grant  execute on function public.is_developer() to authenticated, service_role;


-- ════ 3. The aal2 layer on every public table with RLS ═══════════════════════
-- `sel` / `ins` name what an aal1 session may still read / insert: exactly the
-- rows the anon policies expose. Every other command, on every other table,
-- requires aal2. A table without RLS is reported by the preflight catalog query.
do $layer$
declare
  aal2 constant text := '(select public.is_aal2())';
  t    text;
  sel  text;
  ins  text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
     order by c.relname
  loop
    sel := case t
      when 'events'              then null   -- every row is public: no read layer
      when 'calendar_events'     then null
      when 'special_events'      then null
      when 'gallery_albums'      then aal2 || ' or is_published'
      when 'gallery_photos'      then aal2 || ' or exists (select 1 from public.gallery_albums a'
                                         || ' where a.id = gallery_photos.album_id and a.is_published)'
      when 'discipleship_groups' then aal2 || ' or (is_published and status in (''open'', ''active'', ''completed''))'
      when 'profiles'            then aal2 || ' or id = (select auth.uid())'
      when 'app_settings'        then aal2 || ' or key = ''features'''
      else aal2
    end;
    ins := case t
      when 'event_registrations'    then aal2 || ' or exists (select 1 from public.special_events se'
                                            || ' where se.id = event_registrations.event_id and se.registration_open)'
      when 'discipleship_interests' then aal2 || ' or char_length(btrim(coalesce(full_name, ''''))) between 1 and 200'
      else aal2
    end;

    execute format('drop policy if exists aal2_select on public.%I', t);
    if sel is not null then
      execute format('create policy aal2_select on public.%1$I as restrictive for select to authenticated'
                     ' using (%2$s)', t, sel);
    end if;
    execute format('drop policy if exists aal2_insert on public.%I', t);
    execute format('create policy aal2_insert on public.%1$I as restrictive for insert to authenticated'
                   ' with check (%2$s)', t, ins);
    execute format('drop policy if exists aal2_update on public.%I', t);
    execute format('create policy aal2_update on public.%1$I as restrictive for update to authenticated'
                   ' using (%2$s) with check (%2$s)', t, aal2);
    execute format('drop policy if exists aal2_delete on public.%I', t);
    execute format('create policy aal2_delete on public.%1$I as restrictive for delete to authenticated'
                   ' using (%2$s)', t, aal2);
  end loop;
end $layer$;


-- ════ 4. Storage and Realtime ════════════════════════════════════════════════
-- Every upload, replace and delete is a staff action from the admin, so writes
-- need aal2 in every bucket. Reads are unchanged: the public buckets are public,
-- and the receipts / leaders read policies already call is_aal2().
drop policy if exists aal2_insert on storage.objects;
create policy aal2_insert on storage.objects as restrictive for insert to authenticated
  with check ((select public.is_aal2()));
drop policy if exists aal2_update on storage.objects;
create policy aal2_update on storage.objects as restrictive for update to authenticated
  using ((select public.is_aal2())) with check ((select public.is_aal2()));
drop policy if exists aal2_delete on storage.objects;
create policy aal2_delete on storage.objects as restrictive for delete to authenticated
  using ((select public.is_aal2()));

-- event-images (G-017a): written by the holders of an event tab; has_any_tab()
-- is true for every admin.
drop policy if exists event_images_tab_insert on storage.objects;
create policy event_images_tab_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'event-images'
              or public.has_any_tab(array['upcoming', 'calendario', 'special-events']));
drop policy if exists event_images_tab_update on storage.objects;
create policy event_images_tab_update on storage.objects as restrictive for update to authenticated
  using      (bucket_id <> 'event-images'
              or public.has_any_tab(array['upcoming', 'calendario', 'special-events']))
  with check (bucket_id <> 'event-images'
              or public.has_any_tab(array['upcoming', 'calendario', 'special-events']));
drop policy if exists event_images_tab_delete on storage.objects;
create policy event_images_tab_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'event-images'
         or public.has_any_tab(array['upcoming', 'calendario', 'special-events']));

-- Realtime private channels (the designer's co-edit topics): joining or sending
-- needs aal2. Same guard as 20260702000001_designs.sql: never aborts the file.
do $realtime$
begin
  if to_regclass('realtime.messages') is null then
    raise notice '[aal2] realtime.messages not found — skipped.';
    return;
  end if;
  execute 'drop policy if exists aal2_select on realtime.messages';
  execute 'create policy aal2_select on realtime.messages as restrictive for select to authenticated'
          ' using ((select public.is_aal2()))';
  execute 'drop policy if exists aal2_insert on realtime.messages';
  execute 'create policy aal2_insert on realtime.messages as restrictive for insert to authenticated'
          ' with check ((select public.is_aal2()))';
exception when others then
  raise warning '[aal2] realtime.messages layer skipped: %', sqlerrm;
end $realtime$;


-- ════ 5. Tiers on the system surfaces ════════════════════════════════════════
drop policy if exists tier_settings_insert on public.app_settings;
create policy tier_settings_insert on public.app_settings as restrictive for insert to authenticated
  with check ((select public.has_system_tab('settings')));
drop policy if exists tier_settings_update on public.app_settings;
create policy tier_settings_update on public.app_settings as restrictive for update to authenticated
  using ((select public.has_system_tab('settings'))) with check ((select public.has_system_tab('settings')));
drop policy if exists tier_settings_delete on public.app_settings;
create policy tier_settings_delete on public.app_settings as restrictive for delete to authenticated
  using ((select public.has_system_tab('settings')));

drop policy if exists tier_activity_select on public.audit_log;
create policy tier_activity_select on public.audit_log as restrictive for select to authenticated
  using ((select public.has_system_tab('activity')));

drop policy if exists tier_ministries_insert on public.ministries;
create policy tier_ministries_insert on public.ministries as restrictive for insert to authenticated
  with check ((select public.has_system_tab('ministries')));
drop policy if exists tier_ministries_update on public.ministries;
create policy tier_ministries_update on public.ministries as restrictive for update to authenticated
  using ((select public.has_system_tab('ministries'))) with check ((select public.has_system_tab('ministries')));
drop policy if exists tier_ministries_delete on public.ministries;
create policy tier_ministries_delete on public.ministries as restrictive for delete to authenticated
  using ((select public.has_system_tab('ministries')));

drop policy if exists tier_users_select on public.invitations;
create policy tier_users_select on public.invitations as restrictive for select to authenticated
  using ((select public.has_system_tab('users')));

-- No client writes on the account tables. admin-invite writes them with the
-- service role (which bypasses RLS); set_my_avatar / set_my_display_name and
-- handle_new_user() are SECURITY DEFINER.
do $deny$
declare
  t text;
begin
  foreach t in array array['profiles', 'role_presets', 'invitations'] loop
    execute format('drop policy if exists deny_client_insert on public.%I', t);
    execute format('create policy deny_client_insert on public.%I as restrictive for insert to authenticated'
                   ' with check (false)', t);
    execute format('drop policy if exists deny_client_update on public.%I', t);
    execute format('create policy deny_client_update on public.%I as restrictive for update to authenticated'
                   ' using (false) with check (false)', t);
    execute format('drop policy if exists deny_client_delete on public.%I', t);
    execute format('create policy deny_client_delete on public.%I as restrictive for delete to authenticated'
                   ' using (false)', t);
  end loop;
end $deny$;


-- ════ 6. RPCs: aal2 where RLS does not reach ═════════════════════════════════
-- Each body is the current one plus the check; grants are kept by CREATE OR REPLACE.

-- Share picker of the designer: only for designer users (admins and holders of
-- special-events) in an aal2 session.
create or replace function public.list_designer_users()
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
      select p.id, p.display_name, p.avatar_url
      from public.profiles p
      where auth.uid() is not null
        and (p.role = 'admin' or p.allowed_tabs @> array['special-events'])
        and p.id <> auth.uid()
        and public.is_aal2()
        and (public.is_admin() or public.has_tab('special-events'))
    $$;

create or replace function public.set_my_display_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_aal2() then
    raise exception 'Esta acción requiere la verificación en dos pasos.' using errcode = '42501';
  end if;
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

-- An avatar is a public URL of an object in the caller's own folder of this
-- project's `avatars` bucket (js/pages/admin/account.js uploads
-- `<uid>/avatar-<ms>.<ext>`). Fixed host, fixed path alphabet: the value is safe
-- wherever it is rendered and can't point the panel at another server.
create or replace function public.avatar_url_is_valid(p_user_id uuid, p_url text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
    p_user_id is not null
    and char_length(p_url) <= 500
    -- this project's Storage host, or the local stack
    and p_url ~ ('^(https://snqwxgyhfiinouewxgiy\.supabase\.co'
                 || '|http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?)'
                 || '/storage/v1/object/public/avatars/'
                 || p_user_id::text || '/[A-Za-z0-9._-]+$'),
    false);
$$;

create or replace function public.set_my_avatar(p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.is_aal2() then
    raise exception 'Esta acción requiere la verificación en dos pasos.' using errcode = '42501';
  end if;
  if v_url is not null and not public.avatar_url_is_valid(auth.uid(), v_url) then
    raise exception 'La foto debe estar en tu carpeta de avatares.' using errcode = '22023';
  end if;
  update public.profiles set avatar_url = v_url where id = auth.uid();
end;
$$;

-- Clear stored avatars that set_my_avatar would now refuse (they fall back to
-- initials).
update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and not public.avatar_url_is_valid(id, avatar_url);

-- Analytics: only where 20261012_site_analytics.sql is applied (it creates the
-- tables these read). The bodies are that file's, plus the aal2 check.
do $analytics$
begin
  if to_regprocedure('public.analytics_summary(timestamptz, timestamptz, text, text)') is null
     or to_regprocedure('public.analytics_live()') is null then
    raise notice '[aal2] analytics RPCs not installed — skipped; re-run this file after 20261012_site_analytics.sql.';
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
  if not public.is_aal2() then
    raise exception 'Esta acción requiere la verificación en dos pasos.' using errcode = '42501';
  end if;
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
  if not public.is_aal2() then
    raise exception 'Esta acción requiere la verificación en dos pasos.' using errcode = '42501';
  end if;
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

  revoke execute on function public.analytics_summary(timestamptz, timestamptz, text, text) from public, anon;
  revoke execute on function public.analytics_live() from public, anon;
  grant  execute on function public.analytics_summary(timestamptz, timestamptz, text, text) to authenticated;
  grant  execute on function public.analytics_live() to authenticated;
end $analytics$;


-- ════ 7. Never zero developers ═══════════════════════════════════════════════
-- Refuses a profile update or delete that takes away the last developer
-- (same predicate as account_has_system_tab). A pending invitation or a banned
-- account is not a developer, so resending or revoking an invitation is never
-- blocked by it. When auth.users cascades a delete here (GoTrue's admin delete,
-- running as supabase_auth_admin with search_path auth) the auth row is already
-- gone, so that profile's confirmed/banned state cannot be read and it counts
-- as a developer (fail closed). The advisory lock serializes concurrent
-- demotions so two of them cannot each count the other as the one remaining.
create or replace function public.guard_last_developer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id and new.role = 'admin' and new.allowed_tabs @> array['users'] then
    return new;
  end if;

  if old.role = 'admin' and old.allowed_tabs @> array['users']
     and not exists (
       select 1 from auth.users u
        where u.id = old.id
          and (u.email_confirmed_at is null
               or (u.banned_until is not null and u.banned_until > now())
               or u.deleted_at is not null))
  then
    perform pg_advisory_xact_lock(hashtext('public.guard_last_developer'));
    if not exists (
      select 1 from public.profiles p
       where p.id <> old.id
         and public.account_has_system_tab(p.id, 'users')
    ) then
      raise exception 'Debe quedar al menos un usuario con acceso de desarrollador.'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_last_developer on public.profiles;
create trigger trg_guard_last_developer
  before update or delete on public.profiles
  for each row execute function public.guard_last_developer();


-- ════ 8. Audit of access changes ═════════════════════════════════════════════
-- Same audit_log shape as audit_capture() (action = TG_OP, entity = table).
-- admin-invite writes its own rows attributed to the caller, so a change made by
-- the service role — directly, or through GoTrue's admin API on its behalf — is
-- not logged twice here. Anything else (e.g. the SQL Editor) is.
create or replace function public.audit_access_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec    jsonb;
  v_act  uuid := auth.uid();
  v_nm   text;
  v_tabs text;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('role', true) in ('service_role', 'supabase_auth_admin')
     or session_user = 'supabase_auth_admin' then
    return null;
  end if;

  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;

  if v_act is not null then
    select display_name into v_nm from public.profiles where id = v_act;
  end if;

  select string_agg(t.tab, ', ' order by t.n)
    into v_tabs
    from jsonb_array_elements_text(coalesce(rec -> 'allowed_tabs', '[]'::jsonb))
         with ordinality as t(tab, n);

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, label)
    values (v_act, coalesce(v_nm, 'Sistema'), tg_op, tg_table_name, coalesce(rec ->> 'id', ''),
            left(concat_ws(' · ',
                   nullif(coalesce(rec ->> 'display_name', rec ->> 'name'), ''),
                   'rol: ' || coalesce(rec ->> 'role', rec ->> 'base_role'),
                   'páginas: ' || coalesce(v_tabs, 'ninguna')), 200));
  return null;
end $$;

drop trigger if exists trg_audit_access on public.profiles;
create trigger trg_audit_access
  after update on public.profiles
  for each row
  when ((old.role, old.allowed_tabs, old.preset_id, old.ministry_ids, old.ministry_id)
        is distinct from (new.role, new.allowed_tabs, new.preset_id, new.ministry_ids, new.ministry_id))
  execute function public.audit_access_change();

drop trigger if exists trg_audit_access_rows on public.profiles;
create trigger trg_audit_access_rows
  after insert or delete on public.profiles
  for each row execute function public.audit_access_change();

drop trigger if exists trg_audit_access on public.role_presets;
create trigger trg_audit_access
  after insert or update or delete on public.role_presets
  for each row execute function public.audit_access_change();


-- ════ 9. Sign a user out everywhere (admin-invite only) ══════════════════════
-- Deleting the sessions ends every refresh token (auth.refresh_tokens cascades);
-- access tokens already issued stay valid until they expire (jwt_exp).
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.admin_revoke_user_sessions(uuid) to service_role;


-- ════ 8. calendar_events.created_by ═════════════════════════════════════════
-- The only created_by key without an ON DELETE action: deleting an account that
-- had created a calendar event failed inside GoTrue. Match the other tables.
alter table public.calendar_events drop constraint if exists calendar_events_created_by_fkey;
alter table public.calendar_events
  add constraint calendar_events_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
