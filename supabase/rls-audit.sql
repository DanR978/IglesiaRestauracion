-- ============================================================================
-- RLS AUDIT — read-only diagnostic. Run in the Supabase SQL Editor.
-- ============================================================================
-- This makes NO changes. It inventories the live security posture so the
-- foundational policies (which currently are NOT version-controlled — see
-- README.md) can be reviewed and then committed as a baseline migration.
--
-- Pay special attention to:
--   • Any public table with rowsecurity = false  → unprotected, fix first.
--   • public.discipleship_interests              → anon should be INSERT-only,
--                                                   NO SELECT (it holds PII).
--   • public.events / gallery_*                  → public SELECT should be
--                                                   scoped to published rows.
-- ============================================================================

-- 1) Which tables have RLS enabled?  (anything `false` is wide open)
select n.nspname            as schema,
       c.relname            as table,
       c.relrowsecurity     as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;

-- 2) Every policy, with its command, roles and USING / WITH CHECK expressions.
select schemaname              as schema,
       tablename               as table,
       policyname              as policy,
       cmd                     as command,        -- SELECT / INSERT / UPDATE / DELETE / ALL
       roles                   as roles,          -- {anon}, {authenticated}, ...
       qual                    as using_expr,     -- row visibility / match
       with_check              as with_check_expr -- write constraint
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3) Tables that have RLS ON but ZERO policies (RLS-on + no policy = deny-all;
--    usually a mistake — the table is silently inaccessible).
select c.relname as table_with_rls_but_no_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;

-- 4) Helper functions the policies depend on (is_admin, can_finance, etc.) —
--    confirm they exist and are SECURITY DEFINER where expected.
select p.proname            as function,
       p.prosecdef          as security_definer,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'can_finance', 'my_ministry_id', 'current_role_name')
order by p.proname;
