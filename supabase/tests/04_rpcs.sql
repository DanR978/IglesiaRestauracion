-- ============================================================================
-- 04_rpcs.sql — SECURITY DEFINER RPCs check aal2 themselves; set_my_avatar
-- stores only the caller's own avatar URL; admin_revoke_user_sessions()
-- ============================================================================
begin;
\ir helpers/fixtures.psql
select plan(39);

-- ── 1. Analytics ────────────────────────────────────────────────────────────
:as_dev_aal1
select throws_ok($$ select public.analytics_summary(now() - interval '7 days', now()) $$, '42501', null,
                 'analytics_summary refuses aal1');
select throws_ok($$ select public.analytics_live() $$, '42501', null, 'analytics_live refuses aal1');
:as_dev_aal2
select ok(public.analytics_summary(now() - interval '7 days', now()) ? 'totals', 'analytics_summary answers at aal2');
select ok(public.analytics_live() ? 'visitors', 'analytics_live answers at aal2');
:as_non_aal2
select throws_ok($$ select public.analytics_live() $$, '42501', null, 'analytics_live still needs the analytics tab');

-- ── 2. list_designer_users ──────────────────────────────────────────────────
:as_dev_aal1
select is_empty($$ select * from public.list_designer_users() $$, 'list_designer_users: nothing at aal1');
:as_dev_aal2
select isnt_empty($$ select * from public.list_designer_users() $$, 'list_designer_users: admin at aal2');
:as_med_aal2
select ok((select count(*) from public.list_designer_users() where id = 'a0000000-0000-4000-8000-000000000004') = 1,
          'list_designer_users: a special-events holder sees the other designers');
select is((select count(*)::int from public.list_designer_users() where id = 'a0000000-0000-4000-8000-000000000005'), 0,
          'list_designer_users: never lists the caller');
:as_tre_aal2
select is_empty($$ select * from public.list_designer_users() $$, 'list_designer_users: not for a non-designer');
:as_anon
select is_empty($$ select * from public.list_designer_users() $$, 'list_designer_users: not for anon');

-- ── 3. set_my_display_name ──────────────────────────────────────────────────
:as_dev_aal1
select throws_ok($$ select public.set_my_display_name('Nuevo Nombre') $$, '42501', null, 'set_my_display_name refuses aal1');
:as_dev_aal2
select is(public.set_my_display_name('  Nuevo Nombre  '), 'Nuevo Nombre', 'set_my_display_name works at aal2');
select throws_ok($$ select public.set_my_display_name('x') $$, 'P0001', 'El nombre debe tener al menos 2 caracteres.',
                 'set_my_display_name keeps its length rule');

-- ── 4. set_my_avatar ────────────────────────────────────────────────────────
:as_dev_aal1
select throws_ok(
  $$ select public.set_my_avatar('https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/avatar-1.jpg') $$,
  '42501', null, 'set_my_avatar refuses aal1');
:as_dev_aal2
select lives_ok(
  $$ select public.set_my_avatar('https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/avatar-1700000000000.jpg') $$,
  'set_my_avatar: an own-folder public avatars URL');
select is((select avatar_url from public.profiles where id = auth.uid()),
          'https://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/avatar-1700000000000.jpg',
          'set_my_avatar: stored');
select lives_ok(
  $$ select public.set_my_avatar('  http://127.0.0.1:54321/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/avatar-2.png  ') $$,
  'set_my_avatar: the local stack URL (trimmed)');
select is((select avatar_url from public.profiles where id = auth.uid()),
          'http://127.0.0.1:54321/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/avatar-2.png',
          'set_my_avatar: stored trimmed');
select throws_ok(
  $$ select public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a''b.png') $$,
  '22023', null, 'set_my_avatar: a quote in the file name');
select throws_ok(
  $$ select public.set_my_avatar('https://a''b(c).example/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a.png') $$,
  '22023', null, 'set_my_avatar: a host that is not a plain hostname');
select throws_ok(
  $$ select public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a.png)') $$,
  '22023', null, 'set_my_avatar: a trailing parenthesis');
select throws_ok(
  $$ select public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000002/a.png') $$,
  '22023', null, 'set_my_avatar: another user''s folder');
select throws_ok(
  $$ select public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/gallery/a0000000-0000-4000-8000-000000000001/a.png') $$,
  '22023', null, 'set_my_avatar: another bucket');
select throws_ok($$ select public.set_my_avatar('javascript:alert(1)') $$, '22023', null, 'set_my_avatar: not a URL');
select throws_ok(
  $$ select public.set_my_avatar('https://evil.example/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a.png') $$,
  '22023', null, 'set_my_avatar: an own-folder URL on another host');
select throws_ok(
  $$ select public.set_my_avatar('http://snqwxgyhfiinouewxgiy.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a.png') $$,
  '22023', null, 'set_my_avatar: the project host over plain http');
select throws_ok(
  $$ select public.set_my_avatar('https://snqwxgyhfiinouewxgiy.supabase.co.evil.example/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a.png') $$,
  '22023', null, 'set_my_avatar: a lookalike host');
select throws_ok(
  $$ select public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/a0000000-0000-4000-8000-000000000001/a.png?x=1') $$,
  '22023', null, 'set_my_avatar: a query string');
select lives_ok($$ select public.set_my_avatar(null) $$, 'set_my_avatar: NULL removes the photo');
select is((select avatar_url from public.profiles where id = auth.uid()), null, 'set_my_avatar: removed');
select lives_ok($$ select public.set_my_avatar('') $$, 'set_my_avatar: an empty string removes it too');

-- ── 5. avatar_url_is_valid (also clears stored values in the migration) ─────
:as_postgres
select is(public.avatar_url_is_valid(null, 'https://x.co/storage/v1/object/public/avatars/x/a.png'), false,
          'avatar_url_is_valid: no user');
select is(public.avatar_url_is_valid(:'dev_id', null), false, 'avatar_url_is_valid: no URL');

-- ── 6. admin_revoke_user_sessions ───────────────────────────────────────────
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('d0000000-0000-4000-8000-000000000001', :'dev_id', now(), now(), 'aal2'),
  ('d0000000-0000-4000-8000-000000000002', :'dev_id', now(), now(), 'aal1'),
  ('d0000000-0000-4000-8000-000000000003', :'adm_id', now(), now(), 'aal2');
insert into auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id) values
  ('00000000-0000-0000-0000-000000000000', 'fixture-token', :'dev_id', false, now(), now(), 'd0000000-0000-4000-8000-000000000001');
:as_dev_aal2
select throws_ok(format('select public.admin_revoke_user_sessions(%L)', :'adm_id'), '42501', null,
                 'admin_revoke_user_sessions: refused to an authenticated caller');
:as_service
select is(public.admin_revoke_user_sessions(:'dev_id'), 2, 'admin_revoke_user_sessions: deletes every session of the user');
:as_postgres
select is((select count(*)::int from auth.sessions where user_id = :'dev_id'), 0, 'the user has no session left');
select is((select count(*)::int from auth.refresh_tokens where token = 'fixture-token'), 0, 'its refresh tokens are gone');
select is((select count(*)::int from auth.sessions where user_id = :'adm_id'), 1, 'other users keep their sessions');

select * from finish();
rollback;
