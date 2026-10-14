-- ============================================================================
-- EMAIL AUDIT — read-only diagnostic. Run in the Supabase SQL Editor.
-- ============================================================================
-- This makes NO changes (the temp table vanishes with the session). One run,
-- one result grid: extensions, the Vault values the cron jobs read, the jobs
-- and their recent runs, the last pg_net responses (what the functions
-- answered), and newsletter counts.
--
-- No secret is ever printed. `cron_secret sha256` must equal the CRON_SECRET
-- DIGEST shown by `supabase secrets list`; if they differ, every scheduled
-- send gets a silent 401.
-- ============================================================================

create temp table if not exists _email_audit (seq serial, section text, item text, detail text);
truncate _email_audit restart identity;

do $$
begin
  insert into _email_audit (section, item, detail)
    select 'extension', e.extname, e.extversion
    from pg_extension e
    where e.extname in ('pg_cron', 'pg_net', 'supabase_vault', 'pgcrypto');

  insert into _email_audit (section, item, detail)
    select 'vault', s.name, 'created ' || s.created_at::date || ', updated ' || s.updated_at::date
    from vault.secrets s
    where s.name in ('project_url', 'cron_secret');

  insert into _email_audit (section, item, detail)
    select 'vault', 'project_url =', d.decrypted_secret
    from vault.decrypted_secrets d where d.name = 'project_url';

  insert into _email_audit (section, item, detail)
    select 'vault', 'cron_secret sha256', encode(extensions.digest(d.decrypted_secret, 'sha256'), 'hex')
    from vault.decrypted_secrets d where d.name = 'cron_secret';

  -- pg_cron / pg_net may not be installed yet; query them only if they exist.
  if to_regclass('cron.job') is not null then
    execute $q$
      insert into _email_audit (section, item, detail)
      select 'cron job', jobname, schedule || case when active then '' else '  (INACTIVE)' end
      from cron.job order by jobname
    $q$;
    execute $q$
      insert into _email_audit (section, item, detail)
      select 'cron run', j.jobname,
             d.start_time::timestamp(0) || ' UTC  ' || d.status || '  ' || coalesce(left(d.return_message, 80), '')
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where strpos(j.command, '/functions/v1/') > 0
      order by d.start_time desc limit 8
    $q$;
    execute $q$
      insert into _email_audit (section, item, detail)
      select 'cron job', j.jobname,
             'secret matches vault: ' ||
             coalesce((substring(j.command from '''x-cron-secret''[[:space:]]*,[[:space:]]*''([^'']*)''')
                       = (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))::text, 'no')
      from cron.job j where strpos(j.command, '/functions/v1/') > 0 order by j.jobname
    $q$;
  end if;

  if to_regclass('net._http_response') is not null then
    execute $q$
      insert into _email_audit (section, item, detail)
      select 'http response', r.id::text,
             r.created::timestamp(0) || ' UTC  ' || coalesce(r.status_code::text, 'ERR') || '  ' ||
             coalesce(left(r.content, 120), left(r.error_msg, 120), '')
      from net._http_response r order by r.created desc limit 8
    $q$;
  end if;

  if to_regclass('public.newsletter_dispatch_log') is null then
    insert into _email_audit (section, item, detail)
      values ('newsletter', 'dispatch log', 'MISSING — apply 20260705000001_newsletter_broadcast.sql');
    return;
  end if;

  insert into _email_audit (section, item, detail)
    select 'subscribers', case when unsubscribed_at is null then 'active' else 'unsubscribed' end, count(*)::text
    from public.newsletter_subscribers group by 2;

  insert into _email_audit (section, item, detail)
    select 'dispatch log', l.kind || ' ' || l.ref, l.recipients || ' recipients @ ' || l.sent_at::timestamp(0) || ' UTC'
    from public.newsletter_dispatch_log l order by l.sent_at desc limit 12;
end $$;

select section, item, detail from _email_audit order by seq;
