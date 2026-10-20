-- ============================================================================
-- 03_tiers.sql — the developer tier on the system surfaces, and no client
-- writes on the account tables
-- ============================================================================
begin;
\ir helpers/fixtures.psql
select plan(45);

-- ── 1. The predicate ────────────────────────────────────────────────────────
:as_dev_aal2
select is(public.is_developer(), true, 'developer at aal2 is a developer');
select is(public.has_system_tab('settings'), true, 'developer at aal2 holds settings');
select is(public.has_system_tab('treasury'), false, 'a system tab the profile lacks is not held');
:as_dev_aal1
select is(public.is_developer(), false, 'developer at aal1 is not');
:as_adm_aal2
select is(public.is_developer(), false, 'administrador is not a developer');
select is(public.has_system_tab('settings'), false, 'administrador holds no system tab (no admin short-circuit)');
:as_lea_aal2
select is(public.has_system_tab('upcoming'), false, 'an operational tab of a leader is not a system tab');
:as_pen_aal2
select is(public.is_developer(), false, 'an unconfirmed (invited) account is not a developer');
:as_postgres
update auth.users set banned_until = now() + interval '1 day' where id = :'dev_id';
:as_dev_aal2
select is(public.is_developer(), false, 'a banned account is not a developer');
:as_postgres
update auth.users set banned_until = now() - interval '1 day' where id = :'dev_id';
:as_dev_aal2
select is(public.is_developer(), true, 'an expired ban does not count');
:as_postgres
select is(public.account_has_system_tab(:'dev_id', 'users'), true, 'account_has_system_tab: the developer');
select is(public.account_has_system_tab(:'pen_id', 'users'), false, 'account_has_system_tab: a pending invitation');
select is(public.account_has_system_tab(:'adm_id', 'users'), false, 'account_has_system_tab: administrador');

-- ── 2. Administrador at aal2: no system surface ─────────────────────────────
:as_adm_aal2
select throws_ok($$ insert into public.app_settings (key, value) values ('tier', '{}') $$, '42501', null,
                 'administrador: cannot add app_settings');
select is_empty($$ update public.app_settings set value = '{}' returning key $$, 'administrador: cannot change app_settings');
select is_empty($$ delete from public.app_settings returning key $$, 'administrador: cannot delete app_settings');
select is((select count(*)::int from public.app_settings), 2, 'administrador: still reads app_settings');
select is((select count(*)::int from public.audit_log), 0, 'administrador: cannot read audit_log');
select throws_ok($$ insert into public.ministries (name) values ('Tier') $$, '42501', null, 'administrador: cannot add ministries');
select is_empty($$ update public.ministries set color = '#000000' returning id $$, 'administrador: cannot change ministries');
select is_empty($$ delete from public.ministries returning id $$, 'administrador: cannot delete ministries');
select is((select count(*)::int from public.invitations), 0, 'administrador: cannot read invitations');

-- ── 3. Developer at aal2: every system surface ──────────────────────────────
:as_dev_aal2
select lives_ok($$ insert into public.app_settings (key, value) values ('tier', '{"on": true}') $$, 'developer: adds app_settings');
select isnt_empty($$ update public.app_settings set value = '{"on": false}' where key = 'tier' returning key $$,
                  'developer: changes app_settings');
select lives_ok($$ insert into public.app_settings (key, value) values ('features', '{"maintenance": true}')
                   on conflict (key) do update set value = excluded.value $$,
                'developer: the settings tab upsert works');
select isnt_empty($$ delete from public.app_settings where key = 'tier' returning key $$, 'developer: deletes app_settings');
select cmp_ok((select count(*)::int from public.audit_log), '>', 0, 'developer: reads audit_log');
select lives_ok($$ insert into public.ministries (name) values ('Tier') $$, 'developer: adds a ministry');
select isnt_empty($$ update public.ministries set color = '#123456' where name = 'Tier' returning id $$, 'developer: changes a ministry');
select isnt_empty($$ delete from public.ministries where name = 'Tier' returning id $$, 'developer: deletes a ministry');
select is((select count(*)::int from public.invitations), 1, 'developer: reads invitations');

-- ── 4. Nobody writes profiles / role_presets / invitations directly ─────────
select throws_ok($$ insert into public.profiles (id, display_name) values (gen_random_uuid(), 'x') $$, '42501', null,
                 'developer: cannot insert profiles');
select is_empty($$ update public.profiles set role = 'admin' returning id $$, 'developer: cannot update profiles');
select is_empty($$ delete from public.profiles where id <> auth.uid() returning id $$, 'developer: cannot delete profiles');
select throws_ok($$ insert into public.role_presets (name, slug, base_role) values ('x', 'x', 'admin') $$, '42501', null,
                 'developer: cannot insert role_presets');
select is_empty($$ update public.role_presets set allowed_tabs = '{users}' returning id $$, 'developer: cannot update role_presets');
select is_empty($$ delete from public.role_presets returning id $$, 'developer: cannot delete role_presets');
select throws_ok($$ insert into public.invitations (email) values ('x@fixture.test') $$, '42501', null,
                 'developer: cannot insert invitations');
select is_empty($$ update public.invitations set status = 'revoked' returning id $$, 'developer: cannot update invitations');
select is_empty($$ delete from public.invitations returning id $$, 'developer: cannot delete invitations');
:as_non_aal2
select is_empty($$ update public.profiles set role = 'admin', allowed_tabs = '{users}' returning id $$,
                'a leader cannot promote itself');

-- ── 5. Developer at aal1: no system surface ─────────────────────────────────
:as_dev_aal1
select throws_ok($$ insert into public.app_settings (key, value) values ('tier', '{}') $$, '42501', null,
                 'developer at aal1: cannot add app_settings');
select is((select count(*)::int from public.audit_log), 0, 'developer at aal1: cannot read audit_log');

:as_postgres
select is((select role from public.profiles where id = :'non_id'), 'ministry_leader', 'the leader is still a leader');
select is((select count(*)::int from public.role_presets), 4, 'role_presets unchanged');

select * from finish();
rollback;
