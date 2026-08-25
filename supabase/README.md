# Supabase — database, RLS & edge functions

The entire access-control model for this site is **Postgres Row-Level Security
(RLS)**. The client only ever uses the public **anon** key; nothing is trusted
client-side. That makes the RLS policies the real security boundary — so they
must be reviewable and reproducible in git.

## ✅ The schema is now in git (closed by migration session S01, 2026-07-14)

The base schema and policies used to be dashboard-only. They are now committed
as **two** baseline files, and the whole schema rebuilds from git:

| File | What it holds |
| --- | --- |
| `migrations/00000000000000_baseline.sql` | `public`: 32 tables, 78 policies, 24 functions (incl. `is_admin()`, `my_ministry_id()`, `has_tab()`, `is_finance()`) |
| `migrations/00000000000001_baseline_storage.sql` | the 15 `storage.objects` policies (gallery, event-images, avatars, design-assets) |

```bash
supabase start && supabase db reset   # baseline + baseline_storage + every migration, from scratch
```

**Two things to know before you touch this directory:**

- **`db dump --schema public` does not capture the storage policies.** That's why
  the baseline is two files. Regenerating it from a single `--schema public` dump
  silently drops half the security boundary.
- **Migration filenames need 14 digits** (`YYYYMMDDHHMMSS_name.sql`). The CLI keys
  `schema_migrations` on the leading digits, so two same-day `YYYYMMDD_` files
  collide on one version and `db reset` / `db push` fail. Prod is still updated by
  hand in the SQL Editor.

## Audit results (S01) — what's still open

Run [`rls-audit.sql`](./rls-audit.sql) any time; it's read-only. As of 2026-07-14:

**Good:** every `public` table has RLS on (32/32). The PII invariant **holds** —
`discipleship_interests` and `event_registrations` are **anon-INSERT-only, no anon
SELECT**. `gallery_albums`/`gallery_photos` public reads *are* scoped to
`is_published = true`.

**Open (recorded in `MIGRATION.md`; hardening belongs to migration session S39):**

1. **`is_aal2()` is a stub — its body is `select true`** (G-016). Every policy that
   reads as MFA-gated (`dinterests_staff_all` on the PII table, the three `Gallery
   staff` storage writes) is really just `is_admin()`. **DB-side MFA is not
   enforced today.** Don't cite one of these policies as proof that it is.
2. **`Modo mantenimiento` is dead in production** (G-015). The
   `public_feature_flags` migration was never applied to prod, so `app_settings`
   has no anon SELECT policy, so `js/lib/maintenance.js` (which reads it as anon)
   gets zero rows and fails open. Applying that one migration fixes it.
3. The `event-images` bucket's write policies are named "Admins can upload/delete"
   but never call `is_admin()` — **any authenticated user** can write to it.
4. `fin_funds` / `fin_income_categories` / `fin_expense_categories` are
   `using (true)` for *all* authenticated users, not just finance — names and
   categories only, no amounts. Confirm that's intended or tighten to `can_finance()`.
5. `newsletter_subscribers` anon INSERT is `with check (true)` — no email
   validation, no rate limit.

Note `events` / `calendar_events` public reads are `using (true)`, which is
**correct**: neither table has a published/draft column, so there is nothing to
scope to. (An earlier version of this README implied otherwise.)

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

## Recibos de tesorería — private receipt images + annual retention

Receipt photos for the church books, for each ministry a leader is assigned to,
and for personal projects. Three pieces:

| Piece | What it is |
| --- | --- |
| `public.fin_receipts` | one row per receipt — scope (`church`/`ministry`/`project`), year, **month**, the two object paths, size, note |
| the `receipts` storage bucket | **private** (`public = false`), `image/webp` only, 10 MB per object |
| `functions/receipts-cleanup/` | the annual retention worker, fired by pg_cron |

**The retention rule in one sentence:** a year's receipts are kept until the end
of January of the second following year — the run of **February 1st of year N**
deletes everything filed in **N−2 or earlier**, so the books always hold the full
previous year plus the current one (Feb 1 2028 deletes 2026 and older, keeps 2027
and 2028). Each receipt therefore lives ~13–25 months.

**The bucket is never public-read.** Unlike `gallery` / `event-images` /
`avatars`, a receipt is a financial document: the app reads it with an
authenticated `.download()`, so no public URL and no long-lived signed URL ever
exists. If a change ever sets `public = true` on this bucket, that is a security
regression (MIGRATION.md D-018).

