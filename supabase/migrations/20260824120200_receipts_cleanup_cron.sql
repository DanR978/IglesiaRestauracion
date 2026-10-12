-- ============================================================================
-- 20260824120200_receipts_cleanup_cron.sql — annual receipt retention (D-018)
-- ============================================================================
-- Run in the Supabase SQL Editor, AFTER 20260824120000_fin_receipts.sql and
-- AFTER `supabase functions deploy receipts-cleanup --no-verify-jwt`.
-- Idempotent — cron.schedule() with an existing job name replaces it.
--
-- Schedules ONE job, entirely inside Postgres via pg_cron + pg_net:
--   receipts-cleanup-annual → '0 5 1 2 *'  (February 1st, 05:00 UTC = midnight ET)
-- It POSTs the `receipts-cleanup` edge function, which deletes every
-- fin_receipts row with `year <= cutoff` plus their storage objects.
--
-- ── THE RETENTION ARITHMETIC (checked against D-018) ────────────────────────
-- D-018: "year Y's receipts are deleted after end of January of Y+2", so the
-- books always hold the full previous year plus the current year.
--
--   the job fires on Feb 1 of year N  →  cutoff = N − 2  →  delete year <= N−2
--   year Y is therefore deleted at the first N where N − 2 >= Y, i.e. N = Y + 2,
--   i.e. on February 1st of Y+2 — exactly "after the end of January of Y+2". ✓
--
--   WORKED EXAMPLE — the run of Feb 1 2028:
--     cutoff = 2028 − 2 = 2026  →  deletes 2026 and older
--                                 →  KEEPS 2027 (the full previous year) and 2028
--   A receipt therefore lives ~13 months (one filed Dec 2026 dies Feb 1 2028)
--   to ~25 months (one filed Jan 2026 also dies Feb 1 2028).
--
-- `<=` rather than `=` is what makes a MISSED run self-heal: if Feb 1 2028 never
-- fires, Feb 1 2029 (cutoff 2027) still clears 2026 and 2027 together.
--
-- The edge function's own default is `new Date().getUTCFullYear() - 2`, computed
-- in UTC — the same N the cron's UTC schedule fires in. A body of
-- `{"cutoffYear": <n>}` overrides it (used for the safe no-op smoke test).
--
-- ── ONE-TIME SETUP — already done for the newsletter; NOTHING NEW is needed ──
-- This job reuses the Vault secrets and the CRON_SECRET that
-- 20260706000001_newsletter_cron.sql set up. Only if that setup never ran:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR_LONG_RANDOM_CRON_SECRET',  'cron_secret');
--   -- and, for the function itself:
--   --   supabase secrets set CRON_SECRET=<the same value as cron_secret>
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
    raise notice '[receipts cron] Vault secrets project_url/cron_secret not set — skipping scheduling. See header for setup.';
    return;
  end if;

  -- Annual retention sweep — February 1st, 05:00 UTC.
  perform cron.schedule(
    'receipts-cleanup-annual',
    '0 5 1 2 *',
    format($cron$
      select net.http_post(
        url     := %L || '/functions/v1/receipts-cleanup',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L),
        body    := '{}'::jsonb
      );
    $cron$, base_url, secret)
  );

  raise notice '[receipts cron] scheduled receipts-cleanup-annual (0 5 1 2 *).';
end $$;
