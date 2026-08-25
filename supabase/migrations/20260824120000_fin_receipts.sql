-- ============================================================================
-- 20260824120000_fin_receipts.sql — treasury receipt images (S56b · D-018/D-019)
-- ============================================================================
-- Run in the Supabase SQL Editor, AFTER 20260701000001_fin_projects.sql and
-- 20260702000002_multi_ministry.sql (it uses public.is_finance(),
-- public.my_ministry_ids() and public.is_aal2(), all defined in the baseline).
-- Idempotent — safe to re-run.
--
-- WHAT THIS ADDS
--   • public.fin_receipts — one row per receipt photo. The MONTH lives in the
--     row, not in the storage path, so re-filing a receipt into another month is
--     a row update and never an object move.
--   • the PRIVATE `receipts` storage bucket + its storage.objects policies.
--     Exactly two WebP objects per row (main ≤1600px ~q0.8 + thumb 320px ~q0.7,
--     never upscaled — D-018).
--
-- THE BUCKET IS NEVER PUBLIC (D-018). Unlike `gallery` / `event-images` /
-- `avatars`, a receipt is a financial document: the client reads it with an
-- authenticated .download(), so no public URL and no long-lived signed URL ever
-- exists. If a future edit of this file ever sets `public = true`, that is a
-- security regression, not a convenience.
--
-- VISIBILITY (D-019 — ministry treasury data is ministry-SHARED, not owner-private)
--   scope='church'    → finance only (is_finance() = role admin | treasurer)
--   scope='ministry'  → finance OR every leader of that ministry
--   scope='project'   → the project's OWNER only — invisible even to finance,
--                       matching pp_fin_income_owner / pp_fin_expenses_owner.
--
-- MFA (D-010): every policy below calls public.is_aal2(). That helper is
-- currently a STUB whose body is literally `select true` (MIGRATION.md G-016),
-- so it enforces nothing today. It is wired in now so that when S39 replaces the
-- function body with a real `auth.jwt() ->> 'aal' = 'aal2'` check, every policy
-- here tightens automatically with no further migration. Never cite one of these
-- policies as evidence that MFA is enforced until S39 has landed.
--
-- Retention is a separate file: 20260824120200_receipts_cleanup_cron.sql.
-- ============================================================================

-- ── 1) Table ────────────────────────────────────────────────────────────────
create table if not exists public.fin_receipts (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('church','ministry','project')),
  ministry_id   uuid references public.ministries(id)   on delete cascade,
  project_id    uuid references public.fin_projects(id) on delete cascade,
  year          int  not null check (year between 2000 and 2100),
  month         int  not null check (month between 1 and 12),
  storage_path  text not null unique,     -- receipts bucket, main webp
  thumb_path    text not null unique,     -- receipts bucket, thumb webp
  file_size     int,
  original_name text,
  note          text,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint fin_receipts_scope_ids check (
    (scope = 'church'   and ministry_id is null     and project_id is null) or
    (scope = 'ministry' and ministry_id is not null and project_id is null) or
    (scope = 'project'  and project_id is not null  and ministry_id is null)),
  -- Bind BOTH paths to scope/ids/year. Without this the row year and the object
  -- folder can disagree, and since the cleanup worker reclaims objects by FOLDER
  -- year but deletes rows by COLUMN year, a live receipt loses its images with no
  -- error recorded. It also stops a row a leader may write from naming an object
  -- they may not read.
  constraint fin_receipts_path_scope check (
    storage_path like (case scope
        when 'church'   then 'church/'   || year::text
        when 'ministry' then 'ministry/' || ministry_id::text || '/' || year::text
        else                 'project/'  || project_id::text  || '/' || year::text
      end) || '/%'
    and thumb_path like (case scope
        when 'church'   then 'church/'   || year::text
        when 'ministry' then 'ministry/' || ministry_id::text || '/' || year::text
        else                 'project/'  || project_id::text  || '/' || year::text
      end) || '/%')
);

comment on table public.fin_receipts is
  'Treasury receipt photos, bucketed by calendar month within the D-018 retention window. Objects live in the PRIVATE `receipts` storage bucket; the month is a column, not a path segment.';

-- The month grid reads one scope + one year at a time.
create index if not exists fin_receipts_lookup_idx
  on public.fin_receipts (scope, ministry_id, project_id, year, month);
-- The retention worker sweeps by year alone.
create index if not exists fin_receipts_year_idx on public.fin_receipts (year);

-- ── 2) RLS ──────────────────────────────────────────────────────────────────
alter table public.fin_receipts enable row level security;

-- Financial documents: no anon surface at all. RLS already denies anon (it has
-- no policy here), but Supabase's default privileges grant the table to `anon`,
-- so revoke it too — defence in depth, and PostgREST then hides the table from
-- unauthenticated callers entirely.
revoke all on table public.fin_receipts from anon;
-- NO UPDATE (deliberate): permissive policies OR their USING and WITH CHECK
-- independently, so a granted UPDATE would let a leader satisfy USING via the
-- ministry policy on the OLD row and WITH CHECK via the project policy on the
-- NEW row — re-pointing a co-leader receipt into their own private project, and
-- likewise rewriting `year` (the only key retention uses) or `uploaded_by` (the
-- only provenance on a financial document), none of it audited. This is what
-- makes the "receipts are immutable" contract below TRUE of the table and not
-- only of storage.objects. When month re-filing ships, re-grant UPDATE together
-- with a before-update trigger that raises unless ONLY month/note changed.
grant select, insert, delete on table public.fin_receipts to authenticated;
grant all on table public.fin_receipts to service_role;

