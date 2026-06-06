-- ============================================================================
-- Newsletter subscribers — visitors opt in to event news & reminders
-- Date: 2026-06-07
-- Run in the Supabase SQL Editor (default `postgres` role). Idempotent.
--
-- Security model (matches the rest of the site — see supabase/README.md):
--   • anon may INSERT only (sign up). It CANNOT read the list back — the
--     subscriber roster (PII) is never exposed to the client.
--   • admins may read / manage via is_admin().
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  source      text,                          -- page path they signed up from
  is_active   boolean not null default true, -- flip to false on unsubscribe
  created_at  timestamptz not null default now()
);

-- One row per email (case-insensitive) so re-subscribing is a no-op, not a dup.
create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));

alter table public.newsletter_subscribers enable row level security;

-- anon + authenticated may INSERT (subscribe). No SELECT/UPDATE/DELETE for them.
drop policy if exists newsletter_insert on public.newsletter_subscribers;
create policy newsletter_insert on public.newsletter_subscribers
  for insert to anon, authenticated
  with check (true);

-- Admins manage the list.
drop policy if exists newsletter_admin_all on public.newsletter_subscribers;
create policy newsletter_admin_all on public.newsletter_subscribers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
