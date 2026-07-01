# Supabase — database, RLS & edge functions

The entire access-control model for this site is **Postgres Row-Level Security
(RLS)**. The client only ever uses the public **anon** key; nothing is trusted
client-side. That makes the RLS policies the real security boundary — so they
must be reviewable and reproducible in git.

## ⚠️ Known gap: the foundational RLS is not version-controlled

`migrations/` only contains changes from **2026-05-26 onward** (admin platform,
treasury, fund accounting). The *base* schema and policies that everything else
depends on were created directly in the dashboard and are **not** in git:

- tables: `profiles`, `events`, `gallery_albums`, `gallery_photos`,
  `discipleship_groups` / `_members` / `_messages` / `_interests`, `ministries`,
  `calendar_events`
- helper functions: `is_admin()`, `my_ministry_id()` (the later migrations call
  these but never define them)

Until these are committed, the policies that protect public-insert tables —
most importantly **`discipleship_interests`, which stores visitor PII** — can't
be reviewed or rebuilt from scratch.

## How to close the gap (run once, with your project credentials)

1. **Inventory the live state** — run [`rls-audit.sql`](./rls-audit.sql) in the
   SQL Editor. It's read-only and lists every table's RLS flag, every policy,
   any RLS-on-but-no-policy tables, and the helper functions.

2. **Verify the critical invariants** from the audit output:
   - `discipleship_interests`: `anon` has **INSERT only**, **no SELECT** (PII).
   - `events`, `gallery_albums`, `gallery_photos`: public `SELECT` is scoped to
     published rows (e.g. `is_published = true`), not `using (true)`.
   - No `public` table has `rls_enabled = false`.
   - `fin_funds` / `fin_income_categories` / `fin_expense_categories` read
     policies (`20260529_fund_accounting.sql`) are `using (true)` for *all*
     authenticated users — confirm that's intended or tighten to `can_finance()`.

3. **Export the live schema + policies** as the baseline migration:
   ```bash
   supabase db dump --schema public > migrations/00000000000000_baseline.sql
   ```
   Commit it. From then on, every policy change goes through a migration so the
   security model is reviewable in PRs.

## Edge functions

- `functions/admin-invite/` — privileged account management. Re-verifies the
  caller's JWT + admin role server-side; uses the `service_role` key, which must
  never reach the client. Consider restricting its CORS `Access-Control-Allow-Origin`
  from `*` to `https://www.irdlex.org`.
- `functions/youtube-live/` — proxies the YouTube Data API. **Rotate the API key
  that was previously committed in this file's deploy comment** and restrict it to
  the YouTube Data API v3 in Google Cloud.

## Newsletter — welcome, monthly digest, day-before reminders

Four edge functions share one branded email layout in
`functions/_shared/email.ts` (Resend, from `noreply@irdlex.org`):

| Function | Trigger | What it does |
| --- | --- | --- |
| `newsletter-subscribe` | public POST from the site | inserts the subscriber, sends the welcome email |
| `newsletter-broadcast` | pg_cron, 1st of month | monthly digest to all active subscribers |
| `newsletter-reminders` | pg_cron, daily ~9am ET | reminder for events starting *tomorrow* |
| `newsletter-unsubscribe` | link/one-click in every email | opt-out via per-subscriber token |

Every email carries a footer **Cancelar suscripción** link and an RFC 8058
`List-Unsubscribe` header (Gmail/Apple one-click). Unsubscribes set
`newsletter_subscribers.unsubscribed_at`; the scheduled sends only target rows
where that is `NULL`. The `newsletter_dispatch_log` table makes each send
idempotent (`kind='monthly'` ref `YYYY-MM`; `kind='reminder'` ref `YYYY-MM-DD`),
so a re-trigger never double-sends.

### One-time setup

1. **Resend** — create an account and **verify the `irdlex.org` domain** (add the
   DNS records it gives you).
2. **Migrations** — apply `20260705_newsletter_broadcast.sql` (columns + log) and,
   after step 4, `20260706_newsletter_cron.sql` (scheduling). The base
   `newsletter_subscribers` table comes from the earlier `newsletter` migration.
3. **Function secrets:**
   ```bash
   supabase secrets set RESEND_API_KEY=<your-resend-key>
   supabase secrets set CRON_SECRET=<a-long-random-string>   # gate for the scheduled fns
   ```
4. **Deploy** (all allow anonymous callers — no user session):
   ```bash
   supabase functions deploy newsletter-subscribe   --no-verify-jwt
   supabase functions deploy newsletter-broadcast   --no-verify-jwt
   supabase functions deploy newsletter-reminders   --no-verify-jwt
   supabase functions deploy newsletter-unsubscribe --no-verify-jwt
   ```
   `newsletter-broadcast`/`-reminders` are additionally gated by the
   `x-cron-secret` header, so only the cron job (which holds `CRON_SECRET`) can
   fire them.
5. **Scheduling (pg_cron)** — in the SQL editor, once, with real values (kept out
   of git, so `20260706_newsletter_cron.sql` reads them from Vault):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
   select vault.create_secret('<the same CRON_SECRET as above>', 'cron_secret');
   ```
   Then apply `20260706_newsletter_cron.sql`. It schedules `newsletter-monthly`
   (`0 13 1 * *`) and `newsletter-reminders` (`0 13 * * *`) — 13:00 UTC = 9am ET
   in summer, 8am ET in winter (a fixed cron can't follow DST; event dates are
   always computed in ET regardless).

### Testing before go-live

```bash
# preview to one address (no fan-out, no dedup log):
curl -X POST "$FN/newsletter-broadcast" -H "x-cron-secret: $CRON_SECRET" \
     -H 'Content-Type: application/json' -d '{"test":"you@example.com"}'
# reminder preview for a specific ET day (must have an event that day):
curl -X POST "$FN/newsletter-reminders" -H "x-cron-secret: $CRON_SECRET" \
     -H 'Content-Type: application/json' -d '{"test":"you@example.com","date":"2026-07-05"}'
```
`{"force":true}` on `newsletter-broadcast` re-sends the real blast even if this
month is already logged. Until Resend is configured, sign-ups still record the
subscriber; the email is skipped (logged).
