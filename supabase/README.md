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

**Open (recorded in `MIGRATION.md`; status: the server-side MFA/tier migration is
written, not applied — see [Staff sign-in](#staff-sign-in--oauth-providers-mfa-rollout-break-glass)):**

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

- `functions/admin-invite/` — privileged account management with the
  `service_role` key, which must never reach the client. Every action requires,
  server-side, a live session that passed a second factor (`aal2`) and the
  developer tier; CORS answers only `https://www.irdlex.org` and loopback dev
  origins (override with the `ALLOWED_ORIGINS` secret). Deploy it only after the
  server-side migration is in — see [Rollout order](#rollout-order).
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
node supabase/apply-auth-email.mjs --help                               # every flag
```

It reads the live config and sends only what differs (it never touches SMTP). The
same run enforces the settings in §4 and, given a secrets file, the Google and
Microsoft providers — see [Running the config script safely](#running-the-config-script-safely).
The rules the templates follow:

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
- **Security notifications are on** — password changed, verification method added /
  removed (`mfa_factor_*`), sign-in method linked / removed (`identity_*`) — so an
  owner learns of a change they didn't make. The two identity emails are purely
  informational: no button and no link at all.

### 4. Settings the script enforces

Field names are the Management API's (`UpdateAuthConfigBody` of
`PATCH /v1/projects/{ref}/config/auth`). Every run asserts:

| Field | Value | Why |
| --- | --- | --- |
| `site_url` | `https://www.irdlex.org` | |
| `disable_signup` | `true` | invite-only — below |
| `mailer_autoconfirm` | `false` | **Confirm email** stays on — below |
| `mailer_allow_unverified_email_sign_ins` | `false` | a provider sign-in with an unverified email is refused |
| `external_anonymous_users_enabled` | `false` | |
| `security_manual_linking_enabled` | `false` | the client's link/unlink endpoints stay off (D-035) |
| `mfa_totp_enroll_enabled`, `mfa_totp_verify_enabled` | `true` | the MFA gate needs both, or nobody can enroll or sign in |
| `password_min_length` | at least `8` | raised when lower; a stricter live value is kept |
| `jwt_exp` | `900` | 15-minute access tokens (D-040) |
| `mailer_otp_exp` | `86400` | email links live 24 h |
| `mailer_notifications_{password_changed, mfa_factor_enrolled, mfa_factor_unenrolled, identity_linked, identity_unlinked}_enabled` | `true` | §3 |
| `uri_allow_list` | gains `https://www.irdlex.org/admin/**`, `https://www.irdlex.org/app/**` and `http://localhost:3000/admin/**` (dev) | append-only: nothing is removed |

**Opt-ins** are written only when their flag is passed; a later run without the
flag leaves them as they are (turn one off in the dashboard):

| Flag | Field | When |
| --- | --- | --- |
| `--require-current-password` | `security_update_password_require_current_password: true` | **required** once the DF-006 admin is live — below |
| `--hibp` | `password_hibp_enabled: true` | Pro plan only |
| `--sessions <h>,<h>` | `sessions_timebox`, `sessions_inactivity_timeout` (hours, `0` = off) | Pro plan only; `/admin` and `/app` share one session, so both are timed out |

On the Free plan the API may refuse a PATCH that carries a Pro field — and with it
everything else in that PATCH — so run `--hibp` / `--sessions` on their own, after
the base settings are in.

**Providers** are managed only when their values are present (environment or
`--secret-file`), and an absent provider is left exactly as it is — the script never
turns one off:

- Google (`GOOGLE_OAUTH_CLIENT_ID`): `external_google_enabled: true`,
  `external_google_client_id`, `external_google_email_optional: false`.
- Microsoft (`AZURE_OAUTH_CLIENT_ID` + `AZURE_TENANT_ID`, both GUIDs):
  `external_azure_enabled: true`, `external_azure_client_id`,
  `external_azure_url: https://login.microsoftonline.com/<tenant GUID>`,
  `external_azure_email_optional: false`.
- `external_google_secret` / `external_azure_secret` are sent **only** with
  `--rotate-secrets`, and never printed.

Why the rest is set the way it is:

- **Sign-ups off** (`disable_signup`). Accounts are invite-only, and GoTrue's admin
  invite (`inviteUserByEmail` in `admin-invite`) ignores the switch. Left on, anyone
  holding the public anon key gets an `authenticated` session — and with
  **Confirm email** off, signing up as a *pending invitee's* address confirms that
  account and hands over its preset role. So Confirm email stays on
  (`mailer_autoconfirm: false`) and anonymous sign-ins stay off. With sign-ups off, a
  Google / Microsoft sign-in can only reach an invited account (below).
- Keep **CAPTCHA** (`security_captcha_enabled`) and **Secure password change**
  (`security_update_password_require_reauthentication`) off: neither admin sends a
  captcha token or a reauthentication nonce, so each would break login, reset or
  Mi cuenta. The script doesn't touch them.
- **Require current password** goes on once the DF-006 admin is live (its Mi cuenta
  sends `current_password`; so does the new admin) — DF-006's release requires it.
  GoTrue checks it only for an account that has a password, in a session not opened
  from an emailed link: invitations, recovery links (also after the MFA step-up) and
  a Google/Microsoft-only account setting its first password are exempt, and a
  missing or wrong current password is refused (`current_password_required`,
  `current_password_invalid`). Verified on the local stack (GoTrue v2.187.0). Then
  `--require-current-password --apply`.

### 5. Check it

[`email-audit.sql`](./email-audit.sql) (read-only, SQL editor) shows the cron jobs,
their recent runs, what the functions answered, whether Vault's `cron_secret`
matches the `CRON_SECRET` function secret, and whether each job still carries it.
Resend → **Emails** logs every message with its delivery status.

## Staff sign-in — OAuth providers, MFA rollout, break-glass

Staff sign in with password + TOTP. Once the new admin (`/app/admin/`) ships, it
also offers Google and Microsoft (Entra ID, the irdlex.org tenant only), federated
through Supabase Auth and still followed by TOTP; the legacy `/admin` keeps
password + TOTP only. Sign-ups stay off, so a provider sign-in only reaches an
invited account: GoTrue links the provider identity automatically when the provider
reports the account's email as **verified**, and answers `signup_disabled`
otherwise. That automatic link is recorded in the Auth audit log
(`identity_linked`); the identity emails (§3) cover links and unlinks made from a
signed-in session.

### OAuth providers — one-time setup

Both providers redirect to the project's callback,
`https://snqwxgyhfiinouewxgiy.supabase.co/auth/v1/callback`. The IDs and secrets they
hand out go into `supabase/.env.auth.local` (next section), never into git.

**Microsoft Entra ID** — Entra admin center → **App registrations → New registration**:

1. **Supported account types:** *Accounts in this organizational directory only*
   (single tenant — "My organization only"). **Redirect URI:** platform **Web**, the
   callback above.
2. **Overview:** *Application (client) ID* → `AZURE_OAUTH_CLIENT_ID`; *Directory
   (tenant) ID* → `AZURE_TENANT_ID`. The script builds
   `external_azure_url = https://login.microsoftonline.com/<tenant GUID>` from it, so
   Supabase accepts ID tokens issued by this tenant only (never `common` or
   `organizations`; it refuses anything but a GUID).
3. **Certificates & secrets → New client secret**, expiry **12 months or less**. Copy
   the *Value* column (not the *Secret ID*) → `AZURE_OAUTH_CLIENT_SECRET`, and set a
   calendar reminder two weeks before it expires. To rotate: new secret in Entra →
   `--rotate-secrets --apply` → sign in once → delete the old secret.
4. **Token configuration → Add optional claim → ID:** `email` and `xms_edov` (accept
   the Microsoft Graph `email` permission it offers); Supabase's guide also adds
   `xms_edov` to the access token. With `xms_edov` in the token, Supabase counts the
   Entra email as verified only when the domain owner verified it.
5. **Drop unverified emails from tokens** — single-tenant apps keep them by default.
   In Graph Explorer, signed in as an Entra admin (consent to
   `Application.ReadWrite.All` if asked):

   ```http
   PATCH https://graph.microsoft.com/v1.0/applications/<Object ID>/authenticationBehaviors
   Content-Type: application/json

   { "removeUnverifiedEmailClaim": true }
   ```

   `<Object ID>` is the app's *Object ID* on **Overview**, not the client ID. Expect
   `204 No Content`; a `GET` on the same URL shows the setting.

Staff then sign in with their irdlex.org Microsoft 365 account, which must be the
address they were invited with.

**Google** — Google Cloud console → **Google Auth Platform**:

1. **Branding:** app name (e.g. *Iglesia Restauración Divina — Panel*), support
   email, authorized domains `irdlex.org` and `snqwxgyhfiinouewxgiy.supabase.co`.
2. **Audience:** *External* (staff use their own Google accounts), then **Publish
   app**. **Data Access:** only `openid`, `…/auth/userinfo.email` and
   `…/auth/userinfo.profile` — basic scopes, which need no Google verification.
3. **Clients → Create client → Web application.** Authorized JavaScript origins:
   `https://www.irdlex.org`. Authorized redirect URIs: the callback above. *Client ID*
   → `GOOGLE_OAUTH_CLIENT_ID`, *Client secret* → `GOOGLE_OAUTH_CLIENT_SECRET`. To
   rotate: add a second secret on the client → `--rotate-secrets --apply` → disable
   and delete the old one.
4. Google refuses its sign-in inside embedded browsers (in-app WebViews); the login
   page tells staff to open Safari or Chrome, and password + TOTP is always offered.

After `--apply`, `GET https://snqwxgyhfiinouewxgiy.supabase.co/auth/v1/settings`
(header `apikey: <anon key>`) should list `"google": true` / `"azure": true` under
`external`: the new admin shows a provider's button only when that endpoint does.

### Running the config script safely

1. **Token.** Create a personal access token (supabase.com → Account → Access
   Tokens) with a short expiry, and revoke it when done. It reaches every project the
   account can, so keep it out of shell history and out of the repo: put it in a file
   outside the repo and pass `--token-file <path>`. The script refuses a token or
   secrets file that git would commit.
2. **Secrets file.** `cp supabase/.env.auth.local.example supabase/.env.auth.local`
   (ignored by `.env.*.local`) and fill it in. Values still in `<angle brackets>` are
   refused; a provider whose lines are empty is left untouched. Never pass a secret
   on the command line — the script has no flag for one.
3. **Dry run** — the default — and read every line:

   ```bash
   node supabase/apply-auth-email.mjs --token-file ~/sb-token --secret-file supabase/.env.auth.local
   ```

   Each change prints as `field: live → new`; secret fields only ever print as
   `«hidden»`, and error text is scrubbed of every secret read. For each provider it
   also says whether the live client secret matches the one in your file (compared by
   fingerprint, never shown or sent).
4. **Apply** with `--apply`. Client secrets travel only with `--rotate-secrets`:
   needed the first time a provider is set up, whenever its client ID changes, and on
   every rotation — the script refuses to enable a provider that has no secret live.
5. **Clean up:** delete `supabase/.env.auth.local` and revoke the token. The
   provider console stays the source of truth for the secret.

### Rollout order

Each step is finished before the next one starts.

0. **Pre-flight.** Run [`sql/preflight-auth.sql`](./sql/preflight-auth.sql)
   (read-only, SQL editor) and the script's dry run. TOTP enroll + verify must be
   **on** before step 1 — if the dry run lists `mfa_totp_*_enabled`, `--apply` the
   base settings now (no secrets file needed). Check each developer's factors and
   last verified challenge (an old factor may be on a lost phone), the accounts
   without a factor, the Administrador holders and `pause_invites`.
1. **Legacy MFA gate (DF-006).** Every developer passes a real TOTP challenge on the
   new gate — a local build, or right after the deploy with break-glass ready —
   before it reaches `main`; staff then enroll at their next sign-in. Keep at least
   two developers who have passed it. Then switch on **Require current password**
   (Dashboard → Authentication, or `--require-current-password --apply` — see
   [Settings the script enforces](#4-settings-the-script-enforces)).
2. **Enrollment cutoff.** On the announced date, reset, notify or remove every account
   still without a factor (pre-flight lists them). This comes before the providers:
   from then on every account that can sign in already has its own factor.
3. **Server-side enforcement.** Tag the source of the `admin-invite` deployed today so
   it can be redeployed: `git tag pre-authz-YYYYMMDD a8749cf && git push origin pre-authz-YYYYMMDD`.
   `a8749cf` is the `develop` commit this hardening branched from; its `admin-invite`
   is the one on `main` (last changed in `799437f`, 2026-07-01) — if you have deployed
   `admin-invite` from another commit since, tag that one instead. Apply any
   pending migration files, then paste
   [`migrations/20261019000001_enforce_mfa_and_tiers.sql`](./migrations/20261019000001_enforce_mfa_and_tiers.sql)
   into the SQL editor as one run. Re-run `preflight-auth.sql`: its catalog query must
   return no table or bucket without the aal2 layer. **Only then**
   `supabase functions deploy admin-invite`. The migration is idempotent; re-run it
   after applying any later migration file.
4. **Providers.** Set up Entra and Google (above), then
   `--secret-file supabase/.env.auth.local --rotate-secrets` — dry run, then `--apply`.
5. **New admin.** Ship the port (`web/`, served at `/app/`) and announce
   `https://www.irdlex.org/app/admin/` to staff: Google / Microsoft sign-in lives
   there; tabs not ported yet open in the current panel.

### Rollback

- **Server side:** run [`sql/rollback-auth.sql`](./sql/rollback-auth.sql) in the SQL
  editor, then redeploy the previous `admin-invite` from the tag:

  ```bash
  git worktree add ../irdlex-rollback pre-authz-YYYYMMDD
  cd ../irdlex-rollback && supabase functions deploy admin-invite --project-ref snqwxgyhfiinouewxgiy
  ```

- **Legacy MFA gate:** revert it only together with the server-side rollback — the
  database layer expects sessions that passed the gate.
- **Providers:** Dashboard → Authentication → Sign In / Providers → switch Google or
  Azure off. The script never turns a provider off.
- **Opt-ins** (require current password, leaked-password check, session limits):
  switch them off in the dashboard; a later run without the flag leaves them off.
- **New admin:** revert its merge; `/admin` is unaffected.

### Break-glass (dashboard owner, SQL editor)

- **Lost authenticator** — any account, the last developer included:

  ```sql
  delete from auth.mfa_factors where user_id = '<user uuid>';
  ```

  Its challenges go with it; the user signs in with the password and enrolls a new
  factor straight away. No email is sent for this, so tell the user. If the account
  may be compromised, also end its sessions (what `admin_revoke_user_sessions` does;
  an access token already issued lives out its 15 minutes):

  ```sql
  delete from auth.sessions where user_id = '<user uuid>';
  ```

- **Last developer** — the `trg_guard_last_developer` trigger on `public.profiles`
  refuses any update or delete (including one cascaded from `auth.users`) that would
  leave no developer. To make such a change on purpose, switch it off for that one
  change, in one transaction, so it can't stay off:

  ```sql
  begin;
  alter table public.profiles disable trigger trg_guard_last_developer;
  -- the change it would refuse, e.g. delete from auth.users where id = '<user uuid>';
  alter table public.profiles enable trigger trg_guard_last_developer;
  commit;
  ```

  Access changes made here are still written to `audit_log`: the access-audit
  triggers stay on.

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
