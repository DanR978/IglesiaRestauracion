-- 08_optional_mfa.sql — setting up a second factor is optional (D-033 as
-- amended 2026-10-20): an account WITH a verified factor must use it (aal2);
-- an account without one works at aal1.
begin;
\ir helpers/fixtures.psql
select plan(4);

:as_adm_aal1
select is((select count(*)::int from public.fin_income), 0,
          'with a verified factor, aal1 reads nothing from a staff table');
reset role;

delete from auth.mfa_factors where user_id = :'adm_id';

:as_adm_aal1
select ok((select public.is_aal2()), 'without a factor, the aal1 session passes is_aal2()');
select cmp_ok((select count(*)::int from public.fin_income), '>', 0,
              'without a factor, aal1 reads staff data');
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select ok(not (select public.is_aal2()), 'anon never passes is_aal2()');
reset role;

select * from finish();
rollback;
