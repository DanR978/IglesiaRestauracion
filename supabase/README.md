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

- `functions/newsletter-subscribe/` — public sign-up. Inserts the subscriber and
  emails a branded welcome (weekly services + this month's events) via
  [Resend](https://resend.com). **Setup required before sign-ups send email:**
  1. Create a Resend account and **verify the `irdlex.org` domain** (add the DNS
     records Resend gives you). The function sends from `noreply@irdlex.org`.
  2. Set the secret: `supabase secrets set RESEND_API_KEY=<your-key>`
  3. Deploy (allow anonymous callers — visitors have no session):
     `supabase functions deploy newsletter-subscribe --no-verify-jwt`
  Until then, the table still records subscribers; the email is skipped (logged).
  Also run the `20260607_newsletter.sql` migration so the table exists.
  To send to ALL subscribers later (monthly blast), add a separate scheduled
  function that reads `newsletter_subscribers` and loops Resend — this function
  only handles the per-signup welcome.
