-- ============================================================================
-- 20261017000001_leaders_directory.sql — admin-editable "Nuestros Líderes" page
-- ============================================================================
-- Run in the Supabase SQL Editor. Idempotent (MIGRATION.md D-028).
--
--   • leader_sections — one block on /lideres/ (Familia Pastoral, Ministerio de
--     Mujeres, …): name, icon, verse.
--   • leader_members  — one person card: name, role, photo, contact.
--   • leaders_directory() — the ONLY public read. anon has no table access; the
--     function returns public fields, and contact only for opted-in leaders.
--   • `leaders` storage bucket — public photo URLs; writes are admin-only.
--
-- Contact privacy: only a member flagged is_leader may opt in, and contact is
-- stored ONLY while opted in (turning it off clears it) — the table never
-- holds a phone/email that isn't meant to be published. Enforced by CHECKs,
-- not by the admin UI.
--
-- Seeds the roster once, only while leader_sections is empty.
-- ============================================================================

create table if not exists public.leader_sections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  icon        text not null default 'fa-church' check (icon ~ '^fa-[a-z0-9-]{1,40}$'),
  verse_text  text check (verse_text is null or char_length(verse_text) <= 500),
  verse_ref   text check (verse_ref  is null or char_length(verse_ref)  <= 60),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.leader_members (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references public.leader_sections(id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  role           text not null default '' check (char_length(role) <= 60),
  -- Object path inside the `leaders` bucket; the page derives the public URL,
  -- so a row can't point an <img> at an arbitrary host.
  photo_path     text check (photo_path is null
                   or (photo_path ~ '^[A-Za-z0-9_-][A-Za-z0-9/_.-]{0,199}$' and photo_path !~ '\.\.')),
  is_leader      boolean not null default false,
  contact_opt_in boolean not null default false,
  contact_email  text check (contact_email is null
                   or (char_length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')),
  contact_phone  text check (contact_phone is null or contact_phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint leader_members_contact_leader_only check (not contact_opt_in or is_leader),
  constraint leader_members_contact_consent     check (contact_opt_in or (contact_email is null and contact_phone is null)),
  constraint leader_members_contact_present     check (not contact_opt_in or contact_email is not null or contact_phone is not null)
);

create index if not exists leader_members_section_idx on public.leader_members (section_id, sort_order);

-- ── RLS: admins (aal2) manage both tables; nobody else reads them directly ──
alter table public.leader_sections enable row level security;
alter table public.leader_members  enable row level security;

revoke all on table public.leader_sections from anon;
revoke all on table public.leader_members  from anon;

drop policy if exists leader_sections_admin_all on public.leader_sections;
create policy leader_sections_admin_all on public.leader_sections
  for all to authenticated
  using (public.is_admin() and public.is_aal2())
  with check (public.is_admin() and public.is_aal2());

drop policy if exists leader_members_admin_all on public.leader_members;
create policy leader_members_admin_all on public.leader_members
  for all to authenticated
  using (public.is_admin() and public.is_aal2())
  with check (public.is_admin() and public.is_aal2());

-- ── Public read ─────────────────────────────────────────────────────────────
-- The contact CASE re-checks consent although the CHECKs already guarantee it:
-- this function is the publication boundary, so it states its own rule.
create or replace function public.leaders_directory()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',         s.id,
      'name',       s.name,
      'icon',       s.icon,
      'verse_text', s.verse_text,
      'verse_ref',  s.verse_ref,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',         m.id,
          'name',       m.name,
          'role',       m.role,
          'photo_path', m.photo_path,
          'email',      case when m.is_leader and m.contact_opt_in then m.contact_email end,
          'phone',      case when m.is_leader and m.contact_opt_in then m.contact_phone end
        ) order by m.sort_order, m.created_at)
        from public.leader_members m
        where m.section_id = s.id
      ), '[]'::jsonb)
    ) order by s.sort_order, s.created_at), '[]'::jsonb)
  from public.leader_sections s;
$$;
grant execute on function public.leaders_directory() to anon, authenticated;

-- ── Photos bucket ───────────────────────────────────────────────────────────
-- Public bucket: the page reads photos by public URL, which needs no SELECT
-- policy — so listing/reading through the API stays admin-only. The client
-- always re-encodes to a small JPEG; the bucket refuses anything else.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leaders', 'leaders', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists leaders_admin_select on storage.objects;
create policy leaders_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'leaders' and public.is_admin() and public.is_aal2());