-- church: finance only.
drop policy if exists pp_fin_receipts_church on public.fin_receipts;
create policy pp_fin_receipts_church on public.fin_receipts for all to authenticated
  using      (scope = 'church' and public.is_aal2() and public.is_finance())
  with check (scope = 'church' and public.is_aal2() and public.is_finance());

-- ministry: every leader of that ministry, plus finance (D-019 — shared, not
-- owner-private; a receipt uploaded by leader B is visible to leader A).
drop policy if exists pp_fin_receipts_ministry on public.fin_receipts;
create policy pp_fin_receipts_ministry on public.fin_receipts for all to authenticated
  using      (scope = 'ministry' and public.is_aal2()
              and (public.is_finance() or ministry_id = any(public.my_ministry_ids())))
  with check (scope = 'ministry' and public.is_aal2()
              and (public.is_finance() or ministry_id = any(public.my_ministry_ids())));

-- project: OWNER ONLY — invisible even to finance.
drop policy if exists pp_fin_receipts_project on public.fin_receipts;
create policy pp_fin_receipts_project on public.fin_receipts for all to authenticated
  using      (scope = 'project' and public.is_aal2()
              and exists (select 1 from public.fin_projects fp
                          where fp.id = fin_receipts.project_id and fp.owner_id = auth.uid()))
  with check (scope = 'project' and public.is_aal2()
              and exists (select 1 from public.fin_projects fp
                          where fp.id = fin_receipts.project_id and fp.owner_id = auth.uid()));

-- ── 3) The private `receipts` bucket ────────────────────────────────────────
-- Path scheme (the YEAR folder is what the retention job sweeps; the month is a
-- column, never a folder):
--   church/<year>/<uuid>.webp                 + church/<year>/<uuid>-thumb.webp
--   ministry/<ministry_id>/<year>/<uuid>.webp + …-thumb.webp
--   project/<project_id>/<year>/<uuid>.webp   + …-thumb.webp
-- storage.objects serves every public image read on the live site, and this
-- file is applied by hand against prod. Each policy statement takes an
-- ACCESS EXCLUSIVE lock; if one ever queues behind another transaction, every
-- subsequent read queues behind the waiting DDL. Fail fast instead.
set local lock_timeout = '3s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 4) storage.objects policies ─────────────────────────────────────────────
-- SELECT — also what gates .download(), which is the ONLY way the client reads a
-- receipt (the bucket is private, so <img src=publicUrl> is impossible).
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_aal2() and (
       ((storage.foldername(name))[1] = 'church'   and public.is_finance())
    or ((storage.foldername(name))[1] = 'ministry' and (public.is_finance()
          or (storage.foldername(name))[2]::uuid = any(public.my_ministry_ids())))
    or ((storage.foldername(name))[1] = 'project'  and exists (select 1 from public.fin_projects fp
          where fp.id = (storage.foldername(name))[2]::uuid and fp.owner_id = auth.uid()))));

-- INSERT — the same scope test AND the path must be well-formed (folder depth +
-- a 4-digit year). THIS IS LOAD-BEARING: it is the only reason the `::uuid`
-- casts in the read/delete predicates above and below can never meet a malformed
-- object name. Never loosen the shape checks.
--   church:   depth 2, [2] ~ '^\d{4}$', is_finance()
--   ministry: depth 3, [3] ~ '^\d{4}$', uploader leads [2]::uuid OR is_finance()
--   project:  depth 3, [3] ~ '^\d{4}$', uploader OWNS project [2]::uuid
--             (finance may NOT write into someone's personal project)
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_aal2() and (
       ((storage.foldername(name))[1] = 'church'
          and array_length(storage.foldername(name), 1) = 2
          and (storage.foldername(name))[2] ~ '^\d{4}$'
          and (storage.foldername(name))[2] between (extract(year from now())::int - 3)::text
                                                and (extract(year from now())::int + 1)::text
          and public.is_finance())
    or ((storage.foldername(name))[1] = 'ministry'
          and array_length(storage.foldername(name), 1) = 3
          and (storage.foldername(name))[3] ~ '^\d{4}$'
          and (storage.foldername(name))[3] between (extract(year from now())::int - 3)::text
                                                and (extract(year from now())::int + 1)::text
          and ((storage.foldername(name))[2]::uuid = any(public.my_ministry_ids()) or public.is_finance()))
    or ((storage.foldername(name))[1] = 'project'
          and array_length(storage.foldername(name), 1) = 3
          and (storage.foldername(name))[3] ~ '^\d{4}$'
          and (storage.foldername(name))[3] between (extract(year from now())::int - 3)::text
                                                and (extract(year from now())::int + 1)::text
          and exists (select 1 from public.fin_projects fp
                where fp.id = (storage.foldername(name))[2]::uuid and fp.owner_id = auth.uid()))));

-- DELETE — the same predicates as SELECT: project stays owner-only, and the
-- church/ministry write scope is identical to INSERT's.
drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_aal2() and (
       ((storage.foldername(name))[1] = 'church'   and public.is_finance())
    or ((storage.foldername(name))[1] = 'ministry' and (public.is_finance()
          or (storage.foldername(name))[2]::uuid = any(public.my_ministry_ids())))
    or ((storage.foldername(name))[1] = 'project'  and exists (select 1 from public.fin_projects fp
          where fp.id = (storage.foldername(name))[2]::uuid and fp.owner_id = auth.uid()))));

-- NO UPDATE POLICY, deliberately: receipts are immutable (the client uploads
-- with upsert:false). Replacing one is delete + re-upload, which keeps the
-- storage object and its fin_receipts row in step.
drop policy if exists receipts_update on storage.objects;
