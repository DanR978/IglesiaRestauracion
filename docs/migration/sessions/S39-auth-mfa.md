# Session S39 — Sign-in, the second factor, OAuth and the email-link routes

**Stream:** admin (auth screens)
**Depends on:** S38 (the auth module and the session store), the PR-C2 primitives (FormField, PasswordField, CodeInput, Alert, Button, StateError, ReadonlyField), S37 (the admin layout, the `(app)` guard, `#lib/auth/notice.ts`, `signOutAndLeave` — merged in at `86e940c`), PR-B (D-033/D-034 server rules) **PR:** PR-C2 (not opened yet) **Branch:** `c2/s39` → `migrate/S37-S45-admin`
**Status:** 🟦 built on the branch — PR-C2 not opened yet

## Goal (one sentence)

The staff sign-in surface of the new admin — password sign-in, Google / Microsoft (D-035), the mandatory second factor as two distinct states (D-033), the OAuth callback, the invitation and recovery links on the legacy email contract, the recovery request and the no-access page — consuming the S38 auth module and session store.

## In scope

- Routes `web/src/routes/(admin)/admin/acceso/**` (outside the guarded `(app)` group): `+layout.svelte` (the card frame), `+page.svelte` (sign in), `verificar/`, `oauth/`, `invitacion/`, `restablecer/`, `recuperar/`, `sin-acceso/`.
- Feature components `web/src/lib/components/admin/auth/`: `AccessHeading`, `ProviderButtons`, `MfaChallenge`, `MfaEnroll`, `EmailLinkFlow`; pure modules `auth-url.ts`, `oauth-callback.ts`, `destination.ts`, `handoff.ts`.
- `web/src/lib/auth/session.ts` — one minimal change: `requestPasswordReset` returns to the legacy `/admin/` (below).
- Test harness: `web/playwright.config.ts` gives the e2e build a same-origin Supabase; `web/tests/e2e/helpers/supabase.ts`; S37's `tests/e2e/admin-shell.spec.ts` adapted to it (merge, below).
- Tests: `tests/unit/acceso/*`, `tests/component/acceso/*`, `tests/e2e/admin-acceso.spec.ts`; `tests/unit/auth/session.test.ts` follows the redirect change.

## Out of scope (do NOT touch)

- The shell, the `(app)` group, `hooks.server.ts`, `(admin)/admin/+layout.*` (S37). The legacy panel and its email templates (D-001 until S64). The database, GoTrue settings, `admin-invite`. `web/budget.json` (the integrator re-baselines).

## Prereqs

- [x] The plan (D-033…D-041, PR-C2 item 7), the visual brief, DESIGN-SYSTEM §1/§4/§5/§6, `docs/architecture/design-system.md`, `target-architecture.md` §3–§9 (§5 above all), PORT-DEBT S39, `docs/admin-ux.md`, MIGRATION.md §2–§3, the S38 / S40 / S02b / S05b / S22b / S37 session files.
- [x] Legacy source of truth: DF-006's `js/pages/admin/auth.js` and `mfa.js` (`fix/DF-006-mandatory-mfa`, read-only) — `boot()` steps 0–2, `routeAfterLogin`, `showMfaChallenge` / `showMfaEnroll`, `startRecovery`, `submitSetPassword`, `submitForgot`, `cancelMfa`; the auth cards in `admin/index.html`.
- [x] Installed library behaviour read from source: auth-js 2.112.3 (`exchangeCodeForSession` reads `sb_flow_id` from `window.location` when no flow id is passed; the missing-verifier error is thrown before any request; `handleError` takes `code` with the API-version header; `decodeJWT` refuses a segment whose length is 1 mod 4), Kit 3.1.0 (`goto` / shallow `goto` / history metadata, `reset_focus` only when `document.activeElement === body`, `started` set one microtask after the first render), GoTrue v2.187's QR (`fill:black/white` SVG, no `#`) and its OAuth callback error redirects.

## What changed

### The pages