drop policy if exists leaders_admin_insert on storage.objects;
create policy leaders_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leaders' and public.is_admin() and public.is_aal2());

drop policy if exists leaders_admin_update on storage.objects;
create policy leaders_admin_update on storage.objects for update to authenticated
  using      (bucket_id = 'leaders' and public.is_admin() and public.is_aal2())
  with check (bucket_id = 'leaders' and public.is_admin() and public.is_aal2());

drop policy if exists leaders_admin_delete on storage.objects;
create policy leaders_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'leaders' and public.is_admin() and public.is_aal2());

-- ── Seed (first apply only) ─────────────────────────────────────────────────
do $$
declare
  v_pastoral uuid; v_mujeres uuid; v_hombres uuid;
  v_ninos    uuid; v_jovenes uuid; v_evang   uuid;
begin
  if exists (select 1 from public.leader_sections) then
    raise notice 'leader_sections already has rows — seed skipped';
    return;
  end if;

  insert into public.leader_sections (name, icon, verse_text, verse_ref, sort_order) values
    ('Familia Pastoral', 'fa-hands-praying', 'Pero yo y mi casa serviremos a Jehová.', 'Josué 24:15', 0)
    returning id into v_pastoral;
  insert into public.leader_sections (name, icon, verse_text, verse_ref, sort_order) values
    ('Ministerio de Mujeres', 'fa-dove', 'Fuerza y honor son su vestidura, y se ríe de lo por venir.', 'Proverbios 31:25', 1)
    returning id into v_mujeres;
  insert into public.leader_sections (name, icon, verse_text, verse_ref, sort_order) values
    ('Ministerio de Hombres', 'fa-shield-halved', 'Esfuérzate y sé valiente; no temas, porque Jehová tu Dios estará contigo.', 'Josué 1:9', 2)
    returning id into v_hombres;
  insert into public.leader_sections (name, icon, verse_text, verse_ref, sort_order) values
    ('Ministerio de Niños', 'fa-child-reaching', 'Dejad a los niños venir a mí, porque de los tales es el reino de los cielos.', 'Mateo 19:14', 3)
    returning id into v_ninos;
  insert into public.leader_sections (name, icon, verse_text, verse_ref, sort_order) values
    ('Ministerio de Jóvenes', 'fa-fire', 'Ninguno tenga en poco tu juventud; sé ejemplo de los creyentes.', '1 Timoteo 4:12', 4)
    returning id into v_jovenes;
  insert into public.leader_sections (name, icon, verse_text, verse_ref, sort_order) values
    ('Ministerio de Evangelismo', 'fa-bullhorn', 'Id, y haced discípulos a todas las naciones.', 'Mateo 28:19', 5)
    returning id into v_evang;

  insert into public.leader_members (section_id, name, role, is_leader, sort_order) values
    (v_pastoral, 'Pastor Raúl García Guerra', 'Pastor principal', true,  0),
    (v_pastoral, 'Juana García',              'Pastora',          true,  1),
    (v_mujeres,  'Juana García',              'Líder',            true,  0),
    (v_hombres,  'Ernesto García',            'Líder',            true,  0),
    (v_ninos,    'Luz María Navarro',         'Líder',            true,  0),
    (v_ninos,    'Juan Reyes',                'Maestro',          false, 1),
    (v_ninos,    'Betania Girón',             'Maestra',          false, 2),
    (v_ninos,    'Flor Alfaro',               'Maestra',          false, 3),
    (v_ninos,    'Zulma Reyes',               'Maestra',          false, 4),
    (v_ninos,    'Karina Hernández',          'Maestra',          false, 5),
    (v_jovenes,  'Ashley Navarro-Ortiz',      'Maestra',          false, 0),
    (v_jovenes,  'Stephanie Adame',           'Maestra',          false, 1),
    (v_evang,    'Javier Farfán',             'Líder',            true,  0);
end $$;

-- ── Audit (after the seed, so the first apply doesn't log 19 "Sistema" rows) ─
create or replace trigger trg_audit after insert or update or delete on public.leader_sections
  for each row execute function public.audit_capture();
create or replace trigger trg_audit after insert or update or delete on public.leader_members
  for each row execute function public.audit_capture();
