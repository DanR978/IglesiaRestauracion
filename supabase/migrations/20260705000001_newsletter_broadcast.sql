-- ============================================================================
-- 20260705000001_newsletter_broadcast.sql — scheduled newsletter (monthly digest +
-- day-before event reminders) + one-click unsubscribe.
-- ============================================================================
-- Background: `newsletter-subscribe` only sends a one-time welcome email at
-- sign-up. This adds the pieces the scheduled functions need:
--   1. per-subscriber unsubscribe token + an unsubscribed_at "soft delete"
--   2. a dispatch log so a blast/reminder is never sent twice (idempotency)
--
-- The cron scheduling itself lives in 20260706000001_newsletter_cron.sql.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── 1. Subscriber columns ───────────────────────────────────────────────────
-- unsubscribe_token: opaque per-subscriber secret used in the unsubscribe link.
-- unsubscribed_at:   soft-unsubscribe timestamp; NULL = active. We keep the row
--                    (never hard-delete) so a unique email can't be re-added to
--                    dodge the opt-out, and so we retain an audit trail.
alter table public.newsletter_subscribers
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

alter table public.newsletter_subscribers
  add column if not exists unsubscribed_at timestamptz;

create unique index if not exists newsletter_subscribers_unsub_token_idx
  on public.newsletter_subscribers (unsubscribe_token);

-- Fast lookup of active recipients when building a send.
create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers (unsubscribed_at)
  where unsubscribed_at is null;

-- ── 2. Dispatch log (idempotency) ───────────────────────────────────────────
-- One row per thing we've sent. (kind, ref) is unique so a re-trigger is a
-- no-op:
--   kind='monthly'  ref='2026-07'                 → the July digest
--   kind='reminder' ref='2026-07-04'              → the reminder for events on
--                                                    that ET calendar day
create table if not exists public.newsletter_dispatch_log (
  kind        text        not null,
  ref         text        not null,
  recipients  integer     not null default 0,
  sent_at     timestamptz not null default now(),
  primary key (kind, ref)
);

comment on table public.newsletter_dispatch_log is
  'Idempotency ledger for scheduled newsletter sends (monthly digest, day-before reminders).';

-- Lock it down: RLS on with no policies means only the service_role (which the
-- edge functions use, and which bypasses RLS) can read or write it. No anon /
-- authenticated access.
alter table public.newsletter_dispatch_log enable row level security;
