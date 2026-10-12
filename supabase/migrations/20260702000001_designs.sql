-- ============================================================================
-- 20260702000001_designs.sql — "Diseñador" (Canva-style design editor) storage
-- ============================================================================
-- Run in the Supabase SQL Editor. Self-contained + idempotent (safe to re-run).
--
--   • designs        — one saved document (Fabric toJSON + doc meta) per row.
--   • design_shares  — owner grants specific users co-edit access.
--   • Access: PRIVATE by default. A design is visible/editable only to its owner
--     and users it was explicitly shared with; owner-only delete. Any signed-in
--     user may CREATE their own design (the Diseñador pill is hidden from non-
--     media staff on the client; the real boundary is ownership/privacy here).
--   • The designs policies test `created_by` directly (never a lookup back into
--     `designs`) so that INSERT … RETURNING works — see the long note above the
--     policies; getting this wrong is what makes every create fail with
--     "new row violates row-level security policy for table designs".
--   • design_shared_with_me / owns_design / can_edit_design — SECURITY DEFINER
--     helpers so the designs ⇄ design_shares checks bypass each other's RLS
--     (no recursion).
--
-- NOTE: this migration deliberately does NOT (re)define has_tab. Redefining an
-- existing function can fail on a parameter-name mismatch and abort the whole
-- script before the policies are created (= deny-all). Ownership is sufficient.
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.designs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null default 'Sin título',
  kind          text not null default 'flyer',
  width         int  not null,
  height        int  not null,
  doc           jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  event_id      uuid references public.special_events(id) on delete set null,
  created_by    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists designs_created_by_idx on public.designs(created_by);
create index if not exists designs_event_id_idx   on public.designs(event_id);
-- Guarantee the default even if the table pre-existed without it, so the insert
-- WITH CHECK (created_by = auth.uid()) can never mismatch when the client omits it.
alter table public.designs alter column created_by set default auth.uid();

create table if not exists public.design_shares (
  design_id  uuid not null references public.designs(id)  on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (design_id, user_id)
);
create index if not exists design_shares_user_idx on public.design_shares(user_id);

-- Bump updated_at, and pin created_by: ownership is immutable, so a co-editor
-- (who may UPDATE the row) can never rewrite created_by and steal the design.
create or replace function public.designs_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.created_by = old.created_by;
  return new;
end $$;
drop trigger if exists designs_touch on public.designs;
create trigger designs_touch before update on public.designs
  for each row execute function public.designs_touch_updated_at();

