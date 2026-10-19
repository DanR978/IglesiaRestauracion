-- ============================================================================
-- 06_storage_realtime.sql — storage writes need aal2 in every bucket;
-- event-images is written by event-tab holders; Realtime private channels
-- need aal2
-- ============================================================================
-- Objects are inserted with SQL, as the Storage API does under the caller's
-- JWT; deletes set storage.allow_delete_query as the Storage API does.
-- ============================================================================
begin;
\ir helpers/fixtures.psql
select plan(26);

insert into storage.objects (bucket_id, name) values ('event-images', 'fixture-existing.jpg');

-- ── 1. aal1: no bucket accepts a write ──────────────────────────────────────
:as_dev_aal1
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', 'a0000000-0000-4000-8000-000000000001/a.png') $$,
                 '42501', null, 'aal1: avatars (own folder) refused');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('design-assets', 'a0000000-0000-4000-8000-000000000001/a.png') $$,
                 '42501', null, 'aal1: design-assets (own folder) refused');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('event-images', 'aal1.jpg') $$,
                 '42501', null, 'aal1: event-images refused');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('gallery', 'aal1/a.jpg') $$,
                 '42501', null, 'aal1: gallery refused');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('leaders', 'aal1.jpg') $$,
                 '42501', null, 'aal1: leaders refused');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('receipts', 'church/2026/aal1.webp') $$,
                 '42501', null, 'aal1: receipts refused');
set local storage.allow_delete_query = 'true';
select is_empty($$ delete from storage.objects where bucket_id = 'event-images' returning name $$, 'aal1: delete refused');
select is_empty($$ update storage.objects set name = 'renamed.jpg' where bucket_id = 'event-images' returning name $$,
                'aal1: update refused');
select is((select count(*)::int from storage.objects where bucket_id = 'event-images'), 1, 'aal1: public bucket still listable');

-- ── 2. aal2: the same writes go through ─────────────────────────────────────
:as_dev_aal2
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', 'a0000000-0000-4000-8000-000000000001/a.png') $$,
                'aal2: avatars (own folder)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', 'a0000000-0000-4000-8000-000000000002/a.png') $$,
                 '42501', null, 'aal2: still only the own avatars folder');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('design-assets', 'a0000000-0000-4000-8000-000000000001/a.png') $$,
                'aal2: design-assets (own folder)');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('event-images', 'aal2.jpg') $$, 'aal2: event-images (admin)');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('gallery', 'aal2/a.jpg') $$, 'aal2: gallery (admin)');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('leaders', 'aal2.jpg') $$, 'aal2: leaders (admin)');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('receipts', 'church/2026/aal2.webp') $$,
                'aal2: receipts church folder (finance)');
select isnt_empty($$ delete from storage.objects where bucket_id = 'event-images' and name = 'fixture-existing.jpg' returning name $$,
                  'aal2: delete from event-images');

-- ── 3. event-images: only holders of an event tab (G-017a) ──────────────────
:as_med_aal2
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('event-images', 'medios.jpg') $$,
                'Medios (event tabs): event-images');
:as_non_aal2
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('event-images', 'non.jpg') $$,
                 '42501', null, 'a leader without event tabs: event-images refused');
select is_empty($$ delete from storage.objects where bucket_id = 'event-images' returning name $$,
                'a leader without event tabs: cannot delete event images');
:as_tre_aal2
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('event-images', 'tre.jpg') $$,
                 '42501', null, 'treasurer: event-images refused');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('receipts', 'church/2026/tre.webp') $$,
                'treasurer: receipts church folder');

-- ── 4. gallery for a galeria holder (DF-003, not merged) ────────────────────
:as_med_aal2
select todo('DF-003: the gallery bucket still requires an admin; galeria holders upload once DF-003 lands', 1);
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('gallery', 'medios/a.jpg') $$,
                'Medios (galeria): gallery upload');

-- ── 5. Realtime private channels (the designer's co-edit topic) ─────────────
:as_med_aal1
set local realtime.topic = 'design:c0000000-0000-4000-8000-000000000029';
select case
  when exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
                where i.inhparent = 'realtime.messages'::regclass
                  and now()::timestamp >= substring(pg_get_expr(c.relpartbound, c.oid) from $r$FROM \('([^']+)'\)$r$)::timestamp
                  and now()::timestamp <  substring(pg_get_expr(c.relpartbound, c.oid) from $r$TO \('([^']+)'\)$r$)::timestamp)
  then throws_ok($$ insert into realtime.messages (topic, extension, private) values (realtime.topic(), 'broadcast', true) $$,
                 '42501', null, 'realtime: an aal1 session cannot send on its design channel')
  else skip('no realtime.messages partition for today (Realtime not running)', 1)
end;
:as_med_aal2
set local realtime.topic = 'design:c0000000-0000-4000-8000-000000000029';
select case
  when exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
                where i.inhparent = 'realtime.messages'::regclass
                  and now()::timestamp >= substring(pg_get_expr(c.relpartbound, c.oid) from $r$FROM \('([^']+)'\)$r$)::timestamp
                  and now()::timestamp <  substring(pg_get_expr(c.relpartbound, c.oid) from $r$TO \('([^']+)'\)$r$)::timestamp)
  then lives_ok($$ insert into realtime.messages (topic, extension, private) values (realtime.topic(), 'broadcast', true) $$,
                'realtime: at aal2 the design owner sends on its channel')
  else skip('no realtime.messages partition for today (Realtime not running)', 1)
end;
:as_lea_aal1
select is((select count(*)::int from realtime.messages), 0, 'realtime: an aal1 session reads no channel messages');

select * from finish();
rollback;