**Who sees what** (D-019 — enforced by RLS, never by the client):

| scope | who |
| --- | --- |
| `church` | finance only (`is_finance()` = role `admin` or `treasurer`) |
| `ministry` | finance **and every leader of that ministry** — shared, not owner-private |
| `project` | the project's owner **only** — invisible even to finance |

Object paths are `church/<year>/<uuid>.webp`,
`ministry/<ministry_id>/<year>/<uuid>.webp`, `project/<project_id>/<year>/<uuid>.webp`
(plus a `-thumb.webp` sibling). The **year folder is what the cleanup job sweeps;
the month lives in the row**, so re-filing a receipt never moves an object. The
`receipts_insert` policy enforces that exact shape (folder depth + 4-digit year),
which is the only reason the `::uuid` casts in the read/delete policies can never
meet a malformed name — **never loosen those shape checks**. There is deliberately
**no UPDATE policy on storage.objects and no UPDATE grant on the table**: receipts are immutable end to end, so replacing one is delete + re-upload. (A granted UPDATE would let a leader re-point a co-leader receipt into a private project, or rewrite the year that retention keys on — permissive policies OR their USING and WITH CHECK independently.)

### One-time setup

1. **Migrations** — apply in this order in the SQL editor:
   ```
   20260824120000_fin_receipts.sql          -- table + RLS + private bucket + storage policies
   20260824120100_fin_ministry_shared.sql   -- D-019 additive widening of fin_projects/income/expenses
   20260824120200_receipts_cleanup_cron.sql -- run AFTER deploying the function (step 2)
   ```
   All three are idempotent. After the first one, confirm the bucket really is
   private:
   ```sql
   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'receipts';
   -- expected: receipts | f | 10485760 | {image/webp}
   ```
2. **Deploy the function** (server-to-server; no user session, so no JWT check):
   ```bash
   supabase functions deploy receipts-cleanup --no-verify-jwt
   ```
3. **Secrets — nothing new.** It reuses the `CRON_SECRET` function secret and the
   Vault `project_url` / `cron_secret` from the newsletter setup above. Only if
   that was never done, do it now (see the newsletter section), then apply
   `20260824120200_receipts_cleanup_cron.sql`; without the Vault values that
   migration raises a `notice` and schedules nothing.
4. **Confirm the job:**
   ```sql
   select jobname, schedule, active from cron.job where jobname = 'receipts-cleanup-annual';
   -- expected: receipts-cleanup-annual | 0 5 1 2 * | t
   ```

### Testing before go-live

```bash
# SAFE NO-OP — no receipt is from 1990, so this deletes nothing and proves the
# secret, the routing and the service-role client all work:
curl -X POST "$FN/receipts-cleanup" -H "x-cron-secret: $CRON_SECRET" \
     -H 'Content-Type: application/json' -d '{"cutoffYear":1990}'
# → {"ok":true,"cutoff":1990,"deletedRows":0,"deletedObjects":0,"failures":[]}
```

Omit `cutoffYear` (or send `{}`) and it uses the real cutoff — **that deletes
production data**, so only do it on a staging project with seeded old rows. A
wrong or missing `x-cron-secret` returns `401 {"error":"No autorizado."}`; a GET
returns `405`. Re-running is always a no-op (`deletedRows: 0`) because the sweep
is `year <= cutoff`, which is also what makes a missed annual run self-heal at
the next firing.

#### Comprobación después de cada ejecución (1 de febrero)

This job runs **once a year**, and `net.http_post` records success no matter what the
function answered — a rotated `CRON_SECRET` would produce a silent 401 and retention
simply would not happen for another 12 months. Check it the same week:

```sql
select start_time, status from cron.job_run_details
  where jobname = 'receipts-cleanup-annual' order by start_time desc limit 3;

select created, (response).status_code, (response).body
  from net._http_response order by created desc limit 5;   -- expect 200 and "failures":[]

select year, count(*) from public.fin_receipts group by year order by year;
-- no row should remain for a year <= (current year - 2)
```

If it did not run, re-trigger it **with an explicit `cutoffYear`** rather than an empty
body, so the year being deleted is a deliberate choice:

```bash
curl -X POST "$PROJECT_URL/functions/v1/receipts-cleanup" \
  -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"cutoffYear": 2026}'
```
