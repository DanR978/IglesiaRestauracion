-- ============================================================================
-- 20260630000003_drop_role_ministry_check.sql — retire "ministry_leader needs a
-- ministry" check constraints
-- ============================================================================
-- The old model required a ministry_leader to have a ministry_id, enforced by
-- check constraints (invitations_role_ministry_chk + a matching profiles one).
-- The new preset model leaves ministry_id NULL, so those constraints reject
-- valid invites. Drops any CHECK constraint on invitations/profiles that
-- references both role and ministry_id. Idempotent.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
      from pg_constraint
     where contype = 'c'
       and conrelid in ('public.invitations'::regclass, 'public.profiles'::regclass)
       and pg_get_constraintdef(oid) ilike '%ministry_id%'
       and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    raise notice 'dropped constraint % on %', r.conname, r.tbl;
  end loop;
end $$;
