-- ============================================================================
-- 20260706_newsletter_cron.sql — schedule the newsletter edge functions.
-- ============================================================================
-- Runs entirely inside Postgres via pg_cron + pg_net (no external scheduler):
--   • newsletter-broadcast  → 1st of the month, 13:00 UTC
--   • newsletter-reminders  → every day, 13:00 UTC
--
-- 13:00 UTC = 9:00 AM Eastern during DST (Mar–Nov). In winter (EST) it lands at
-- 8:00 AM ET; a fixed cron can't follow DST, so we accept the one-hour winter
-- shift rather than run twice. The functions themselves compute all event dates
-- in America/New_York, so *content* is always correct regardless of this.
--
-- ── ONE-TIME SETUP (run these once in the SQL editor, with real values — they
--    are NOT committed so secrets stay out of git): ──────────────────────────
--
--   -- Enable the extensions (or toggle them on under Database → Extensions):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   -- Store the project URL + cron secret in Vault so this migration can read
--   -- them without hard-coding secrets. CRON_SECRET must match the value you
--   -- set with `supabase secrets set CRON_SECRET=…` for the functions.
--   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR_LONG_RANDOM_CRON_SECRET',  'cron_secret');
--
-- Then run this migration. It is idempotent (re-scheduling replaces the job).
-- ============================================================================

do $$
declare
  base_url text;
  secret   text;
begin
  -- Bail out cleanly if setup hasn't run yet, so applying migrations never fails.
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'cron_secret';

  if base_url is null or secret is null then
    raise notice '[newsletter cron] Vault secrets project_url/cron_secret not set — skipping scheduling. See header for setup.';
    return;
  end if;

  -- Monthly digest — 1st of the month.
  perform cron.schedule(
    'newsletter-monthly',
    '0 13 1 * *',
    format($cron$
      select net.http_post(
        url     := %L || '/functions/v1/newsletter-broadcast',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body    := '{}'::jsonb
      );
    $cron$, base_url, secret)
  );

  -- Day-before reminders — every day.
  perform cron.schedule(
    'newsletter-reminders',
    '0 13 * * *',
    format($cron$
      select net.http_post(
        url     := %L || '/functions/v1/newsletter-reminders',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body    := '{}'::jsonb
      );
    $cron$, base_url, secret)
  );

  raise notice '[newsletter cron] scheduled newsletter-monthly and newsletter-reminders.';
end $$;