-- ── Access helpers (brand-new names → no collision, no recursion) ───────────
-- design_shared_with_me() only ever reads design_shares, never designs — it is
-- therefore safe to call from a policy ON designs (see the RETURNING note below).
create or replace function public.design_shared_with_me(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.design_shares where design_id = d and user_id = auth.uid());
$$;
create or replace function public.owns_design(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.designs where id = d and created_by = auth.uid());
$$;
create or replace function public.can_edit_design(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.owns_design(d) or public.design_shared_with_me(d);
$$;
grant execute on function public.design_shared_with_me(uuid) to authenticated;
grant execute on function public.owns_design(uuid)           to authenticated;
grant execute on function public.can_edit_design(uuid)       to authenticated;

-- ── RLS + policies (created up front so they can never be skipped) ──────────
alter table public.designs       enable row level security;
alter table public.design_shares enable row level security;

-- IMPORTANT — why the designs policies below compare `created_by` directly and
-- never call owns_design(id):
--   Postgres enforces the SELECT policy on `INSERT … RETURNING` (which is what
--   PostgREST issues for .insert().select()), and it does so as a check on the
--   PROPOSED row, before that row is inserted. A policy that looks the row back
--   up in `designs` (owns_design → select … from designs where id = d) finds
--   nothing — a command never sees its own not-yet-written rows — so it returns
--   false and every create fails with "new row violates row-level security
--   policy for table designs". Comparing the row's own created_by column has no
--   such problem. The co-edit branch reads design_shares (a DIFFERENT table, no
--   pending row), so it stays a SECURITY DEFINER call.
--   auth.uid() is wrapped in (select …) so the planner hoists it to an InitPlan
--   and evaluates it once per statement instead of once per row.
drop policy if exists designs_select on public.designs;
create policy designs_select on public.designs for select to authenticated
  using (created_by = (select auth.uid()) or public.design_shared_with_me(id));

drop policy if exists designs_insert on public.designs;
create policy designs_insert on public.designs for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists designs_update on public.designs;
create policy designs_update on public.designs for update to authenticated
  using      (created_by = (select auth.uid()) or public.design_shared_with_me(id))
  with check (created_by = (select auth.uid()) or public.design_shared_with_me(id));

drop policy if exists designs_delete on public.designs;
create policy designs_delete on public.designs for delete to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists design_shares_select on public.design_shares;
create policy design_shares_select on public.design_shares for select to authenticated
  using (public.owns_design(design_id) or user_id = auth.uid());

drop policy if exists design_shares_insert on public.design_shares;
create policy design_shares_insert on public.design_shares for insert to authenticated
  with check (public.owns_design(design_id) and added_by = auth.uid());

drop policy if exists design_shares_delete on public.design_shares;
create policy design_shares_delete on public.design_shares for delete to authenticated
  using (public.owns_design(design_id) or user_id = auth.uid());

-- ── Share picker (column-tolerant + wrapped: never aborts the migration) ────
do $ldu$
declare dn text := 'null::text'; av text := 'null::text';
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='display_name') then dn := 'p.display_name'; end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='avatar_url') then av := 'p.avatar_url'; end if;
  execute format($f$
    create or replace function public.list_designer_users()
    returns table (id uuid, display_name text, avatar_url text)
    language sql stable security definer set search_path = public as $body$
      select p.id, %s, %s
      from public.profiles p
      where auth.uid() is not null
        and (p.role = 'admin' or p.allowed_tabs @> array['special-events'])
        and p.id <> auth.uid()
    $body$;
  $f$, dn, av);
  execute 'grant execute on function public.list_designer_users() to authenticated';
exception when others then
  raise notice 'list_designer_users skipped: %', sqlerrm;
end $ldu$;

-- ── Storage: design-assets bucket (public read; own-folder writes) ──────────
insert into storage.buckets (id, name, public)
values ('design-assets', 'design-assets', true)
on conflict (id) do update set public = true;

drop policy if exists design_assets_read on storage.objects;
create policy design_assets_read on storage.objects for select
  using (bucket_id = 'design-assets');
drop policy if exists design_assets_insert on storage.objects;
create policy design_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'design-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists design_assets_update on storage.objects;
create policy design_assets_update on storage.objects for update to authenticated
  using      (bucket_id = 'design-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'design-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists design_assets_delete on storage.objects;
create policy design_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'design-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Realtime: list live-updates (broadcast needs no publication) ────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='designs') then
    execute 'alter publication supabase_realtime add table public.designs';
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='design_shares') then
    execute 'alter publication supabase_realtime add table public.design_shares';
  end if;
exception when others then
  raise notice 'realtime publication step skipped: %', sqlerrm;
end $$;

-- ── Realtime Authorization for the private co-edit channel design:<id> ──────
create or replace function public.can_join_design_topic(topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare did uuid;
begin
  if topic !~ '^design:[0-9a-fA-F-]{36}$' then return false; end if;
  did := substring(topic from 8)::uuid;
  return public.can_edit_design(did);
exception when others then return false;
end $$;
grant execute on function public.can_join_design_topic(text) to authenticated;

do $$
begin
  execute 'alter table realtime.messages enable row level security';
  execute 'drop policy if exists design_collab_read on realtime.messages';
  execute 'create policy design_collab_read on realtime.messages for select to authenticated using (public.can_join_design_topic(realtime.topic()))';
  execute 'drop policy if exists design_collab_write on realtime.messages';
  execute 'create policy design_collab_write on realtime.messages for insert to authenticated with check (public.can_join_design_topic(realtime.topic()))';
exception when others then
  raise notice 'Realtime Authorization policies skipped: %', sqlerrm;
end $$;