| URL (`/app` + …)            | States                                                                                                                                                                               | Leaves for                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `admin/acceso/`             | the form · the shell's notice (`?aviso=`, read with `signInNoticeFrom`, then scrubbed) · field errors · a refusal (Alert) · busy · providers after the form                          | a session that already exists, at once; after a sign-in, the settled status (below) |
| `admin/acceso/verificar/`   | checking · **challenge** (CodeInput; any verified factor) · **enroll** (which apps, QR, the key in fours with a copy button, CodeInput) · an unsupported factor · error + Reintentar | `next` once aal2; signed out → sign-in; no access → sin-acceso/                     |
| `admin/acceso/oauth/`       | working · failed (mapped copy; Reintentar only after a dropped connection) · incomplete                                                                                              | verificar/ (a provider sign-in is aal1), then `next`                                |
| `admin/acceso/invitacion/`  | checking · step-up (if a factor exists) · **password** (+ Google / Microsoft) · invalid (ask for a new invitation) · error + Reintentar                                              | verificar/ to enroll                                                                |
| `admin/acceso/restablecer/` | checking · **step-up first** (a factor exists) · password · invalid ("Pedir un enlace nuevo") · error + Reintentar                                                                   | Inicio (stepped up) or verificar/ (no factor yet)                                   |
| `admin/acceso/recuperar/`   | the form · sent ("Si la cuenta existe…") · too many attempts / no connection                                                                                                         | —                                                                                   |
| `admin/acceso/sin-acceso/`  | checking · **forbidden** (names the account, "Cerrar sesión") · error + Reintentar                                                                                                   | anyone else moves on                                                                |

