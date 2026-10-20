-- ============================================================================
-- 01_aal1_and_public.sql — an aal1 session gets what anon gets, plus its own
-- profile; the public site keeps working for anon and for aal1 sessions.
-- ============================================================================
-- The developer is the most privileged account, so what it cannot reach at
-- aal1 no account can.
-- ============================================================================
begin;
\ir helpers/fixtures.psql
select plan(79);

-- ── 1. aal1: staff-only rows are invisible ──────────────────────────────────
:as_dev_aal1
select is((select count(*)::int from public.admin_notifications),   0, 'aal1: admin_notifications hidden');
select is((select count(*)::int from public.admins),                0, 'aal1: admins hidden');
select is((select count(*)::int from public.audit_log),             0, 'aal1: audit_log hidden');
select is((select count(*)::int from public.calendar_presets),      0, 'aal1: calendar_presets hidden');
select is((select count(*)::int from public.discipleship_interests), 0, 'aal1: discipleship_interests hidden');
select is((select count(*)::int from public.discipleship_members),  0, 'aal1: discipleship_members hidden');
select is((select count(*)::int from public.discipleship_messages), 0, 'aal1: discipleship_messages hidden');
select is((select count(*)::int from public.event_registrations),   0, 'aal1: event_registrations hidden');
select is((select count(*)::int from public.fin_expense_categories), 0, 'aal1: fin_expense_categories hidden');
select is((select count(*)::int from public.fin_expenses),          0, 'aal1: fin_expenses hidden');
select is((select count(*)::int from public.fin_funds),             0, 'aal1: fin_funds hidden');
select is((select count(*)::int from public.fin_income),            0, 'aal1: fin_income hidden');
select is((select count(*)::int from public.fin_income_categories), 0, 'aal1: fin_income_categories hidden');
select is((select count(*)::int from public.fin_notes),             0, 'aal1: fin_notes hidden');
select is((select count(*)::int from public.fin_payables),          0, 'aal1: fin_payables hidden');
select is((select count(*)::int from public.fin_projects),          0, 'aal1: fin_projects hidden');
select is((select count(*)::int from public.fin_receipts),          0, 'aal1: fin_receipts hidden');
select is((select count(*)::int from public.fin_recurring),         0, 'aal1: fin_recurring hidden');
select is((select count(*)::int from public.invitations),           0, 'aal1: invitations hidden');
select is((select count(*)::int from public.leader_members),        0, 'aal1: leader_members hidden');
select is((select count(*)::int from public.leader_sections),       0, 'aal1: leader_sections hidden');
select is((select count(*)::int from public.ministries),            0, 'aal1: ministries hidden');
select is((select count(*)::int from public.newsletter_dispatch_log), 0, 'aal1: newsletter_dispatch_log hidden');
select is((select count(*)::int from public.newsletter_subscribers), 0, 'aal1: newsletter_subscribers hidden');
select is((select count(*)::int from public.role_presets),          0, 'aal1: role_presets hidden');
select is((select count(*)::int from public.app_settings where key <> 'features'), 0, 'aal1: app_settings other than features hidden');
select is((select count(*)::int from public.profiles where id <> auth.uid()), 0, 'aal1: other profiles hidden');
select is((select count(*)::int from public.gallery_albums where not is_published), 0, 'aal1: unpublished albums hidden');
select is((select count(*)::int from public.gallery_photos), 1, 'aal1: only the photos of published albums');
select is((select count(*)::int from public.discipleship_groups where not is_published), 0, 'aal1: unlisted groups hidden');
:as_med_aal1
select is((select count(*)::int from public.designs), 0, 'aal1: a designer does not see their own design');
:as_lea_aal1
select is((select count(*)::int from public.design_shares), 0, 'aal1: design_shares hidden');
select is((select count(*)::int from public.fin_projects), 0, 'aal1: a leader does not see their own projects');

-- ── 2. aal1: every write is refused ─────────────────────────────────────────
:as_dev_aal1
select throws_ok($$ insert into public.fin_notes (body) values ('aal1') $$, '42501', null, 'aal1: insert fin_notes refused');
select throws_ok($$ insert into public.fin_income (source, amount) values ('aal1', 1) $$, '42501', null, 'aal1: insert fin_income refused');
select throws_ok($$ insert into public.events (title) values ('aal1') $$, '42501', null, 'aal1: insert events refused');
select throws_ok($$ insert into public.calendar_events (title, date) values ('aal1', current_date) $$, '42501', null, 'aal1: insert calendar_events refused');
select throws_ok($$ insert into public.special_events (title, slug) values ('aal1', 'aal1') $$, '42501', null, 'aal1: insert special_events refused');
select throws_ok($$ insert into public.gallery_albums (title, year) values ('aal1', 2026) $$, '42501', null, 'aal1: insert gallery_albums refused');
select throws_ok($$ insert into public.discipleship_groups (name, level) values ('aal1', 1) $$, '42501', null, 'aal1: insert discipleship_groups refused');
select throws_ok($$ insert into public.leader_sections (name) values ('aal1') $$, '42501', null, 'aal1: insert leader_sections refused');
select throws_ok($$ insert into public.ministries (name) values ('aal1') $$, '42501', null, 'aal1: insert ministries refused');
select throws_ok($$ insert into public.app_settings (key, value) values ('aal1', '{}') $$, '42501', null, 'aal1: insert app_settings refused');
select throws_ok($$ insert into public.designs (title, width, height) values ('aal1', 10, 10) $$, '42501', null, 'aal1: insert own design refused');
select is_empty($$ update public.events set title = 'aal1' returning id $$, 'aal1: update events touches nothing');
select is_empty($$ update public.calendar_events set title = 'aal1' returning id $$, 'aal1: update calendar_events touches nothing');
select is_empty($$ update public.special_events set title = 'aal1' returning id $$, 'aal1: update special_events touches nothing');
select is_empty($$ update public.gallery_albums set title = 'aal1' returning id $$, 'aal1: update gallery_albums touches nothing');
select is_empty($$ update public.app_settings set value = '{}' returning key $$, 'aal1: update app_settings (features) touches nothing');
select is_empty($$ update public.profiles set display_name = 'aal1' returning id $$, 'aal1: update own profile touches nothing');
select is_empty($$ delete from public.events returning id $$, 'aal1: delete events touches nothing');
select is_empty($$ delete from public.gallery_photos returning id $$, 'aal1: delete gallery_photos touches nothing');
select is_empty($$ delete from public.special_events returning id $$, 'aal1: delete special_events touches nothing');

