-- 07_foreign_keys.sql — deleting an account must not be blocked by its rows.
begin;
select plan(1);
select is(
  (select confdeltype::text from pg_constraint where conname = 'calendar_events_created_by_fkey'),
  'n',
  'calendar_events.created_by is ON DELETE SET NULL');
select * from finish();
rollback;
