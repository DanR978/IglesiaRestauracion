-- ============================================================================
-- 20261020_special_event_replaces_service.sql — a special event takes over its
-- day: the routine service scheduled that day is deleted automatically.
-- ============================================================================
-- Example: Noche de Caballeros / Noche de Damas lands on a Servicio de Oración
-- night. Only the special event should exist that day, so the prayer service
-- row is removed instead of both showing on the calendar.
--
-- "Special event"   = a row in public.events (Caballeros, Damas, Vigilia…).
-- "Routine service" = a public.calendar_events row whose category is one of
--                     servicio / estudio / oracion — the same REPETITIVE set the
--                     admin calendar uses (js/components/CalendarGrid.js).
-- "Same day"        = the event's starts_at in America/New_York, so an evening
--                     event is never shifted to the next day by UTC.
--
-- Enforced in the database so it holds for every writer (legacy admin wizard,
-- single/bulk forms, the new admin) without client changes:
--   1. Saving a special event (insert, or a date change) deletes the routine
--      services on its day.
--   2. Inserting a routine service on a day that already has a special event is
--      silently skipped — so "Crear todos" from a preset doesn't re-create the
--      service that step 1 removed. The rest of a bulk insert still goes in.
--   3. One-time cleanup of conflicts already on the calendar (today onward;
--      past days are left as history).
--
-- Deliberately NOT done: moving or deleting a special event does not restore
-- the service it replaced. Re-add it from the Calendario tab if needed.
--
-- Idempotent. Apply manually in the SQL editor (CI never touches the DB).
-- ============================================================================

-- ── 1. Special event saved → delete that day's routine services ─────────────
-- security definer: anyone allowed to save an event may displace the service on
-- its day, even without their own delete grant on calendar_events.
create or replace function public.special_event_replace_services()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.starts_at is null then
    return null;
  end if;

  delete from public.calendar_events
  where category in ('servicio', 'estudio', 'oracion')
    and date::date = (new.starts_at at time zone 'America/New_York')::date;

  return null;
end;
$$;

drop trigger if exists trg_special_event_replace_services on public.events;
create trigger trg_special_event_replace_services
  after insert or update of starts_at on public.events
  for each row execute function public.special_event_replace_services();

-- ── 2. Routine service inserted on a special-event day → skip it ────────────
create or replace function public.calendar_service_skip_special_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category in ('servicio', 'estudio', 'oracion')
     and exists (
       select 1 from public.events e
       where e.starts_at is not null
         and (e.starts_at at time zone 'America/New_York')::date = new.date::date
     ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calendar_service_skip_special_day on public.calendar_events;
create trigger trg_calendar_service_skip_special_day
  before insert on public.calendar_events
  for each row execute function public.calendar_service_skip_special_day();

-- ── 3. Clean up conflicts already on the calendar ───────────────────────────
delete from public.calendar_events ce
where ce.category in ('servicio', 'estudio', 'oracion')
  and ce.date::date >= (now() at time zone 'America/New_York')::date
  and exists (
    select 1 from public.events e
    where e.starts_at is not null
      and (e.starts_at at time zone 'America/New_York')::date = ce.date::date
  );
