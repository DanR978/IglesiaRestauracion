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
- `functions/track/` — public, cookieless website analytics collector (beacons
  from `js/lib/analytics.js`). Drops bots and non-irdlex.org origins, hashes the
  visitor with a salt that rotates daily, never stores IP or user-agent. Feeds the
  admin **Analíticas** tab. Setup: apply `migrations/20261012_site_analytics.sql`,
  then `supabase functions deploy track --no-verify-jwt`.
- `functions/contact-submit/` — the public **Contáctanos** form (`js/lib/forms.js`).
  Validates, drops honeypot hits and non-irdlex.org origins, and emails the message
  through Resend to `contactanos@irdlex.org` (override with the `CONTACT_TO` secret)
  with Reply-To set to the visitor. Stores nothing; shares `RESEND_API_KEY` and the
  daily quota with the newsletter. Deploy:
  `supabase functions deploy contact-submit --no-verify-jwt`. Replaced FormSubmit,
  whose hashed key delivered to `serve@irdlex.org`.

## Email — one sender for Auth and the newsletter

Everything the site emails goes out through **Resend** as `noreply@irdlex.org`:
Supabase Auth's account emails (custom SMTP) and the newsletter functions below
(Resend's HTTP API, `RESEND_API_KEY`). Nothing is delivered until the domain is
verified. Both share Resend's quota — 100 emails a day on the free plan — so a
large newsletter blast can crowd out invitations and password resets that day.

### 1. Verify irdlex.org in Resend (DNS is at GoDaddy)

`irdlex.org` publishes **`DMARC p=reject`**: a message that isn't DKIM-signed for
irdlex.org is bounced, not junked — and Resend refuses to send from an unverified
domain at all. Resend → **Domains → irdlex.org → Records** lists what it expects;
add those in GoDaddy → **DNS**, typing the **Name** without the domain (`send`, not
`send.irdlex.org` — GoDaddy appends it). For a domain added before Aug 2026:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `resend._domainkey` | the `p=…` key Resend shows (unique to the account) |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority `10` |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` — keep exactly one |

If Resend shows **CNAME** records on `send` instead, delete the `send` TXT first — a
CNAME can't share a name with another record. Nothing here touches the Microsoft
365 records (root MX and SPF, `selector1/2._domainkey`). Then press **Verify**.

### 2. Supabase Auth → custom SMTP

Supabase's built-in mailer only delivers to members of the org's team, 2 per hour —
without this, invitations to new leaders never arrive. Quickest: Resend →
**Settings → Integrations → Supabase** (pick IRDLEX and irdlex.org; it creates its
own API key and fills in the form). By hand, Auth → **Emails → SMTP Settings**:

| Field | Value |
| --- | --- |
| Sender email / name | `noreply@irdlex.org` / `Iglesia Restauración Divina` |
| Host / port | `smtp.resend.com` / `465` (or 587 — never 2465) |
| Username / password | `resend` / a Resend API key with sending access to irdlex.org |

### 3. Auth email templates and settings — `apply-auth-email.mjs`

[`email-templates/`](./email-templates/) is the source of truth for every Auth
email; each file's header comment names its dashboard slot and subject. Don't edit
them in the dashboard — edit the file, then push:

```bash
SUPABASE_ACCESS_TOKEN=sbp_… node supabase/apply-auth-email.mjs          # dry run: prints the diff
SUPABASE_ACCESS_TOKEN=sbp_… node supabase/apply-auth-email.mjs --apply
```

It reads the live config and sends only what differs (it never touches SMTP). The
rules the templates follow:

- **Links carry `token_hash`, never `{{ .ConfirmationURL }}`** (the script refuses
  it). ConfirmationURL spends the one-time token on the first GET, so any mail
  scanner that prefetches links burns the invitation before anyone clicks. With
  `https://www.irdlex.org/admin/?action=…&token_hash={{ .TokenHash }}&type=…` it is
  spent only when `/admin/` calls `verifyOtp` (`js/pages/admin/auth.js`), which also
  needs `action` to show the set-password card. The origin is hard-coded: GoTrue
  falls back to the bare Site URL whenever a redirect isn't allowed, which would
  break a `{{ .RedirectTo }}`-based link.
- **Confirm sign up** routes into the invite flow: sign-ups are off, but anyone can
  re-send it to a pending invitee, and it replaces their invite link.
- **Magic link** and **Change email** deliberately carry no link — the panel signs
  in with password + 2FA and emails are changed by an administrator, yet anyone can
  request either email through the public API.
- Links live **24 h** (`mailer_otp_exp`), and the copy says so. That — not
  `invitations.expires_at` — is what expires an invitation.
- **Password changed** notifications are on, so an owner learns of a takeover.

### 4. Settings the script enforces

- Site URL `https://www.irdlex.org`; Redirect URLs gain
  `https://www.irdlex.org/admin/**` and `http://localhost:3000/admin/**` (dev).
- **Sign-ups off** (`disable_signup`). Accounts are invite-only, and GoTrue's admin
  invite (`inviteUserByEmail` in `admin-invite`) ignores the switch. Left on, anyone
  holding the public anon key gets an `authenticated` session — and with
  **Confirm email** off, signing up as a *pending invitee's* address confirms that
  account and hands over its preset role. So Confirm email stays on
  (`mailer_autoconfirm: false`) and anonymous sign-ins stay off.
- Keep **Secure password change**, **Require current password** and **CAPTCHA**
  off: the legacy admin sends no nonce, current password or captcha token, so each
  would break login, reset or Mi cuenta.

### 5. Check it

[`email-audit.sql`](./email-audit.sql) (read-only, SQL editor) shows the cron jobs,
their recent runs, what the functions answered, whether Vault's `cron_secret`
matches the `CRON_SECRET` function secret, and whether each job still carries it.
Resend → **Emails** logs every message with its delivery status.

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
2. **Migrations** — apply `20260705000001_newsletter_broadcast.sql` (columns + log) and,
   after step 4, `20260706000001_newsletter_cron.sql` (scheduling). The base
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
   of git, so `20260706000001_newsletter_cron.sql` reads them from Vault):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
   select vault.create_secret('<the same CRON_SECRET as above>', 'cron_secret');
   ```
   Then apply `20260706000001_newsletter_cron.sql`. It schedules `newsletter-monthly`
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
   20260824120100_fin_ministry_shared.sql   -- D-019 sharing + its D-027 guard (no-op if already applied)
   20260824120200_receipts_cleanup_cron.sql -- run AFTER deploying the function (step 2)
   ```
   All three are idempotent. `20260824120100` doesn't depend on the receipts
   files — D-027 ships it on its own for the legacy shared ministry books, so
   it may already be in. After the first one, confirm the bucket really is
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

