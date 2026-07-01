-- ============================================================================
-- 20260630_role_presets.sql — reusable access presets ("Presets de acceso")
-- ============================================================================
-- Run in the Supabase SQL Editor (migrations are applied manually for this
-- project). Replaces "pick a ministry + hand-check pages" with named presets.
-- A preset is a TEMPLATE: assigning it copies base_role + allowed_tabs onto the
-- profile (the columns the page-permission RLS enforces). Editing a preset
-- propagates to its members (done in the admin-invite Edge Function).
-- Idempotent — safe to re-run.
-- ============================================================================

-- 1) Table ────────────────────────────────────────────────────────────────────
create table if not exists public.role_presets (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  slug         text        not null unique,
  base_role    text        not null check (base_role in ('admin', 'ministry_leader', 'treasurer')),
  allowed_tabs text[]      not null default '{}',
  icon         text,
  color        text,
  is_system    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2) profiles.preset_id ────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists preset_id uuid
    references public.role_presets(id) on delete set null;
create index if not exists profiles_preset_id_idx on public.profiles (preset_id);

-- 2b) Ensure profiles.allowed_tabs exists (the page-permission RLS + admin app
--     read/write it). May be missing if 20260626_page_permissions.sql was never
--     applied here.
alter table public.profiles
  add column if not exists allowed_tabs text[] not null default '{}';

-- 3) Seed the built-in presets ────────────────────────────────────────────────
-- allowed_tabs meaning depends on base_role: ministry_leader → operational
-- pages; admin → which SYSTEM pages (users/activity/settings) on top of the
-- always-on admin pages (Desarrollador = all 3, Administrador = none);
-- treasurer → empty (finance by role).
insert into public.role_presets (name, slug, base_role, allowed_tabs, icon, color, is_system)
values
  ('Desarrollador', 'developer',     'admin',           '{users,activity,settings}',                       'fa-user-gear',     '#5b21b6', true),
  ('Administrador', 'administrador', 'admin',           '{}',                                              'fa-shield-halved', '#475569', true),
  ('Tesorería',     'tesoreria',     'treasurer',       '{}',                                              'fa-coins',         '#9a6a2c', true),
  ('Medios',        'medios',        'ministry_leader', '{upcoming,calendario,special-events,galeria}',    'fa-photo-film',    '#2a4a9e', true)
on conflict (slug) do nothing;

-- 4) Backfill existing accounts ────────────────────────────────────────────────
-- Existing admins keep full access → Desarrollador (all system tabs).
update public.profiles p
   set preset_id    = rp.id,
       allowed_tabs = '{users,activity,settings}'
  from public.role_presets rp
 where p.preset_id is null and rp.slug = 'developer' and p.role = 'admin';

update public.profiles p
   set preset_id = rp.id
  from public.role_presets rp
 where p.preset_id is null and rp.slug = 'tesoreria' and p.role = 'treasurer';

-- 5) RLS — admin-only (frontend reads presets via the Edge Function). ──────────
alter table public.role_presets enable row level security;
drop policy if exists role_presets_admin_all on public.role_presets;
create policy role_presets_admin_all
  on public.role_presets for all to authenticated
  using       (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'))
  with check  (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));
