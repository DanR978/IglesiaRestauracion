-- ============================================================================
-- 20261018000001_leaders_review_fixes.sql — pre-release review fixes (D-028)
-- ============================================================================
-- Run in the Supabase SQL Editor AFTER 20261017000001_leaders_directory.sql.
-- Idempotent.
--
--   • contact_email: a strict address shape. The first CHECK accepted URL
--     metacharacters (? & = % , #), so a stored 'pastor@x.org?bcc=…' rode
--     into every visitor's mailto: compose as extra header fields. Mirrors
--     EMAIL_RE in js/lib/leaders.js. Fails (and changes nothing) if an
--     already-stored address breaks the new shape — fix that row first.
--   • leaders_directory(): id breaks ties after sort_order, created_at. The
--     seed gave every row the same created_at, so a sort_order tie could order
--     the page differently from the admin tab.
-- ============================================================================

alter table public.leader_members drop constraint if exists leader_members_contact_email_check;
alter table public.leader_members add constraint leader_members_contact_email_check check (
  contact_email is null
  or (char_length(contact_email) <= 254
      and contact_email ~ '^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$')
);

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
        ) order by m.sort_order, m.created_at, m.id)
        from public.leader_members m
        where m.section_id = s.id
      ), '[]'::jsonb)
    ) order by s.sort_order, s.created_at, s.id), '[]'::jsonb)
  from public.leader_sections s;
$$;
grant execute on function public.leaders_directory() to anon, authenticated;