-- ── 3. aal1: the public site still works ────────────────────────────────────
select is((select count(*)::int from public.events),          1, 'aal1: events readable');
select is((select count(*)::int from public.calendar_events), 1, 'aal1: calendar_events readable');
select is((select count(*)::int from public.special_events),  2, 'aal1: special_events readable');
select is((select count(*)::int from public.gallery_albums),  1, 'aal1: published albums readable');
select is((select count(*)::int from public.discipleship_groups), 1, 'aal1: published groups readable');
select is((select value ->> 'maintenance' from public.app_settings where key = 'features'), 'false',
          'aal1: the features flags are readable (maintenance overlay)');
select is((select count(*)::int from public.profiles where id = auth.uid()), 1, 'aal1: own profile readable');
select is(jsonb_array_length(public.leaders_directory()), 6, 'aal1: leaders_directory() works');
select lives_ok($$ insert into public.event_registrations (event_id, first_name, last_name, age, contact_name, relationship, contact_phone)
                   values ('c0000000-0000-4000-8000-000000000003', 'Luis', 'Fixture', 8, 'Padre Fixture', 'padre', '5550000001') $$,
                'aal1: register for an open event');
select throws_ok($$ insert into public.event_registrations (event_id, first_name, last_name, age, contact_name, relationship, contact_phone)
                    values ('c0000000-0000-4000-8000-000000000004', 'Luis', 'Fixture', 8, 'Padre Fixture', 'padre', '5550000001') $$,
                 '42501', null, 'aal1: register for a closed event refused (as for anon)');
select lives_ok($$ insert into public.discipleship_interests (full_name) values ('Fixture Público') $$,
                'aal1: discipleship interest form');
select throws_ok($$ insert into public.discipleship_interests (full_name) values ('  ') $$,
                 '42501', null, 'aal1: blank interest refused (as for anon)');

-- ── 4. anon: unchanged ──────────────────────────────────────────────────────
:as_anon
select is((select count(*)::int from public.events),          1, 'anon: events readable');
select is((select count(*)::int from public.calendar_events), 1, 'anon: calendar_events readable');
select is((select count(*)::int from public.special_events),  2, 'anon: special_events readable');
select is((select count(*)::int from public.gallery_albums),  1, 'anon: published albums readable');
select is((select count(*)::int from public.gallery_photos),  1, 'anon: published photos readable');
select is((select count(*)::int from public.discipleship_groups), 1, 'anon: published groups readable');
select is((select count(*)::int from public.app_settings), 1, 'anon: only the features row');
select is(jsonb_array_length(public.leaders_directory()), 6, 'anon: leaders_directory() works');
select lives_ok($$ insert into public.event_registrations (event_id, first_name, last_name, age, contact_name, relationship, contact_phone)
                   values ('c0000000-0000-4000-8000-000000000003', 'Eva', 'Fixture', 7, 'Madre Fixture', 'madre', '5550000002') $$,
                'anon: register for an open event');
select throws_ok($$ insert into public.event_registrations (event_id, first_name, last_name, age, contact_name, relationship, contact_phone)
                    values ('c0000000-0000-4000-8000-000000000004', 'Eva', 'Fixture', 7, 'Madre Fixture', 'madre', '5550000002') $$,
                 '42501', null, 'anon: register for a closed event refused');
select lives_ok($$ insert into public.discipleship_interests (full_name) values ('Fixture Anónimo') $$,
                'anon: discipleship interest form');
select lives_ok($$ insert into public.newsletter_subscribers (email) values ('anon@fixture.test') $$,
                'anon: its newsletter insert policy is untouched');
select is((select count(*)::int from public.event_registrations) + (select count(*)::int from public.discipleship_interests)
          + (select count(*)::int from public.profiles) + (select count(*)::int from public.invitations),
          0, 'anon: sign-ups, profiles and invitations stay unreadable');

:as_postgres
select is((select count(*)::int from public.event_registrations), 3, 'the aal1 and anon registrations were stored');

select * from finish();
rollback;
