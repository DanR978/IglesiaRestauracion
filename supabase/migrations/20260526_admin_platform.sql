-- ============================================================================
-- Admin platform foundation — Settings · Audit log · Notifications
-- Date: 2026-05-26
-- Run in the Supabase SQL Editor (default `postgres` role). Idempotent.
--
-- Adds three building blocks the admin panel grows on:
--   1. app_settings        — key/value site configuration (church info, flags)
--   2. audit_log           — who changed what, written automatically by triggers
--   3. admin_notifications — in-app alerts for staff (e.g. new discipleship lead)
--
-- All three are admin-only via the existing is_admin() helper. Audit + not/n
-- rows are written by SECURITY DEFINER triggers (owner = postgres) so they
-- bypass RLS and can't be forged from the client.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 1) app_settings — key/value config
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed defaults (only inserts the missing keys; never overwrites edited values)
insert into public.app_settings (key, value) values
  ('church',   jsonb_build_object(
                 'name',    'Iglesia Restauración Divina',
                 'phone',   '(859) 270-8521',
                 'email',   'contactanos@irdlex.org',
                 'address', '2601 Clays Mill Rd, Lexington, KY 40503',
                 'service_times', 'Domingos 2:00 PM')),
  ('features', jsonb_build_object(
                 'discipulado',  true,
                 'galeria',      true,
                 'eventos',      true,
                 'donaciones',   true,
                 'maintenance',  false,
                 'pause_invites', false))
on conflict (key) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) audit_log — automatic change history
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,             -- INSERT | UPDATE | DELETE
  entity      text not null,             -- table name
  entity_id   text,
  label       text,                      -- best-effort human label of the row
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_log(created_at desc);
create index if not exists idx_audit_entity  on public.audit_log(entity);

alter table public.audit_log enable row level security;

-- Read-only for admins. No INSERT policy: rows arrive only via the trigger
-- (SECURITY DEFINER), and nobody may UPDATE/DELETE history from the client.
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (public.is_admin());

-- Generic capture trigger. Records actor + op + a friendly label, never the
-- full row (keeps PII out of the log and the table lean).
create or replace function public.audit_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec   jsonb;
  v_id  text;
  v_lbl text;
  v_act uuid := auth.uid();
  v_nm  text;
begin
  if (tg_op = 'DELETE') then rec := to_jsonb(old); else rec := to_jsonb(new); end if;

  v_id  := coalesce(rec->>'id', '');
  v_lbl := coalesce(rec->>'name', rec->>'title', rec->>'full_name',
                    rec->>'display_name', rec->>'subject', rec->>'slug', '');

  if v_act is not null then
    select display_name into v_nm from public.profiles where id = v_act;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, label)
    values (v_act, coalesce(v_nm, 'Sistema'), tg_op, tg_table_name, v_id, v_lbl);

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end $$;

-- Attach to the tables worth tracking. Re-runnable (drop if exists first).
do $$
declare t text;
begin
  foreach t in array array[
    'events','calendar_events','calendar_presets','ministries',
    'discipleship_groups','discipleship_members','discipleship_messages',
    'gallery_albums','app_settings','invitations'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I
         for each row execute function public.audit_capture()', t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) admin_notifications — in-app alerts for staff
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,             -- e.g. 'discipleship_interest'
  title       text not null,
  body        text,
  link        text,                      -- admin tab to jump to
  entity      text,
  entity_id   text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notif_created on public.admin_notifications(created_at desc);
create index if not exists idx_notif_unread  on public.admin_notifications(is_read) where is_read = false;

alter table public.admin_notifications enable row level security;

-- Admins read + mark-read + clear. Inserts come from SECURITY DEFINER triggers.
drop policy if exists admin_notifications_admin_all on public.admin_notifications;
create policy admin_notifications_admin_all on public.admin_notifications
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Fire a notification whenever a new discipleship interest comes in.
create or replace function public.notify_new_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_notifications (type, title, body, link, entity, entity_id)
    values (
      'discipleship_interest',
      'Nuevo interesado en discipulado',
      coalesce(new.full_name, 'Alguien') ||
        case when new.target_group_id is not null then ' — quiere unirse a un grupo'
             else ' — interés general' end,
      'discipulado',
      'discipleship_interests',
      new.id::text
    );
  return new;
end $$;

drop trigger if exists trg_notify_interest on public.discipleship_interests;
create trigger trg_notify_interest
  after insert on public.discipleship_interests
  for each row execute function public.notify_new_interest();

-- ────────────────────────────────────────────────────────────────────────────
-- Realtime so the bell + activity feed hot-update
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='admin_notifications') then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
exception when others then null;
end $$;
