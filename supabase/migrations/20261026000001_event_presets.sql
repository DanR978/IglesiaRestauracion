-- ============================================================================
-- 20261026000001_event_presets.sql — editable special-event presets
-- ============================================================================
-- Run in the Supabase SQL Editor as ONE paste. Idempotent — safe to re-run.
--
-- The special-event presets (Noche de Caballeros, Noche de Damas, Vigilia, …)
-- were a hardcoded list in js/pages/admin/event-form.js. They move here so the
-- admin can edit them, add new ones, and schedule one across many months.
--
--   • A preset holds every field the event forms have — title, categories
--     (tag, "A/B" like events.tag), description, location, image, start/end
--     time, organizer name/email — plus an optional rule:
--       none         no repeat
--       weekly       every day_of_week (0 = domingo … 6 = sábado)
--       lastWeekday  last day_of_week of the month (Caballeros: last Saturday)
--       nthWeekday   nth_week-th (1–5) day_of_week of the month
--     The admin turns a rule into dates (js/utils/recurrence.js) and inserts
--     plain public.events rows; nothing here schedules anything by itself.
--   • Access mirrors public.events (pp_events, 20260630000004): every Eventos
--     page reads the presets, Calendario / Próximos holders write them.
--   • Carries its own RESTRICTIVE aal2 layer (the shape of
--     20261019000001_enforce_mfa_and_tiers.sql), so that file does NOT need a
--     re-run for this table, and supabase/tests/00_catalog.sql stays green.
--   • Seeds the 12 former hardcoded presets once, only while the table is
--     empty. Caballeros starts as "last Saturday of the month". A rule or a
--     time already stored in calendar_presets (the old Preselección feature)
--     under the same name is carried over where the seed has none.
--   • calendar_presets itself is left untouched (no longer used by the admin).
--
-- The admin degrades gracefully before this runs: it shows "Personalizado"
-- only, plus a notice in the Presets panel.
-- ============================================================================

