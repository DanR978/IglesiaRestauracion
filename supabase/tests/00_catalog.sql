-- ============================================================================
-- 00_catalog.sql — structural guard for the aal2 layer and the developer tier
-- ============================================================================
-- Fails CI when a migration adds a public table (or a storage / realtime
-- command) without the RESTRICTIVE aal2 policies of
-- 20261019000001_enforce_mfa_and_tiers.sql. Fix a failure by giving the new
-- table its aal2_select / aal2_insert / aal2_update / aal2_delete policies
-- (re-running that file's layer block does it).
-- The gaps query is the catalog query of supabase/sql/preflight-auth.sql —
-- keep the two in step.
-- ============================================================================
begin;
select plan(19);

-- ── 1. Every public table has RLS and the whole layer ───────────────────────
select is_empty($$
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'every public table has row level security enabled');

select is_empty($$
  with
  layer(cmd) as (values ('select'), ('insert'), ('update'), ('delete')),
  -- every row of these three is public: their SELECT carries no aal2 layer
  open_read(relname) as (values ('events'), ('calendar_events'), ('special_events')),
  pub as (
    select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  need as (
    select 'public'::name as schemaname, p.relname as tablename, l.cmd
      from pub p cross join layer l
     where p.relrowsecurity
       and not (l.cmd = 'select' and p.relname in (select relname from open_read))
    union all
    select 'storage', 'objects', l.cmd from layer l where l.cmd <> 'select'
    union all
    select 'realtime', 'messages', l.cmd from layer l
     where l.cmd in ('select', 'insert') and to_regclass('realtime.messages') is not null
  ),
  tier(schemaname, tablename, policyname) as (values
    ('public'::name, 'app_settings'::name, 'tier_settings_insert'::name),
    ('public', 'app_settings', 'tier_settings_update'),
    ('public', 'app_settings', 'tier_settings_delete'),
    ('public', 'audit_log',    'tier_activity_select'),
    ('public', 'ministries',   'tier_ministries_insert'),
    ('public', 'ministries',   'tier_ministries_update'),
    ('public', 'ministries',   'tier_ministries_delete'),
    ('public', 'invitations',  'tier_users_select'),
    ('public', 'profiles',     'deny_client_insert'),
    ('public', 'profiles',     'deny_client_update'),
    ('public', 'profiles',     'deny_client_delete'),
    ('public', 'role_presets', 'deny_client_insert'),
    ('public', 'role_presets', 'deny_client_update'),
    ('public', 'role_presets', 'deny_client_delete'),
    ('public', 'invitations',  'deny_client_insert'),
    ('public', 'invitations',  'deny_client_update'),
    ('public', 'invitations',  'deny_client_delete'),
    ('storage', 'objects',     'event_images_tab_insert'),
    ('storage', 'objects',     'event_images_tab_update'),
    ('storage', 'objects',     'event_images_tab_delete')
  ),
  rpc(proname) as (values ('analytics_summary'), ('analytics_live'), ('list_designer_users'),
                          ('set_my_avatar'), ('set_my_display_name')),
  trg(relname, tgname) as (values ('profiles', 'trg_guard_last_developer'), ('profiles', 'trg_audit_access'),
                                  ('profiles', 'trg_audit_access_rows'), ('role_presets', 'trg_audit_access'))
  select 'public.' || p.relname as object, 'RLS disabled' as problem
    from pub p where not p.relrowsecurity
  union all
  select n.schemaname || '.' || n.tablename, 'missing aal2_' || n.cmd
    from need n
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = n.schemaname and p.tablename = n.tablename
        and p.policyname = 'aal2_' || n.cmd
        and p.permissive = 'RESTRICTIVE'
        and p.cmd = upper(n.cmd)
        and p.roles = '{authenticated}'::name[]
        and coalesce(p.qual, p.with_check) like '%is_aal2()%')
  union all
  select t.schemaname || '.' || t.tablename, 'missing ' || t.policyname
    from tier t
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = t.schemaname and p.tablename = t.tablename
        and p.policyname = t.policyname and p.permissive = 'RESTRICTIVE'
        and p.roles = '{authenticated}'::name[])
  union all
  select 'public.' || r.proname, 'no aal2 check'
    from rpc r
   where exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname = r.proname)
     and not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                      where s.nspname = 'public' and p.proname = r.proname and p.prosrc like '%is_aal2()%')
  union all
  select 'public.is_aal2', 'does not read the aal claim'
   where not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                      where s.nspname = 'public' and p.proname = 'is_aal2' and p.prosrc like '%''aal''%')
  union all
  select 'public.' || g.relname, 'missing or disabled trigger ' || g.tgname
    from trg g
   where not exists (select 1 from pg_trigger t
                      where t.tgrelid = ('public.' || g.relname)::regclass
                        and t.tgname = g.tgname and t.tgenabled <> 'D')
  order by 1, 2
$$, 'catalog: every public RLS table, storage write and Realtime message command has the aal2 layer; tiers, RPC checks and triggers are in place');

-- ── 2. Policy shape ─────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_policies
    where policyname like 'aal2\_%' and permissive <> 'RESTRICTIVE'),
  0, 'every aal2_* policy is RESTRICTIVE');
select is(
  (select count(*)::int from pg_policies
    where policyname like 'aal2\_%' and roles <> '{authenticated}'::name[]),
  0, 'every aal2_* policy applies to authenticated only (anon flows untouched)');
select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
$$, 'every SECURITY DEFINER function in public pins its search_path');

-- ── 3. is_aal2() reads the JWT ──────────────────────────────────────────────
set local request.jwt.claims = '';
select is(public.is_aal2(), false, 'is_aal2: no JWT → false');
set local request.jwt.claims = '{"role":"anon"}';
select is(public.is_aal2(), false, 'is_aal2: anon token → false');
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(public.is_aal2(), false, 'is_aal2: aal1 → false');
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"AAL2"}';
select is(public.is_aal2(), false, 'is_aal2: the claim is compared exactly');
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select is(public.is_aal2(), true, 'is_aal2: aal2 → true');
set local request.jwt.claims = '';

-- ── 4. Grants ───────────────────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.admin_revoke_user_sessions(uuid)', 'execute'), false,
          'admin_revoke_user_sessions: anon cannot execute');
select is(has_function_privilege('authenticated', 'public.admin_revoke_user_sessions(uuid)', 'execute'), false,
          'admin_revoke_user_sessions: authenticated cannot execute');
select is(has_function_privilege('service_role', 'public.admin_revoke_user_sessions(uuid)', 'execute'), true,
          'admin_revoke_user_sessions: service_role can execute');
select is(has_function_privilege('anon', 'public.account_has_system_tab(uuid, text)', 'execute'), false,
          'account_has_system_tab: anon cannot execute');
select is(has_function_privilege('authenticated', 'public.account_has_system_tab(uuid, text)', 'execute'), false,
          'account_has_system_tab: authenticated cannot probe other accounts');
select is(has_function_privilege('anon', 'public.has_system_tab(text)', 'execute'), false,
          'has_system_tab: anon cannot execute');
select is(has_function_privilege('authenticated', 'public.has_system_tab(text)', 'execute'), true,
          'has_system_tab: authenticated can execute (the tier policies call it)');
select is(has_function_privilege('anon', 'public.analytics_summary(timestamptz, timestamptz, text, text)', 'execute'), false,
          'analytics_summary: anon cannot execute');
select is(has_function_privilege('anon', 'public.analytics_live()', 'execute'), false,
          'analytics_live: anon cannot execute');

select * from finish();
rollback;
