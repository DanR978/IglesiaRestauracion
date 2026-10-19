-- ============================================================================
-- 02_aal2_roles.sql — at aal2 every role keeps exactly the access it had
-- ============================================================================
-- The aal2 layer only ANDs a session check onto the existing policies, so an
-- aal2 session of each role must see and change what it did before.
-- ============================================================================
begin;
\ir helpers/fixtures.psql
select plan(62);

-- ── Desarrollador ───────────────────────────────────────────────────────────
:as_dev_aal2
select cmp_ok((select count(*)::int from public.admin_notifications), '>', 0, 'developer: admin_notifications');
select cmp_ok((select count(*)::int from public.audit_log), '>', 0, 'developer: audit_log');
select is((select count(*)::int from public.discipleship_interests), 1, 'developer: discipleship_interests');
select is((select count(*)::int from public.discipleship_members), 1, 'developer: discipleship_members');
select is((select count(*)::int from public.event_registrations), 1, 'developer: event_registrations');
select is((select count(*)::int from public.fin_income), 1, 'developer: fin_income');
select is((select count(*)::int from public.fin_receipts), 1, 'developer: fin_receipts (church)');
select is((select count(*)::int from public.gallery_albums), 2, 'developer: every album, published or not');
select is((select count(*)::int from public.gallery_photos), 2, 'developer: every photo');
select is((select count(*)::int from public.discipleship_groups), 2, 'developer: every group, listed or not');
select is((select count(*)::int from public.invitations), 1, 'developer: invitations');
select is((select count(*)::int from public.role_presets), 4, 'developer: role_presets');
select is((select count(*)::int from public.ministries), 2, 'developer: ministries');
select is((select count(*)::int from public.leader_sections), 6, 'developer: leader_sections');
select cmp_ok((select count(*)::int from public.profiles), '>=', 7, 'developer: every profile');
select is((select count(*)::int from public.app_settings), 2, 'developer: every app_settings row');
select cmp_ok((select count(*)::int from public.newsletter_subscribers), '>=', 1, 'developer: newsletter_subscribers');
select is((select count(*)::int from public.calendar_presets), 1, 'developer: calendar_presets');
select lives_ok($$ insert into public.fin_notes (body) values ('aal2') $$, 'developer: insert fin_notes');
select lives_ok($$ insert into public.events (title, starts_at) values ('aal2', now() + interval '9 days') $$, 'developer: insert events');
select lives_ok($$ insert into public.discipleship_messages (group_id, body) values ('c0000000-0000-4000-8000-000000000005', 'aal2') $$,
                'developer: insert discipleship_messages');
select lives_ok($$ insert into public.leader_sections (name) values ('aal2') $$, 'developer: insert leader_sections');
select lives_ok($$ insert into public.gallery_albums (title, year) values ('aal2', 2026) $$, 'developer: insert gallery_albums');
select isnt_empty($$ update public.special_events set title = 'aal2' returning id $$, 'developer: update special_events');
select isnt_empty($$ update public.discipleship_interests set status = 'approved' returning id $$, 'developer: update discipleship_interests');
select isnt_empty($$ delete from public.discipleship_messages where body = 'aal2' returning id $$,
                  'developer: delete discipleship_messages');

-- ── Administrador (admin without system tabs) ───────────────────────────────
:as_adm_aal2
select is((select count(*)::int from public.discipleship_interests), 1, 'administrador: discipleship_interests');
select is((select count(*)::int from public.fin_income), 1, 'administrador: fin_income');
select is((select count(*)::int from public.profiles), 7, 'administrador: every profile');
select is((select count(*)::int from public.ministries), 2, 'administrador: reads ministries');
select lives_ok($$ insert into public.calendar_events (title, date) values ('aal2 adm', current_date + 3) $$,
                'administrador: insert calendar_events');

-- ── Tesorería ───────────────────────────────────────────────────────────────
:as_tre_aal2
select is((select count(*)::int from public.fin_income), 1, 'treasurer: fin_income');
select is((select count(*)::int from public.fin_notes where id = 'c0000000-0000-4000-8000-000000000025'), 1,
          'treasurer: fin_notes');
select is((select count(*)::int from public.fin_payables), 1, 'treasurer: fin_payables');
select is((select count(*)::int from public.fin_receipts), 1, 'treasurer: fin_receipts (church)');
select is((select count(*)::int from public.discipleship_interests), 0, 'treasurer: no discipleship_interests');
select is((select count(*)::int from public.event_registrations), 0, 'treasurer: no event_registrations');
select is((select count(*)::int from public.profiles), 1, 'treasurer: only its own profile');
select lives_ok($$ insert into public.fin_payables (creditor, amount) values ('aal2', 5) $$, 'treasurer: insert fin_payables');
select throws_ok($$ insert into public.events (title) values ('aal2 tre') $$, '42501', null, 'treasurer: insert events refused');

-- ── Leader with every operational tab (leads M1) ────────────────────────────
:as_lea_aal2
select is((select count(*)::int from public.event_registrations), 1, 'leader: event_registrations (special-events)');
select is((select count(*)::int from public.discipleship_interests), 1, 'leader: discipleship_interests (discipulado)');
select is((select count(*)::int from public.gallery_albums where not is_published), 1, 'leader: unpublished albums too (galeria)');
select is((select count(*)::int from public.fin_expenses), 1, 'leader: its ministry budget (fin_expenses)');
select is((select count(*)::int from public.fin_recurring), 1, 'leader: its ministry recurring budget');
select is((select count(*)::int from public.fin_projects), 2, 'leader: its projects');
select is((select count(*)::int from public.fin_income), 0, 'leader: not the church books');
select is((select count(*)::int from public.designs), 1, 'leader: the design shared with it');
select lives_ok($$ insert into public.calendar_events (title, date) values ('aal2 lea', current_date + 4) $$,
                'leader: insert calendar_events');
select lives_ok($$ insert into public.fin_income (source, amount, project_id)
                   values ('aal2', 3, 'c0000000-0000-4000-8000-000000000026') $$, 'leader: insert into its own project');
select isnt_empty($$ update public.discipleship_interests set status = 'approved' returning id $$,
                  'leader: update discipleship_interests');

-- ── Medios ──────────────────────────────────────────────────────────────────
:as_med_aal2
select is((select count(*)::int from public.event_registrations), 1, 'medios: event_registrations');
select is((select count(*)::int from public.discipleship_interests), 0, 'medios: no discipleship_interests');
select is((select count(*)::int from public.designs), 1, 'medios: its own design');
select lives_ok($$ insert into public.designs (title, width, height) values ('aal2', 10, 10) $$, 'medios: create a design');
select lives_ok($$ insert into public.events (title, starts_at) values ('aal2 med', now() + interval '10 days') $$,
                'medios: insert events');

-- ── Leader without tabs ─────────────────────────────────────────────────────
:as_non_aal2
select is((select count(*)::int from public.event_registrations), 0, 'no tabs: no event_registrations');
select is((select count(*)::int from public.gallery_albums where not is_published), 0, 'no tabs: published albums only');
select is((select count(*)::int from public.fin_expenses), 0, 'no tabs: no finance rows');
select throws_ok($$ insert into public.events (title) values ('aal2 non') $$, '42501', null, 'no tabs: insert events refused');
select throws_ok($$ insert into public.gallery_albums (title, year) values ('aal2 non', 2026) $$, '42501', null,
                 'no tabs: insert gallery_albums refused');

:as_postgres
select is((select count(*)::int from public.designs where title = 'aal2'), 1, 'the aal2 design was stored');

select * from finish();
rollback;