Where a settled session goes (`destination.ts`, shared by every page): `ready` → `next` · `needs-mfa` / `needs-enroll` → verificar/ (keeping `next`) · `forbidden` → sin-acceso/ · `signed-out` / `expired` → sign-in · `error` → stay with Retry. Every such move replaces the history entry (an SPA `goto`), so Back never lands on a spent link, a callback or a code step. `next` is always read through `safeNext()`. The deliberate exits — "Cancelar y cerrar sesión" (both factor states, the step-up of a link) and sin-acceso's "Cerrar sesión" — are the shell's `signOutAndLeave('local')`: this device only, then a full page load into the sign-in page with "Sesión cerrada." (nothing of the session stays in memory, as legacy's reload).

Every page: the h1 takes focus when a step appears (`AccessHeading`, tabindex −1, no ring — like `main:focus`) and owns its tab title "‹step› · Panel · Iglesia Restauración Divina"; autocomplete `username` / `current-password` / `new-password` / `one-time-code`; errors in Spanish, announced (`role="alert"` / FormField's live error), never GoTrue's text; targets ≥ 44px; no sideways scroll at 360px; light and dark through tokens only. The card hangs from the top instead of being centred vertically, so a step that grows never shifts what is above it (lab CLS ≤ 0.015 on every acceso page), and the provider buttons arrive _after_ the form (nothing reserved, nothing above moves).

### The components

- `AccessHeading` — h1 + `<svelte:head><title>`; `{#key title}` re-mounts it, so a new step re-takes focus.
- `ProviderButtons` — fetches `fetchEnabledProviders()` itself; renders nothing until it lists one; one top-level redirect per press, spinner cleared on a back/forward-cache return; the Safari/Chrome hint ships with the buttons.
- `MfaChallenge` — prepares the challenge (no TOTP factor → `onNeedsEnroll`, or "un método que este panel no admite" for a verified phone/passkey factor); submits on the sixth digit; a wrong code clears the field and refocuses it; cancel and verify exclude each other (DF-006).
- `MfaEnroll` — teach step, QR `<img alt="Código QR para tu app de autenticación">` in a fixed white square (scanners need the quiet zone in dark mode too), never a previous attempt's QR while a new one loads, the key in a two-row read-only field in groups of four (all 32 characters readable at 360px; "Copiar clave" copies it without spaces, with a status line; a refused clipboard selects the key), `insufficient_aal` → `onNeedsChallenge`, cancel = `cancelEnroll()` then the page's sign-out.
- `EmailLinkFlow` — both link pages: the redirect-unspent rule, read + scrub, `verifyOtp`, step-up-before-password, the password form (strength meter, live mismatch, a hidden `autocomplete="username"` field with the account's email for password managers, the account named in a ReadonlyField), the outcomes.

### `#lib/auth/session.ts`

`requestPasswordReset` sends `redirectTo = <origin>/admin/?action=reset-password` (`RESET_REDIRECT_PATH`), byte for byte what legacy sends and inside the `/admin/**` entry `supabase/apply-auth-email.mjs` keeps on the redirect allow-list: the email template builds the real link. ROUTES.reset takes over at the cutover (S64).

### Test harness

- **Same-origin Supabase for the e2e build.** `playwright.config.ts` builds with `PUBLIC_SUPABASE_URL = <preview origin>/__supabase` (the plan's mocked-suite design). The sign-in pages call Supabase the moment they open (`/auth/v1/settings`), so with the old `127.0.0.1:54321` value the axe spec would have flagged every acceso page — and `/admin/`, which redirects there — as off-origin, and locally it would have reached the running stack. A spec answers `/__supabase/**` with `page.route` (`helpers/supabase.ts`: GoTrue/PostgREST-shaped answers, unsigned three-part JWTs, unanswered calls recorded); anything unanswered gets the preview's 404. The network guard is unchanged: preview origin + pinned CDN only. The session storage key under this build is `sb-localhost-auth-token`.
- **`$app/navigation` under Vitest:** S39 added a stub; the merge kept S37's (router-like spies over its `$app/state` stub), which covers it — one set of `$app` aliases and stubs. The acceso tests `vi.mock` it.

### The merge with S37 (`86e940c`, then the follow-up commit)

- **Notice contract:** S39's own `?aviso=` carrier (`loginHref` / `loginNoticeFor` in `handoff.ts`) is gone; the sign-in page reads S37's `#lib/auth/notice.ts` (`signInNoticeFrom`, `SIGN_IN_NOTICES`) and shows it as a calm info Alert, then scrubs `aviso` (keeping `next`). `handoff.ts` keeps only the carried email.
- **Sign-out:** the acceso pages use S37's `signOutAndLeave('local')` (above).
- **S37's `admin-shell.spec.ts`, adapted to the merged behaviour:** its fake backend answers the same-origin `/__supabase` path and seeds `sb-localhost-auth-token`; the email-contract test asserts the token invitacion/ spends (`POST /auth/v1/verify` with `token_hash=abc123`) instead of the query in the address bar, which invitacion/ now scrubs at once; the logout test asserts the "Sesión cerrada." the sign-in page shows instead of `?aviso=` in the address, which it now scrubs.

## Decisions and deviations (with the reason)

1. **Scrub before the exchange** on oauth/ (the S38 landmine said after). The brief asks for an immediate scrub, and the code is kept in memory; auth-js only reads the address for `sb_flow_id`, which this app never asks GoTrue for (no `appendPkceFlowIdToRedirects`), so the newest stored verifier is used either way. `history.replaceState(history.state, '', clean)` keeps Kit's history bookkeeping; Kit's own shallow `goto` would copy the old URL — token included — into the entry's state. In `npm run dev` Kit prints one "history API" warning for it.
2. **The callback's copy is its own mapping** (`oauth-callback.ts`), keyed by GoTrue's `error_code` then `error`, with the brief's sentences; `AUTH_ERRORS` keeps its OAuth entries for other callers. `provider_email_needs_verification` shares the "no invitation" sentence (it already names an unconfirmed email); `user_banned` keeps its own ("suspendida") rather than the generic one — it is actionable and not a provider error.
3. **One notice carrier: S37's `#lib/auth/notice.ts`** (coordinator, at the merge). Both notices are a calm `info` Alert; `aviso` is a one-time value and leaves the address once read.
4. **Invitation and recovery both step up** when the account already has a verified factor (legacy did it for recovery only). GoTrue refuses a new password at aal1 in either case; an `insufficient_aal` on save also returns to the code step, with the typed passwords kept.
5. **A link for the other page goes there unspent.** `emailLinkTarget()` (the guard's own rule) decides; the token is only spent by the page it belongs to.
6. **sin-acceso/ does not sign out on its own** (legacy `bootApp` did): it names the account and offers "Cerrar sesión".
7. **No "(obligatorio)" markers** on these one- and two-field forms: every field is needed, and the validation says so in words.
8. **Navigation lives in `destination.ts`** with one documented `svelte/no-navigation-without-resolve` disable: every target is already resolved (ROUTES, `safeNext()`, `emailLinkTarget()`); the rule cannot see that and also applies to `.ts`. (Not S37's `shell.ts` `leaveTo`, which is a full page load for after a sign-out.)
9. **The setup key is shown in groups of four on two rows** (a read-only textarea): a single-line field cut it off at 360px, and people type it.

## PORT-DEBT coverage (S39)

| Item                                                                                                                   | Where                                                                                                                                                                             | Status                                           |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| MUST FIX: enforce MFA (client half: no admin page below aal2)                                                          | verificar/ + `destination.ts`; the guard (S38, wired by S37)                                                                                                                      | ✅ client; the server half is PR-B (D-033/D-034) |
| MUST FIX: a real CodeInput (`inputmode=numeric`, `one-time-code`, digits only, segmented, paste, error clears on edit) | `MfaChallenge`, `MfaEnroll` (the primitive)                                                                                                                                       | ✅                                               |
| MUST FIX: show/hide toggle + strength on invite/reset and login                                                        | PasswordField on sign-in (toggle) and on both link pages (toggle + meter + confirm)                                                                                               | ✅                                               |
| MUST FIX: errors first-class through Alert, text only                                                                  | every page (Alert / StateError / FormField errors; never `{@html}`)                                                                                                               | ✅                                               |
| MUST FIX: split the MFA card into enroll (teach / QR / secret) vs challenge                                            | verificar/ — two components, two headings                                                                                                                                         | ✅                                               |
| DO NOT PORT: the optional-MFA shortcut                                                                                 | `destination.ts` never sends aal1 into the admin                                                                                                                                  | ✅                                               |
| DO NOT PORT: inline `onsubmit="return false"`                                                                          | real submit handlers with `preventDefault`                                                                                                                                        | ✅                                               |
| DO NOT PORT: the `.auth-card` ↔ `auth-animation.css` coupling                                                          | scoped styles in the acceso layout                                                                                                                                                | ✅                                               |
| PRESERVE: "Si la cuenta existe…" (no enumeration)                                                                      | recuperar/: the same sentence for every outcome but too many attempts / no connection                                                                                             | ✅                                               |
| PRESERVE: scanner-safe `token_hash` + `verifyOtp`, expired-link handling                                               | `EmailLinkFlow` (nothing spent before the script runs; expired / used / broken → next step)                                                                                       | ✅                                               |
| Plan: login carries the email to recuperar/ in memory (WCAG 3.3.7)                                                     | `handoff.ts` (`carryEmail`) both ways                                                                                                                                             | ✅                                               |
| Plan: one consistent help line (WCAG 3.2.6)                                                                            | acceso `+layout.svelte`                                                                                                                                                           | ✅                                               |
| Plan: `redirectTo` from `resolve()` + trailing slash, unit-tested                                                      | `oauthRedirectUrl` (S38) — asserted again end to end (`redirect_to` = `<origin>/admin/acceso/oauth/`)                                                                             | ✅                                               |
| Plan: the admin index honours the legacy email contract                                                                | S37's `/admin/` → `guardAdmin` → `emailLinkTarget` (S38) → these pages accept the query as is (e2e: the token from `/admin/?action=accept-invite…` is the one invitacion/ spends) | ✅                                               |

## Behaviour diffs vs legacy (review these)

1. **MFA is mandatory** (D-033) — an aal1 session never opens the panel; recovery _and_ invitation step up first when a factor exists.
2. **Errors come from GoTrue codes**, never English text (legacy's message-substring fallback is gone); the OAuth callback has its own sentences.
3. **Google / Microsoft** exist only here (legacy keeps password + TOTP), only when the project enables them.
4. **The sign-in screens are their own URLs** with their own titles; steps replace the history entry.
5. **A missing profile is a page with a choice** (sin-acceso/), not an automatic sign-out with an error on the login card.
6. **"Cancelar y cerrar sesión"** reloads into the sign-in page with "Sesión cerrada." (legacy reloaded silently); enrollment removes the unverified factor first.
7. **The recovery email still returns to `/admin/`** (legacy address) until S64.
8. **Copy**: "Entrar" on the button, "Iniciar sesión" as the title, "Protege tu cuenta" / "Verifica tu identidad" for the two factor states, sentence case throughout.

## Security checklist — OWASP ASVS 5.0 Level 2, the parts S39 owns (VERIFICATION box 19)

```
V6 Authentication
  6.2.1/6.2.9  ≥ 8 characters, up to GoTrue's 72-byte bcrypt limit (said before the request) — the server enforces
  6.2.4/6.2.11 common and context passwords refused by the meter before submit (church words included); breached-
               password checking (6.2.12) is GoTrue HIBP — Pro plan only, recorded in PR-B
  6.2.5/6.2.10 no composition rules, no rotation
  6.2.6/6.2.7  type=password with a show toggle; paste and password managers never blocked; autocomplete tokens
  6.3.1        anti-automation is GoTrue's rate limiting; the screens surface it ("Demasiados intentos")
  6.3.3        a second factor for every staff account (D-033); the server half is PR-B's aal2 layer
  6.3.4        every pathway (password, Google, Microsoft, invite, recovery) ends at the same TOTP step
  6.4.3        recovery cannot bypass the second factor: the code comes before the new password
  6.5.1        EXCEPTION: GoTrue v2.187 accepts the same TOTP code again within its window (found by the
               local-stack integration suite) — single use isn't enforced server-side; recorded, not fixable here
  6.5.5        the code's lifetime (30 s step, ±1 window) is GoTrue's; a code from ANY verified factor is accepted
  6.8.1/6.8.4  provider identities link only to an invited account by verified email (auto-link, manual linking off,
               D-035); a provider sign-in is aal1 and still steps up — provider AMR is never trusted for aal2
V7 Session Management
  7.2.4        a new session on every sign-in, code and link (GoTrue); the store re-reads on each
  7.4.1        "Cerrar sesión" / cancel = signOutAndLeave('local'): the server hears the sign-out, the local session
               is removed even offline, and a full page load leaves nothing of it in memory
  7.6.2        a session starts only from an explicit action (a submit, a button, a link the person opened); tokens
               are scrubbed from the address before any request
  7.3.1/7.3.2/7.5.2  recorded exceptions (D-040): no client idle timeout while two admins share one session
V8 Authorization
  8.3.1        nothing here decides access: the store's status is UX; RLS + the aal2 layer are the guard (D-002/D-034)
  8.2.1        unknown roles and missing profiles fail closed (sin-acceso/); `next` only ever a same-app admin path
               (safeNext); no open redirect through `next`, the OAuth `next`, or an email link
```

## WCAG 2.2 notes (VERIFICATION box 16)

- **3.3.7 Redundant Entry (A).** The email typed on the sign-in page arrives in recuperar/ and comes back (memory, never the URL); the invite/reset password step names the account and hands it to password managers (`autocomplete="username"`); `next` survives sign-in → verificar/ → the page asked for; the OAuth `next` survives the provider round trip.
- **3.3.8 Accessible Authentication (Minimum) (AA).** No cognitive test without a mechanism: passwords are fillable by password managers (correct tokens, paste allowed, no paste handler), the code field takes paste and OS one-time-code autofill, the TOTP code is copied from a device (not recalled), and enrollment offers both a QR and a copyable key. Google / Microsoft are an alternative path where enabled.
- **3.2.6 Consistent Help (A).** "¿Problemas para entrar? Escribe a contactanos@irdlex.org" in the same place (after the card) on every acceso page.
- Also: 2.4.2 page titles per step; 2.4.3 focus moves to the new step's heading; 2.4.11 nothing sticky covers focus; 2.5.8 targets ≥ 44px (inline links in sentences excepted); 1.3.5 input purpose; 3.3.1/3.3.3 errors identified with a suggestion; 4.1.3 status messages (`role="status"` / `alert`).

## Test counts

| Suite                                                                                                                   | Added                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `tests/unit/acceso/` (auth-url 11 · oauth-callback 18 · destination 13 · handoff 2)                                     | 44                                          |
| `tests/component/acceso/` (login 27 · verificar 20 · oauth 16 · email-links 25 · recuperar 9 · sin-acceso 6 · layout 3) | 106                                         |
| `tests/e2e/admin-acceso.spec.ts`                                                                                        | 21 × 4 projects = 84                        |
| `tests/e2e/a11y.spec.ts` (picks up the new pages itself)                                                                | 7 acceso pages × 2 themes × 4 projects = 56 |
| `tests/unit/auth/session.test.ts`                                                                                       | 1 changed (the legacy redirect)             |

The e2e spec drives the real auth-js against in-process answers: password refusal, Spanish validation, the notice (shown once, then scrubbed with `next` kept), the email carried to recuperar/ and its non-committal / rate-limit answers, provider buttons only when enabled, **Google end to end** (the real `signInWithOAuth` → `/authorize` answered with an HTML hop to the callback — Playwright's WebKit cannot fulfill a navigation with a 3xx → PKCE exchange with the stored verifier → profile + factors → verificar/ enrollment with the QR and key), five callback failures from query and fragment (scrubbed, never the raw description, no exchange sent), and the legacy email contract on both link pages (token sent once, address scrubbed, a recovery with an authenticator asking for the code before any password field exists, a link for the other page forwarded unspent).

## Verification gate (after the S37 merge)

```
[x]  2. Typecheck         npm run check → 814 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npx eslint . → 0 problems · npx prettier --check --end-of-line auto . → all files pass
[x]  4. Unit tests        npm run test → 117 passed | 1 skipped files · 3044 passed | 2 skipped
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → build/admin/acceso/{,verificar,oauth,
                          invitacion,restablecer,recuperar,sin-acceso}/index.html + build/admin/index.html
[x]  8. Legacy untouched  only web/** and this file
[x] 12. Secrets/PII clean synthetic users and unsigned test JWTs only; no keys
[x] 14. Cross-engine e2e  E2E_PORT=4188 npx playwright test admin-acceso admin-shell a11y → 432 passed (3.2 min):
                          per project 21 admin-acceso + 17 admin-shell + 70 a11y, chromium · webkit · Mobile Safari ·
                          Mobile Chrome; 0 failed, 0 flaky
[x] 15. Automated a11y    34 pages × 2 themes × 4 projects: 0 serious/critical (8 admin pages included)
[ ] 17. Performance       npm run budget → the 8 new admin pages have no baseline (expected: 135.7–149.5 kB);
                          every existing page is now over its +5% (e.g. / 44.5 kB vs limit 42.3) — see Findings
                          perf.spec.ts (CI=1, 2 workers, chromium) → admin shells LCP 7.0–9.1 s, CLS ≤ 0.015 —
                          see Findings; every non-admin page passes (1.9–2.3 s)
[x] 19. Security list     above (ASVS 5.0 L2 V6/V7/V8)
```

## Findings for the integrator / owner (not fixed here — they need a decision)

1. **Box 17 lab LCP cannot be met by any `ssr = false` admin shell (D-036) in this harness.** The shells paint only after Kit's client and the route's whole static graph arrive, and `vite preview` speaks HTTP/1.1 (six connections, 562 ms per request on the Slow 4G profile, G-041). Measured before the merge: a probe page with nothing but the heading (no auth module) **3.7 s with 22 JS requests**; the acceso pages 4.9–6.9 s (supabase-js and the auth module on the critical path: +~1.3 s); after the merge, with the admin layout's overlay hosts on every admin page, 7.0–8.9 s, and S37's `/admin/` 9.1 s. SSR kit pages pass at 1.9–2.3 s because their content is in the HTML. CLS is fine everywhere (≤ 0.015). CI's `e2e` job runs `perf.spec.ts` and will fail on these pages. Options: an HTTP/2 preview for the lab run; a separate, recorded budget for D-036 shells; trimming the critical path (supabase-js loaded lazily inside `#lib/auth/*`, the overlay hosts mounted on first use, chunk consolidation).
2. **The JS budget of existing pages grew.** Under the CI placeholder env, S39 alone added ~1.5 kB gzip to every page: Kit's `goto` is now reachable (the acceso pages are the first app code to call it, so it is no longer tree-shaken from the shared Kit chunk, +0.4 kB), the client route manifest in `app.js` lists every route's dependencies (+0.8 kB for 8 nodes), and Rollup split `#lib/config` and `$app/env` into shared chunks once a second importer appeared (+0.2 kB). With S37 merged, `/` is 44.5 kB against a 42.3 kB limit. Structural; `budget.json` is the integrator's to re-baseline.

## Landmines (S41, S45 and the integrator read these)

1. **Prerendered pages without a budget entry:** `/admin/`, `/admin/acceso/`, `verificar/`, `oauth/`, `invitacion/`, `restablecer/`, `recuperar/`, `sin-acceso/`.
2. **The e2e build's Supabase is `/__supabase` on the preview** (`playwright.config.ts`, `helpers/supabase.ts`): a spec that seeds a session uses `sb-localhost-auth-token`, and answers `/__supabase/**`; an off-origin route never sees the app's calls.
3. **Pages that read one-time values scrub them at once** (acceso/: `aviso`; oauth/: everything; the link pages: everything). Assert what the page does with them, not the address bar.
4. **`resolve()` and `ROUTES`:** once S45 adds `cuenta/`, `routes.ts` can call the typed `resolve('admin/…/')` (S38 landmine 1).
5. **Do not centre the acceso card vertically** — it would re-centre (and shift) whenever a step grows.

## How to resume if interrupted

- Branch `c2/s39`: `af4228d` (e2e same-origin Supabase), `b79d8a8` (S39), `86e940c` (merge of `migrate/S37-S45-admin`), then the follow-up commit adopting S37's notice and sign-out.

## On completion (PR-C2 ledger step)

- [ ] MIGRATION.md: S39 on the board; candidate gotchas — Kit 3 `goto` before `started`; Svelte 5's trailing scope class is a zero-specificity `:where()` (a component that restyles a FormField control needs two classes); `vite preview`'s HTTP/1.1 makes D-036 shells miss lab LCP (Finding 1).
- [ ] ROADMAP S39 row → done; PORT-DEBT S39 row → pointer to this file.
