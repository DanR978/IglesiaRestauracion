-- ============================================================================
-- 20260703_profile_avatar.sql — self-service profile photo (avatar)
-- ============================================================================
-- Run in the Supabase SQL Editor.
--
--   • profiles.avatar_url — public URL of the user's photo (null = use initials).
--   • set_my_avatar(url)  — the ONLY way a signed-in user changes their own
--     avatar. security definer so it never needs a broad "update own profile"
--     RLS policy (which would also let users change their own role). It touches
--     avatar_url of auth.uid() and nothing else.
--   • `avatars` storage bucket — public read; each user writes only inside their
--     own <uid>/ folder.
-- Idempotent.
-- ============================================================================

alter table public.profiles add column if not exists avatar_url text;

create or replace function public.set_my_avatar(p_url text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set avatar_url = nullif(btrim(coalesce(p_url, '')), '') where id = auth.uid();
$$;
grant execute on function public.set_my_avatar(text) to authenticated;

-- Public bucket for avatars.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Anyone may read an avatar; a user may create/replace/delete only files inside
-- their own <uid>/ folder.
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