create table if not exists public.event_presets (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  tag             text check (tag is null or char_length(tag) <= 80),
  description     text check (description is null or char_length(description) <= 10000),
  location        text check (location is null or char_length(location) <= 200),
  image_url       text check (image_url is null
                    or (char_length(image_url) <= 1000 and image_url ~ '^https://')),
  start_time      time,
  end_time        time,
  organizer_name  text check (organizer_name is null or char_length(organizer_name) <= 120),
  organizer_email text check (organizer_email is null
                    or (char_length(organizer_email) <= 254
                        and organizer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')),
  pattern_type    text not null default 'none'
                    check (pattern_type in ('none', 'weekly', 'lastWeekday', 'nthWeekday')),
  day_of_week     smallint check (day_of_week between 0 and 6),
  nth_week        smallint check (nth_week between 1 and 5),
  sort_order      integer not null default 0,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint event_presets_rule_day check (pattern_type = 'none' or day_of_week is not null),
  constraint event_presets_rule_nth check ((pattern_type = 'nthWeekday') = (nth_week is not null))
);

-- The title is how an event is matched back to its preset (edit form) and how
-- "already scheduled that day" is detected, so it is unique case-insensitively.
create unique index if not exists event_presets_title_key
  on public.event_presets (lower(btrim(title)));

-- ── RLS: same audience as public.events ─────────────────────────────────────
alter table public.event_presets enable row level security;

revoke all on table public.event_presets from anon;
grant select, insert, update, delete on table public.event_presets to authenticated;

drop policy if exists event_presets_read on public.event_presets;
create policy event_presets_read on public.event_presets
  for select to authenticated
  using (public.has_any_tab(array['upcoming', 'calendario', 'special-events']));

drop policy if exists event_presets_write on public.event_presets;
create policy event_presets_write on public.event_presets
  for all to authenticated
  using (public.has_any_tab(array['upcoming', 'calendario']))
  with check (public.has_any_tab(array['upcoming', 'calendario']));

-- ── aal2 layer (RESTRICTIVE: ANDs with the policies above) ──────────────────
drop policy if exists aal2_select on public.event_presets;
create policy aal2_select on public.event_presets as restrictive for select to authenticated
  using ((select public.is_aal2()));

drop policy if exists aal2_insert on public.event_presets;
create policy aal2_insert on public.event_presets as restrictive for insert to authenticated
  with check ((select public.is_aal2()));

drop policy if exists aal2_update on public.event_presets;
create policy aal2_update on public.event_presets as restrictive for update to authenticated
  using ((select public.is_aal2())) with check ((select public.is_aal2()));

drop policy if exists aal2_delete on public.event_presets;
create policy aal2_delete on public.event_presets as restrictive for delete to authenticated
  using ((select public.is_aal2()));

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace trigger trg_event_presets_touch before update on public.event_presets
  for each row execute function public.touch_updated_at();

-- ── Seed (once) ─────────────────────────────────────────────────────────────
do $$
declare
  img constant text := 'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/event-images/';
  loc constant text := '2601 Clays Mill Road';
begin
  if exists (select 1 from public.event_presets) then
    raise notice 'event_presets already has rows — seed skipped';
    return;
  end if;

  insert into public.event_presets
    (title, tag, description, location, image_url, pattern_type, day_of_week, sort_order) values
    ('Noche de Caballeros', 'Servicio/Convivio',
     'Una noche de compañerismo entre hombres de fe. Tiempo de oración, estudio bíblico, comida y edificación mutua.',
     loc, img || 'caballeros.png', 'lastWeekday', 6, 0),
    ('Noche de Damas', 'Servicio/Convivio',
     'Una noche especial para las mujeres de la iglesia. Alabanza, oración, comunión y compañerismo.',
     loc, img || 'damas.png', 'none', null, 1),
    ('Vigilia', 'Servicio/Oración',
     'Una noche especial de oración, adoración y comunión. Habrá café, comida, alabanza y un tiempo inolvidable de fe.',
     loc, img || 'vigilia.png', 'none', null, 2),
    ('Devocional', 'Servicio/Oración',
     'Un tiempo dedicado a la reflexión bíblica, oración y crecimiento espiritual.',
     loc, img || 'devocional.png', 'none', null, 3),
    ('Noche de Jóvenes', 'Servicio/Convivio',
     'Una noche de comunión entre jóvenes. Palabra, comida y actividades.',
     loc, img || 'jovenes.png', 'none', null, 4),
    ('Día de las Madres', 'Celebración/Servicio',
     'Un servicio especial para honrar y celebrar a las madres de nuestra comunidad.',
     loc, img || 'madres.png', 'none', null, 5),
    ('Día del Padre', 'Celebración/Servicio',
     'Celebramos a los padres de nuestra iglesia con un servicio especial.',
     loc, img || 'padre.png', 'none', null, 6),
    ('Día del Niño', 'Celebración/Niños',
     'Celebración para los más pequeños. Juegos, actividades, comida y un mensaje especial.',
     loc, img || 'nino.png', 'none', null, 7),
    ('Thanksgiving', 'Celebración/Convivio',
     'Servicio de acción de gracias. Cena especial, alabanza y testimonios.',
     loc, img || 'thanksgivings.png', 'none', null, 8),
    ('Comida Navideña', 'Celebración/Convivio',
     'Celebramos el nacimiento de Cristo con cena, villancicos y compañerismo.',
     loc, img || 'cenanavidena.png', 'none', null, 9),
    ('Campaña Evangelística', 'Evangelismo/Servicio',
     'Servicios enfocados en compartir las buenas nuevas de Cristo con la comunidad.',
     loc, img || 'campanaEvangelistica.png', 'none', null, 10),
    ('Aniversario', 'Celebración/Servicio',
     'Celebración del aniversario de nuestra iglesia. Alabanza, testimonios y compañerismo.',
     loc, img || 'aniversario.png', 'none', null, 11);

  -- Carry over what the old Preselección presets already knew, matched by name.
  -- Only valid rules are copied, and only onto a preset without one; a time is
  -- copied only when it reads as "7:00 PM", so stray data can't fail this file.
  if to_regclass('public.calendar_presets') is not null then
    update public.event_presets ep
       set pattern_type = cp.pattern_type,
           day_of_week  = cp.day_of_week,
           nth_week     = case when cp.pattern_type = 'nthWeekday' then cp.nth_week end
      from public.calendar_presets cp
     where lower(btrim(cp.name)) = lower(btrim(ep.title))
       and ep.pattern_type = 'none'
       and cp.pattern_type in ('weekly', 'lastWeekday', 'nthWeekday')
       and cp.day_of_week between 0 and 6
       and (cp.pattern_type <> 'nthWeekday' or cp.nth_week between 1 and 5);

    update public.event_presets ep
       set start_time = make_time(t.m[1]::int % 12 + case when upper(t.m[3]) = 'PM' then 12 else 0 end,
                                  t.m[2]::int, 0)
      from public.calendar_presets cp
     cross join lateral (
       select regexp_match(cp.time, '^\s*(0?[1-9]|1[0-2]):([0-5][0-9])\s*([AaPp][Mm])\s*$') as m
     ) t
     where lower(btrim(cp.name)) = lower(btrim(ep.title))
       and ep.start_time is null
       and t.m is not null;
  end if;
end $$;

-- ── Audit (after the seed, so the first apply doesn't log 12 "Sistema" rows) ─
create or replace trigger trg_audit after insert or update or delete on public.event_presets
  for each row execute function public.audit_capture();
