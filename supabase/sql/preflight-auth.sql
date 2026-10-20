-- ============================================================================
-- preflight-auth.sql — read-only checks for 20261019000001_enforce_mfa_and_tiers.sql
-- ============================================================================
-- Run in the Supabase SQL Editor, one statement at a time (each is a SELECT;
-- nothing here changes data):
--   • before the migration — step 0 of the rollout runbook: what is pending,
--     who has a second factor, who would be affected;
--   • after it, and after every later migration — query 9 must return zero rows.
-- ============================================================================

-- 1) is_aal2(). Before the migration its body is `select true` (MFA not
--    enforced by the database); after it, it reads the JWT `aal` claim.
select pg_get_functiondef('public.is_aal2()'::regprocedure) as is_aal2_definition;

-- 2) Which known migration files are applied (true = applied). Apply every
--    pending one BEFORE 20261019000001, or re-run 20261019000001 after it.
--    The cron job also needs the Vault secrets, so false there can mean "file
--    applied but nothing scheduled" (the file raised a notice); null = no pg_cron.
select
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'app_settings'
             and policyname = 'app_settings_public_features')              as "20260630000005_public_feature_flags",
  to_regclass('public.fin_receipts') is not null                             as "20260824120000_fin_receipts",
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'fin_projects'
             and policyname = 'pp_fin_projects_scope')                     as "20260824120100_fin_ministry_shared",
  case when to_regclass('cron.job') is null then null
       else (xpath('/row/n/text()', query_to_xml(
              'select count(*) as n from cron.job where jobname = ''receipts-cleanup-annual''',
              false, true, '')))[1]::text::int > 0
  end                                                                        as "20260824120200_receipts_cleanup_cron",
  to_regclass('public.analytics_events') is not null                         as "20261012_site_analytics",
  to_regclass('public.leader_sections') is not null                          as "20261017000001_leaders_directory",
  exists (select 1 from pg_constraint
           where conname = 'leader_members_contact_email_check'
             and pg_get_constraintdef(oid) like '%[A-Za-z0-9._+-]+@%')       as "20261018000001_leaders_review_fixes",
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'profiles'
             and policyname = 'aal2_select')                                 as "20261019000001_enforce_mfa_and_tiers";

-- 3) TOTP enroll/verify cannot be read from SQL (it is GoTrue configuration,
--    not a table). Check it in the dashboard — Authentication → Multi-Factor:
--    "TOTP (App Authenticator)" enabled — or in the dry run of
--    supabase/apply-auth-email.mjs. It must be ON before the legacy MFA gate
--    ships, or no one can enroll or pass a challenge.

-- 4) Developers (the tier the migration protects): each verified factor and
--    the last challenge it passed. A factor never challenged since it was
--    enrolled may live on a lost phone — have that person sign in and pass a
--    challenge before the cutoff.
select u.email,
       p.display_name,
       u.email_confirmed_at is not null                                    as confirmed,
       u.banned_until,
       u.last_sign_in_at,
       f.factor_type,
       f.friendly_name,
       f.created_at                                                        as factor_created_at,
       (select max(c.verified_at) from auth.mfa_challenges c where c.factor_id = f.id)
                                                                           as last_verified_challenge
  from public.profiles p
  join auth.users u on u.id = p.id
  left join auth.mfa_factors f on f.user_id = u.id and f.status = 'verified'
 where p.role = 'admin' and p.allowed_tabs @> array['users']
 order by u.email, f.created_at;

-- 5) Accounts with NO verified factor, by role. After the migration every one
--    of them reads only public data until it enrolls. Pending invitations
--    (confirmed = false) enroll when they accept.
select p.role,
       u.email_confirmed_at is not null                    as confirmed,
       count(*)                                            as accounts,
       string_agg(u.email, ', ' order by u.email)          as emails
  from public.profiles p
  join auth.users u on u.id = p.id
 where not exists (select 1 from auth.mfa_factors f
                    where f.user_id = u.id and f.status = 'verified')
 group by p.role, u.email_confirmed_at is not null
 order by p.role, confirmed desc;

-- 6) Administrador holders (role admin WITHOUT the Usuarios tab). After the
--    migration they no longer change Configuración or Ministerios and no longer
--    read Actividad — confirm each is meant to be an Administrador, not a
--    Desarrollador.
select u.email, p.display_name, p.allowed_tabs, rp.name as preset
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.role_presets rp on rp.id = p.preset_id
 where p.role = 'admin' and not (p.allowed_tabs @> array['users'])
 order by u.email;

-- 7) pause_invites (Configuración → Pausar invitaciones). Null = never set.
select (select (value ->> 'pause_invites')::boolean
          from public.app_settings where key = 'features') as pause_invites;

-- 8) Active developers: admin + Usuarios tab on a confirmed, non-banned
--    account (the migration's predicate). Keep at least 2 who have passed the
--    new MFA gate before applying.
select count(*) as active_developers
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.role = 'admin' and p.allowed_tabs @> array['users']
   and u.email_confirmed_at is not null
   and (u.banned_until is null or u.banned_until <= now())
   and u.deleted_at is null;

-- 8b) Stored avatar URLs the migration clears (any value that is not a public
--     URL in the account's own folder of this project's avatars bucket). Zero
--     after it. Mirrors avatar_url_is_valid(), which doesn't exist before it.
select p.id, u.email, p.avatar_url
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.avatar_url is not null
   and not coalesce(char_length(p.avatar_url) <= 500
                    and p.avatar_url ~ ('^(https://snqwxgyhfiinouewxgiy\.supabase\.co'
                                        || '|http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?)'
                                        || '/storage/v1/object/public/avatars/'
                                        || p.id::text || '/[A-Za-z0-9._-]+$'), false);

-- 9) CATALOG — what lacks the server-side enforcement. Before the migration it
--    lists everything; after it (and after every later migration) it must
--    return ZERO rows. A row names the object and what it is missing: re-run
--    20261019000001 (a new table picks up the layer), re-enable a disabled
--    trigger, or re-run it after an older file re-created an RPC.
--    Kept in step with supabase/tests/00_catalog.sql.
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
order by 1, 2;
