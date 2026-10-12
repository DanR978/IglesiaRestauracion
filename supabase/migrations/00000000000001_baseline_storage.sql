-- ============================================================================
-- BASELINE (storage) — S01. Captured from the live project on 2026-07-14.
-- ============================================================================
-- `supabase db dump --schema public` (00000000000000_baseline.sql) captures the
-- public schema only. The Storage half of the security boundary — who may read
-- and write objects in the `gallery`, `event-images`, `avatars` and
-- `design-assets` buckets — lived ONLY in the dashboard. It is reproduced here
-- verbatim so the whole RLS surface is reviewable in git (MIGRATION.md G-004).
--
-- This migration is a CAPTURE, not a change: every policy below is byte-for-byte
-- the live definition. Do not "improve" one here — an actual policy change is a
-- new, reviewed migration (hardening is S39).
--
-- Only the user-defined policies on storage.objects are committed. The storage
-- schema's own tables/functions/RLS flags are owned by the Storage service and
-- are recreated by the local stack; dumping them would fight it on `db reset`.
--
-- Buckets themselves are rows in storage.buckets (data, not schema) and are not
-- created here. A policy for a bucket that does not exist locally is inert, so
-- `db reset` stays clean either way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- event-images — public read; any authenticated user may upload/delete.
-- NOTE (audit finding, not fixed here): the two write policies are named
-- "Admins can …" but do NOT call is_admin() — ANY authenticated user can
-- upload to or delete from this bucket. Recorded as G-017; hardening is S39.
-- ---------------------------------------------------------------------------
drop policy if exists "Public can view event images" on storage.objects;
create policy "Public can view event images" on storage.objects
  for select using ((bucket_id = 'event-images'::text));

drop policy if exists "Admins can upload event images" on storage.objects;
create policy "Admins can upload event images" on storage.objects
  for insert to authenticated
  with check ((bucket_id = 'event-images'::text));

drop policy if exists "Admins can delete event images" on storage.objects;
create policy "Admins can delete event images" on storage.objects
  for delete to authenticated
  using ((bucket_id = 'event-images'::text));

-- ---------------------------------------------------------------------------
-- gallery — public read; writes require admin AND an aal2 (MFA) session.
-- ---------------------------------------------------------------------------
drop policy if exists "Gallery public read" on storage.objects;
create policy "Gallery public read" on storage.objects
  for select to authenticated, anon
  using ((bucket_id = 'gallery'::text));

drop policy if exists "Gallery staff insert" on storage.objects;
create policy "Gallery staff insert" on storage.objects
  for insert to authenticated
  with check (((bucket_id = 'gallery'::text) and public.is_admin() and public.is_aal2()));

drop policy if exists "Gallery staff update" on storage.objects;
create policy "Gallery staff update" on storage.objects
  for update to authenticated
  using (((bucket_id = 'gallery'::text) and public.is_admin() and public.is_aal2()));

drop policy if exists "Gallery staff delete" on storage.objects;
create policy "Gallery staff delete" on storage.objects
  for delete to authenticated
  using (((bucket_id = 'gallery'::text) and public.is_admin() and public.is_aal2()));

-- ---------------------------------------------------------------------------
-- avatars — public read; a user may only write inside a folder named for their
-- own auth.uid().
-- ---------------------------------------------------------------------------
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using ((bucket_id = 'avatars'::text));

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (((bucket_id = 'avatars'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (((bucket_id = 'avatars'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)))
  with check (((bucket_id = 'avatars'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (((bucket_id = 'avatars'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ---------------------------------------------------------------------------
-- design-assets — public read; own-folder writes. These carry no `to` clause in
-- the live definition, so they are evaluated for anon too; the auth.uid() test
-- is what actually denies anon (auth.uid() is null → no folder matches).
-- Reproduced as-is; tightening the role list is S39, not this session.
-- ---------------------------------------------------------------------------
drop policy if exists "design_assets_read" on storage.objects;
create policy "design_assets_read" on storage.objects
  for select using ((bucket_id = 'design-assets'::text));

drop policy if exists "design_assets_insert" on storage.objects;
create policy "design_assets_insert" on storage.objects
  for insert
  with check (((bucket_id = 'design-assets'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists "design_assets_update" on storage.objects;
create policy "design_assets_update" on storage.objects
  for update
  using (((bucket_id = 'design-assets'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists "design_assets_delete" on storage.objects;
create policy "design_assets_delete" on storage.objects
  for delete
  using (((bucket_id = 'design-assets'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)));