## Líderes — admin-editable "Nuestros Líderes" page

`/lideres/` reads the roster from `leaders_directory()`; admins edit it in the **Líderes**
tab. Photos go to the public `leaders` bucket. Contact (email/phone) can only be stored
for a member marked *Es líder* who opted in, and the page shows only an icon for it
(MIGRATION.md D-028).

### One-time setup

Paste these into the SQL Editor, in order, and run each once (both idempotent):

1. `migrations/20261017000001_leaders_directory.sql` — tables, RPC, bucket, and the roster
   seed (only while `leader_sections` is empty). **Applied in prod 2026-10-18.**
2. `migrations/20261018000001_leaders_review_fixes.sql` — strict `contact_email` shape and
   an `id` tie-breaker in the RPC. It refuses to apply if a stored address breaks the new
   shape; fix that row in the Líderes tab first.

Until (1) runs, `/lideres/` shows an error box — the page holds no names of its own.

### Check it

```sql
select jsonb_array_length(public.leaders_directory());        -- expect 6 sections
select s.name, count(m.id) from public.leader_sections s
  left join public.leader_members m on m.section_id = s.id
  group by s.name, s.sort_order order by s.sort_order;        -- 2·1·1·6·2·1 people
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'leaders';                  -- true · 2097152 · {image/jpeg}
select pg_get_constraintdef(oid) from pg_constraint
  where conname = 'leader_members_contact_email_check';      -- (2): …[A-Za-z0-9._+-]+@…
```
