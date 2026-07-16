-- ============================================================================
-- 20260716_event_lifecycle.sql — event end dates, an honest open/closed state,
-- and the event ⇄ gallery album link.
-- ============================================================================
-- FIXES A PRODUCTION BUG. `event_reg_insert` gated registration on
-- `event_at >= now()`, but `event_at` is the event's START. A multi-day event
-- (EBS/VBS) therefore hard-closed the moment it began — while `status` still
-- read 'open', so the admin saw "Abierto" and the public saw "cerrado". Setting
-- the status back to open could not reopen it, because the invisible date
-- clause always won.
--
-- The fix inverts the authority:
--
--   • `registration_open` is the ONLY server-side gate. An explicit re-open by
--     an admin therefore always works. Do not re-add a date clause here.
--   • A scheduled job keeps that flag honest: once an event has actually ENDED
--     it writes registration_open=false + status='closed', so the stored status
--     can never silently disagree with reality again.
--   • `auto_closed_at` records that the job already had its say. It fires at
--     most once per schedule, so an admin re-opening an ended event is never
--     overruled. Changing event_at/ends_at is a new schedule and re-arms it.
--
-- Trade-off worth knowing: the date is no longer a backstop. If pg_cron is off,
-- an event left flagged open stays open. That is the point — the backstop was
-- what made the status lie. Section 7 warns if pg_cron is missing.
--
-- Idempotent. Apply manually in the SQL editor (CI never touches the DB).
-- ============================================================================

-- ── 1. Schema ───────────────────────────────────────────────────────────────

alter table public.special_events
  add column if not exists ends_at        timestamptz,
  add column if not exists auto_closed_at timestamptz;

comment on column public.special_events.ends_at is
  'When the event is over. Null falls back to the end of event_at''s day in America/New_York — see special_event_ends().';
comment on column public.special_events.auto_closed_at is
  'Set by close_ended_special_events(). Non-null means the automation already closed this schedule and will not fire again until event_at/ends_at changes — which is what makes an admin''s explicit re-open final.';

alter table public.special_events
  drop constraint if exists special_events_ends_after_start;
alter table public.special_events
  add constraint special_events_ends_after_start
  check (ends_at is null or event_at is null or ends_at >= event_at);

-- The album ⇄ event link lives on the album: an album is *of* an event, and one
-- event can have several (VBS posts one per day). The gallery wizard owns it.
alter table public.gallery_albums
  add column if not exists special_event_id uuid
  references public.special_events(id) on delete set null;

create index if not exists idx_gallery_albums_special_event
  on public.gallery_albums (special_event_id);

-- ── 2. When is an event over? ───────────────────────────────────────────────
-- Single source of truth. Mirrored in js/lib/special-events.js — keep in step.

create or replace function public.special_event_ends(ends_at timestamptz, event_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(
    ends_at,
    case
      when event_at is null then null
      -- No explicit end → the event runs to the close of its own day, local time.
      else ((event_at at time zone 'America/New_York')::date + 1)::timestamp
             at time zone 'America/New_York'
    end
  );
$$;

grant execute on function public.special_event_ends(timestamptz, timestamptz) to authenticated, anon;

-- ── 3. The registration gate: the flag, and only the flag ───────────────────

drop policy if exists "event_reg_insert" on public.event_registrations;
create policy "event_reg_insert" on public.event_registrations
  for insert to authenticated, anon
  with check (exists (
    select 1
      from public.special_events se
     where se.id = event_registrations.event_id
       and se.registration_open = true
  ));

-- ── 4. Backfill: freeze today's effective state ─────────────────────────────
-- Dropping the date clause would otherwise silently re-open every past event
-- still flagged open. Close them explicitly instead — that is what the public
-- already experiences — and mark the automation as spent so a deliberate
-- re-open sticks.
--
-- EBS included: after applying this, open it in the admin, set "Fecha y hora de
-- término", and set the status back to Abierto. That re-open is now real.

update public.special_events
   set registration_open = false,
       status            = 'closed',
       auto_closed_at    = coalesce(auto_closed_at, now())
 where registration_open = true
   and event_at is not null
   and public.special_event_ends(ends_at, event_at) < now();

-- ── 5. Keep the flag honest ─────────────────────────────────────────────────

create or replace function public.close_ended_special_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.special_events
     set registration_open = false,
         status            = 'closed',
         auto_closed_at    = now()
   where registration_open = true
     and auto_closed_at is null
     and public.special_event_ends(ends_at, event_at) is not null
     and public.special_event_ends(ends_at, event_at) < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- security definer + writes: only the cron owner may run it.
revoke execute on function public.close_ended_special_events() from public, anon, authenticated;

-- ── 6. A new schedule re-arms the automation ────────────────────────────────

create or replace function public.special_events_rearm_auto_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Rescheduling the event starts a new lifecycle, so let the job close it
  -- again. Re-opening WITHOUT touching the dates leaves auto_closed_at set —
  -- that is precisely what makes an admin's explicit re-open final.
  if new.event_at is distinct from old.event_at
     or new.ends_at is distinct from old.ends_at then
    new.auto_closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_special_events_rearm_auto_close on public.special_events;
create trigger trg_special_events_rearm_auto_close
  before update on public.special_events
  for each row
  execute function public.special_events_rearm_auto_close();

-- ── 7. Schedule ─────────────────────────────────────────────────────────────
-- Every 15 min: close ends at worst 15 min late, which is the right side to err
-- on (a late close accepts a walk-up; an early one turns people away).

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning '[event lifecycle] pg_cron is NOT installed — nothing will auto-close and every open event stays open until closed by hand. Enable it under Database → Extensions, then re-run this migration.';
    return;
  end if;

  perform cron.schedule(
    'special-events-auto-close',
    '*/15 * * * *',
    $cron$select public.close_ended_special_events();$cron$
  );
  raise notice '[event lifecycle] scheduled special-events-auto-close (every 15 min).';
end $$;
