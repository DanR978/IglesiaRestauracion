-- ============================================================================
-- Special Events & Registrations — public sign-up events (VBS, retreats…)
-- Date: 2026-06-25
-- Run in the Supabase SQL Editor (default `postgres` role). Idempotent.
--
-- Two tables:
--   1. special_events       — the public, registration-based event. No PII, so
--                             anon may READ it (renders the landing page + QR
--                             target). Admins manage via is_admin().
--   2. event_registrations  — one row per attendee. Holds PII (minors, health,
--                             emergency contact), so it follows the same model
--                             as newsletter_subscribers / discipleship_interests:
--                               • anon may INSERT only (sign up) — and only while
--                                 that event's registration is open. It can NEVER
--                                 read the roster back.
--                               • admins read / manage / export via is_admin().
--
-- Audit + a new-registration notification are wired the same way the rest of the
-- admin platform is (see 20260526_admin_platform.sql).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 1) special_events — the public event (title, image, info, date, location)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.special_events (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  slug              text not null unique,        -- stable public URL / QR target
  image_url         text,
  description       text,
  information       text,                         -- "Información" block (logistics)
  event_at          timestamptz,                  -- date + time
  location          text,
  registration_open boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.special_events enable row level security;

-- Public may read — the landing page is anonymous and holds no PII.
drop policy if exists special_events_public_read on public.special_events;
create policy special_events_public_read on public.special_events
  for select to anon, authenticated
  using (true);

-- Admins create / edit / delete.
drop policy if exists special_events_admin_all on public.special_events;
create policy special_events_admin_all on public.special_events
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 2) event_registrations — attendee sign-ups (PII)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.event_registrations (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.special_events(id) on delete cascade,
  first_name         text not null,
  last_name          text not null,
  age                int  not null,
  sex                text,
  contact_name       text not null,
  relationship       text not null,
  contact_phone      text not null,
  contact_email      text,
  allergies          text,
  medical_conditions text,
  notes              text,
  submitted_at       timestamptz not null default now(),
  -- Light length caps so a hostile client can't store novels in free-text fields.
  constraint event_registrations_len check (
    char_length(first_name)         <= 120 and
    char_length(last_name)          <= 120 and
    char_length(coalesce(sex,''))            <= 40  and
    char_length(contact_name)       <= 160 and
    char_length(relationship)       <= 80  and
    char_length(contact_phone)      <= 40  and
    char_length(coalesce(contact_email,''))      <= 160 and
    char_length(coalesce(allergies,''))          <= 2000 and
    char_length(coalesce(medical_conditions,'')) <= 2000 and
    char_length(coalesce(notes,''))              <= 2000
  ),
  constraint event_registrations_age check (age >= 0 and age <= 120)
);

create index if not exists idx_event_reg_event     on public.event_registrations(event_id);
create index if not exists idx_event_reg_submitted on public.event_registrations(submitted_at desc);

alter table public.event_registrations enable row level security;

-- anon + authenticated may INSERT (register) — but ONLY while that event's
-- registration is open. No SELECT/UPDATE/DELETE for them: the roster (PII) is
-- never exposed to the client.
drop policy if exists event_reg_insert on public.event_registrations;
create policy event_reg_insert on public.event_registrations
  for insert to anon, authenticated
  with check (exists (
    select 1 from public.special_events se
    where se.id = event_id and se.registration_open = true
  ));

-- Admins read / manage / export the roster.
drop policy if exists event_reg_admin_all on public.event_registrations;
create policy event_reg_admin_all on public.event_registrations
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Audit — reuse the existing generic capture trigger
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['special_events','event_registrations'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I
         for each row execute function public.audit_capture()', t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Notification — alert staff when a new registration arrives
--    (mirrors notify_new_interest() in 20260526_admin_platform.sql)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.special_events where id = new.event_id;
  insert into public.admin_notifications (type, title, body, link, entity, entity_id)
    values (
      'event_registration',
      'Nueva inscripción',
      coalesce(new.first_name || ' ' || new.last_name, 'Alguien') ||
        coalesce(' — ' || v_title, ''),
      'special-events',
      'event_registrations',
      new.id::text
    );
  return new;
end $$;

drop trigger if exists trg_notify_registration on public.event_registrations;
create trigger trg_notify_registration
  after insert on public.event_registrations
  for each row execute function public.notify_new_registration();

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Realtime — so the admin roster + bell hot-update
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='event_registrations') then
    alter publication supabase_realtime add table public.event_registrations;
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='special_events') then
    alter publication supabase_realtime add table public.special_events;
  end if;
exception when others then null;
end $$;
