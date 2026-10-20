# ADR-0005 — Staff sign-in with Google and Microsoft, federated through Supabase Auth

- **Status:** Accepted on merge of this change (2026-10-19)
- **Ledger:** D-035 (`MIGRATION.md` §2)
- **Keeps:** [ADR-0001](ADR-0001-church-center-link-out.md) item 4 — Supabase Auth remains the only
  identity provider the app talks to.

## Context

- The owner asked for OAuth sign-in for staff (2026-10-17) and chose Google and Microsoft.
- Staff accounts are invite-only, and every one of them passes a TOTP second factor (D-033); the
  database requires a two-factor session (D-034).
- The site is static (GitHub Pages). There is no server to hold a client secret or exchange an
  authorization code, and RLS only understands sessions that Supabase Auth issues.
- Staff may open the admin from Church Center's in-app browser (ADR-0001). Google refuses OAuth in
  embedded WebViews ([Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)),
  and RFC 8252 §8.12 forbids embedded user-agents for authorization.

## Decision

1. Google and Microsoft Entra are **Supabase Auth providers**. The browser runs the
   authorization-code flow with PKCE against Supabase Auth, which exchanges the code with the
   provider and issues an ordinary Supabase session. The client secrets live only in the Supabase
   project — set with `supabase/apply-auth-email.mjs --rotate-secrets` from a local, gitignored
   env file — never in the client or the repository.
2. **Invite-only stays.** Sign-ups are disabled, so a provider sign-in reaches only an account an
   administrator invited: Supabase Auth links the provider identity to that account when the
   provider asserts the same, verified email address. Manual identity linking stays off.
3. **Microsoft is single-tenant.** The provider URL names the church's tenant by GUID, and the app
   registration emits the `email` and `xms_edov` optional claims with `removeUnverifiedEmailClaim`
   set, so only verified addresses are ever asserted.
4. **OAuth doesn't replace the second factor.** A provider sign-in yields a one-factor session; the
   admin asks for the TOTP code before it opens, and the database refuses staff data until then.
5. **Password + TOTP remains** on the sign-in screen. Provider buttons appear only for providers the
   project reports enabled (`GET /auth/v1/settings`). The screen asks people inside an app's browser
   to open Safari or Chrome, without user-agent sniffing.
6. The provider buttons live in the new admin (`/app/admin/acceso/`, S39). The legacy `/admin`
   keeps password + TOTP only.

## Consequences

- **+** No server and no secret in the browser. RLS and the two-factor layer see one kind of session.
- **+** A lost provider account locks no one out (password + TOTP remains), and the reverse.
- **−** From the moment an invitation exists, the invitee's Google or Microsoft account can sign in
  to it. So every existing account must have its own factor before providers are enabled (the
  rollout runbook in `supabase/README.md` orders it that way).
- **−** Client secrets expire. Entra's is set to 12 months, with a calendar reminder and
  `--rotate-secrets`.
- **−** Google sign-in fails inside embedded WebViews; password + TOTP is the fallback there.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Google Identity Services / MSAL in the browser, minting our own sessions | Needs a server to verify tokens and a second session system that RLS can't see |
| Planning Center OIDC | Only covers people with Planning Center logins (ADR-0001) |
| Manual identity linking from Mi cuenta | One more client-reachable way to change how an account signs in; verified-email linking already covers invited staff |
| Multi-tenant Microsoft (`common`) | Any Microsoft account could reach the sign-in; single-tenant limits it to the church's directory |

## Revisit triggers

The church leaves its Microsoft tenant · a staff member needs another provider · Supabase Auth gains
per-provider assurance rules.
