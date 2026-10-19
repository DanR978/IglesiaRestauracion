-- ============================================================================
-- 05_triggers.sql — the last-developer guard and the access-change audit
-- ============================================================================
-- Writes here run as postgres (the SQL Editor / service paths), which bypass
-- RLS: the triggers are the only thing being tested. GoTrue's admin delete is
-- reproduced by pg_temp.gotrue_delete_user() — as supabase_auth_admin with
-- search_path auth when the session may take that role (see helpers/fixtures.psql).
-- ============================================================================
begin;
\ir helpers/fixtures.psql
select plan(28);

\set dv2_id 'a0000000-0000-4000-8000-000000000008'
\set last_dev_msg 'Debe quedar al menos un usuario con acceso de desarrollador.'

-- ── 1. One developer: it cannot be demoted or deleted ───────────────────────
select throws_ok(format($$ update public.profiles set allowed_tabs = '{settings}' where id = %L $$, :'dev_id'),
                 'P0001', :'last_dev_msg', 'the only developer cannot lose the users tab');
select throws_ok(format($$ update public.profiles set role = 'treasurer' where id = %L $$, :'dev_id'),
                 'P0001', :'last_dev_msg', 'the only developer cannot lose the admin role');
select throws_ok(format($$ delete from public.profiles where id = %L $$, :'dev_id'),
                 'P0001', :'last_dev_msg', 'the only developer''s profile cannot be deleted');
select throws_ok(format('select pg_temp.gotrue_delete_user(%L)', :'dev_id'),
                 'P0001', :'last_dev_msg', 'deleting the only developer through auth.users (GoTrue path) is refused');
select lives_ok(format($$ update public.profiles set display_name = 'Otro Nombre' where id = %L $$, :'dev_id'),
                'other changes to the only developer go through');
select lives_ok(format($$ update public.profiles set allowed_tabs = '{users,ministries,activity,settings}' where id = %L $$, :'dev_id'),
                'reordering the grant keeps the developer');

-- ── 2. A pending invitation is not a developer ──────────────────────────────
select lives_ok(format($$ update public.profiles set allowed_tabs = '{}' where id = %L $$, :'pen_id'),
                'a pending invitation with the developer grant can be re-scoped');
select lives_ok(format($$ update public.profiles set allowed_tabs = '{ministries,users,activity,settings}' where id = %L $$, :'pen_id'),
                '… and given it back');
select lives_ok(format('select pg_temp.gotrue_delete_user(%L)', :'pen_id'),
                'revoking/resending (GoTrue delete of the pending account) works while a developer remains');
select is((select count(*)::int from public.profiles where id = :'pen_id'), 0, 'the pending profile went with it');

-- ── 3. A banned developer does not count ────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, banned_until, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', :'dv2_id', 'authenticated', 'authenticated', 'dv2@fixture.test',
        now(), now() + interval '1 day', now(), now(), '{}', '{}');
insert into public.profiles (id, display_name, role, allowed_tabs)
values (:'dv2_id', 'Fixture Dev Dos', 'admin', '{ministries,users,activity,settings}');
select throws_ok(format($$ update public.profiles set role = 'ministry_leader', allowed_tabs = '{}' where id = %L $$, :'dev_id'),
                 'P0001', :'last_dev_msg', 'a banned second developer does not let the first one go');

-- ── 4. Two developers: one can go, then the other is the last ───────────────
update auth.users set banned_until = null where id = :'dv2_id';
select lives_ok(format($$ update public.profiles set role = 'ministry_leader', allowed_tabs = '{}' where id = %L $$, :'dev_id'),
                'with two developers, one can be demoted');
select throws_ok(format($$ update public.profiles set allowed_tabs = '{}' where id = %L $$, :'dv2_id'),
                 'P0001', :'last_dev_msg', '… and then the other is the last one');
select lives_ok(format($$ update public.profiles set role = 'admin', allowed_tabs = '{ministries,users,activity,settings}' where id = %L $$, :'dev_id'),
                'promoting is never blocked');
select lives_ok(format('select pg_temp.gotrue_delete_user(%L)', :'dv2_id'),
                'with two developers, one can be deleted through auth.users');
select throws_ok(format($$ update public.profiles set allowed_tabs = '{}' where id = %L $$, :'dev_id'),
                 'P0001', :'last_dev_msg', 'the remaining developer is protected again');

-- ── 5. Preset propagation (one statement over many rows) ────────────────────
select throws_ok($$ update public.profiles set allowed_tabs = '{}' where role = 'admin' $$,
                 'P0001', :'last_dev_msg', 'a bulk demotion of every developer is refused');

-- ── 6. Audit of access changes ──────────────────────────────────────────────
\set audited '(select count(*)::int from public.audit_log where entity in (''profiles'', ''role_presets''))'
select is((select count(*)::int from public.audit_log
            where entity = 'profiles' and action = 'INSERT'
              and entity_id in (:'dev_id', :'adm_id', :'tre_id', :'lea_id', :'med_id', :'non_id', :'pen_id')),
          7, 'creating the fixture profiles (SQL Editor path) was audited');
select :audited as n0 \gset
update public.profiles set display_name = 'Solo Nombre' where id = :'adm_id';
select is(:audited, :n0, 'a display-name change is not an access change');
update public.profiles set allowed_tabs = '{settings}' where id = :'adm_id';
select is(:audited, :n0 + 1, 'an access change by the SQL Editor is audited');
select results_eq(
  format($$ select actor_name, action, label from public.audit_log
             where entity = 'profiles' and action = 'UPDATE' and entity_id = %L $$, :'adm_id'),
  $$ values ('Sistema'::text, 'UPDATE'::text, 'Solo Nombre · rol: admin · páginas: settings'::text) $$,
  'the row names the account and its new access');
:as_service
update public.profiles set allowed_tabs = '{}' where id = :'adm_id';
insert into public.role_presets (name, slug, base_role) values ('Servicio', 'servicio', 'ministry_leader');
:as_postgres
select is(:audited, :n0 + 1, 'service-role changes are left to admin-invite''s own rows');
insert into public.role_presets (name, slug, base_role, allowed_tabs) values ('Editor', 'editor', 'ministry_leader', '{galeria}');
select is(:audited, :n0 + 2, 'a role_presets change by the SQL Editor is audited');
select is((select label from public.audit_log where entity = 'role_presets' and action = 'INSERT'),
          'Editor · rol: ministry_leader · páginas: galeria', 'the preset row names it and its access');
delete from public.profiles where id = :'non_id';
select is(:audited, :n0 + 3, 'deleting a profile outside admin-invite is audited');

-- ── 7. GoTrue's own role ────────────────────────────────────────────────────
\if :gotrue_role
select pass('the GoTrue-path deletes above ran as supabase_auth_admin with search_path auth');
select lives_ok(format('select pg_temp.gotrue_delete_user(%L)', :'tre_id'), 'GoTrue deletes a non-developer account');
select is(:audited, :n0 + 3, 'a cascade inside GoTrue is left to admin-invite''s own rows');
\else
select skip('this session may not take supabase_auth_admin (db.yml grants it on the CI stack)', 3);
\endif

select * from finish();
rollback;
