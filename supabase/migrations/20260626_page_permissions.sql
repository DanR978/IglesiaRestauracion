-- ============================================================================
-- Per-user page permissions (allowed_tabs)
-- Date: 2026-06-26
-- Run in the Supabase SQL Editor (default `postgres` role). Idempotent.
--
-- Lets a default admin choose, PER USER, which admin pages a non-admin account
-- may open. The frontend hides un-granted tabs (cosmetic), and the policies
-- below are the REAL guard for the data behind those tabs.
--
--   • profiles.allowed_tabs text[]  — the set of tab keys a user may access.
--                                     Ignored for admins (they get everything).
--   • has_tab(t)                    — true if the current user's profile lists
--                                     tab `t`. SECURITY DEFINER so it can read
--                                     profiles regardless of that table's RLS.
--
-- The grant policies are ADDITIVE: PostgreSQL OR's permissive policies, so these
-- only widen access for grantees. The existing admin-only policies
-- (special_events_admin_all, event_reg_admin_all, the gallery policies, …) are
-- left untouched — admins keep full access exactly as before.
--
-- Grantable tab keys (must match the frontend + edge function whitelist):
--   analytics · upcoming · past · calendario · special-events · discipulado · galeria
-- (ministries / users / activity / settings stay admin-only; treasury stays
--  tied to the treasurer role.)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Column + helper
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists allowed_tabs text[] not null default '{}';

-- Backfill existing ministry leaders with the tab set they could see before this
-- migration (Próximos / Pasados / Calendario + the always-on Inicio), so nobody
-- loses access the moment the column appears. New invites get whatever the admin
-- picks in the Usuarios tab. Admins/treasurers are unaffected (they ignore it).
update public.profiles
   set allowed_tabs = array['upcoming','past','calendario']
 where role = 'ministry_leader'
   and (allowed_tabs is null or allowed_tabs = '{}');

create or replace function public.has_tab(t text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t = any(allowed_tabs) from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Registraciones — special_events + event_registrations
--    Grant key: 'special-events'
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists special_events_tab_grant on public.special_events;
create policy special_events_tab_grant on public.special_events
  for all to authenticated
  using (public.has_tab('special-events'))
  with check (public.has_tab('special-events'));

drop policy if exists event_reg_tab_grant on public.event_registrations;
create policy event_reg_tab_grant on public.event_registrations
  for all to authenticated
  using (public.has_tab('special-events'))
  with check (public.has_tab('special-events'));

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Galería — gallery_albums + gallery_photos
--    Grant key: 'galeria'
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists gallery_albums_tab_grant on public.gallery_albums;
create policy gallery_albums_tab_grant on public.gallery_albums
  for all to authenticated
  using (public.has_tab('galeria'))
  with check (public.has_tab('galeria'));

drop policy if exists gallery_photos_tab_grant on public.gallery_photos;
create policy gallery_photos_tab_grant on public.gallery_photos
  for all to authenticated
  using (public.has_tab('galeria'))
  with check (public.has_tab('galeria'));

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Discipulado — discipleship_groups / _interests / _members / _messages
--    Grant key: 'discipulado'
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'discipleship_groups','discipleship_interests',
    'discipleship_members','discipleship_messages'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', tbl || '_tab_grant', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.has_tab(''discipulado'')) '
      || 'with check (public.has_tab(''discipulado''))',
      tbl || '_tab_grant', tbl);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) (Optional, kept for parity) invitations carries the grant so a future
--    signup trigger can copy it. The edge function also upserts the profile
--    directly, so this is belt-and-suspenders.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.invitations
  add column if not exists allowed_tabs text[] not null default '{}';
