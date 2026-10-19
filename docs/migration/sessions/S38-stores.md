# Session S38 — Session / perms / ministries stores, the access oracle and the auth module

**Stream:** admin (state + auth plumbing)
**Depends on:** S40 (the `profiles` / `ministries` repos, same branch), S15/S16 (toast and confirm stores), S22b (repo results), PR-B (D-033/D-034 server rules)   **PR:** PR-C2 (not opened yet)   **Branch:** `c2/s40-s38` → `migrate/S37-S45-admin`
**Status:** 🟦 built on the branch — PR-C2 not opened yet

## Goal (one sentence)
One place that knows who is signed in and what they may open — the auth-state store, the D-006 surface oracle, the mandatory-MFA access decision (D-033), the guard for the admin layout — plus the thin Supabase Auth wrappers S39 (sign-in screens) and S45 (Mi cuenta) build on.

## In scope
- `web/src/lib/db/client.ts` — auth options: PKCE, no URL detection, default storage key; exported `AUTH_OPTIONS`.
- `web/src/lib/auth/` (new): `access.ts`, `surfaces.ts`, `guard.ts`, `next.ts`, `routes.ts`, `errors.ts`, `session.ts`, `mfa.ts`.
- `web/src/lib/stores/{session,perms,ministries}.svelte.ts` (new).
- `web/eslint.config.js` — the `auth` layer (both the static and the dynamic-`import()` rule, via `restrict()`); `tests/unit/layer-boundaries.test.ts` follows.
- `web/vitest.config.ts` + `tests/stubs/app-paths.ts` + `tests/helpers/app-paths.ts` — a `$app/paths` stand-in.
- Tests: `tests/unit/auth/*`, `tests/unit/stores/*`, `tests/unit/client.test.ts`.

## Out of scope (do NOT touch)
- Routes and UI: the `(admin)` layout, the `(app)` group's `+layout.ts` that calls `guardAdmin`, the shell (S37); the `acceso/*` pages (S39); Mi cuenta (S45); Inicio (S41).
- Legacy files; the database; `admin-invite`.

## Prereqs
- [x] The plan (D-033…D-041, PR-C2 items 5–7), `target-architecture.md` §3–§9, PORT-DEBT S37/S38/S39/S45 rows, MIGRATION.md §2–§3.
- [x] Legacy: `js/pages/admin/{state,index,auth}.js` (`applyTabAccess`, `boot`, `routeAfterLogin`), `admin/index.html` nav, `css/pages/admin/shell.css` gating; the DF-006 branch (`fix/DF-006-mandatory-mfa`): `mfa.js`, `auth-errors.js`, `account.js`.
- [x] Server rules: `20261019000001_enforce_mfa_and_tiers.sql` (aal2 layer, `account_has_system_tab`), `admin-invite/lib.ts` (`OPERATIONAL_TABS`, `ADMIN_SYSTEM_TABS`, `BASE_ROLES`), `supabase/README.md` "Staff sign-in".
- [x] Installed library behaviour read from source (supabase-js / auth-js 2.112.3, Kit 3.1.0): see Landmines.

## What changed

### `db/client.ts`
`AUTH_OPTIONS = { flowType: 'pkce', detectSessionInUrl: false, persistSession: browser, autoRefreshToken: browser }`, no `storageKey` — the default `sb-<ref>-auth-token`, which is the legacy `/admin`'s session (D-040). The OAuth callback route exchanges the code itself; email links keep working because they carry a `token_hash` for `verifyOtp`, which a PKCE client accepts in any browser (verified on this stack by the coordinator, and by the local-stack check below).

### `auth/` — the one non-repo module that uses the client
| Module | Exports | Notes |
|---|---|---|
| `access.ts` | `resolveAccess(input): AccessState`; `AccessState`, `AalLevel`, `AccessInput` | pure; order: session → profile (forbidden) → aal2 (ready) → factors (needs-mfa / needs-enroll) |
| `surfaces.ts` | `SURFACES`, `visibleSurfacesFor(profile)`, `capabilitiesFor(profile)`, `ROLE_LABELS`; `Surface`, `SurfaceKey`, `SurfaceGroup`, `Capability`, `AccessProfile` | the D-006 oracle |
| `guard.ts` | `emailLinkTarget(url, hash?)`, `accessTarget(url, status)`; `GuardStatus` | the pure half of `guardAdmin` |
| `next.ts` | `safeNext(raw): Promise<string>` | same-app admin path via `match()`, else Inicio |
| `routes.ts` | `ROUTES` (home, account, login, verify, oauth, invite, reset, recover, noAccess) | resolved, trailing slash |
| `errors.ts` | `AUTH_ERRORS`, `toAuthError`, `authFail`, `authInvalid`, `authErrorFromParams`; `AuthFlowError`, `AuthFailure`, `AuthResult` | Spanish by GoTrue code; keeps the code |
| `session.ts` | sign-in, OAuth, email links, password, sign-out, providers, the store's reads | below |
| `mfa.ts` | `mfaStatus`, `listFactors`, `beginEnroll`, `beginChallenge`, `submitCode`, `cancelEnroll`, `removeFactor` | DF-006 port |

### The D-006 matrix (`visibleSurfacesFor`)
Legacy `applyTabAccess()` + the `data-admin-only` / `data-finance-only` CSS, with the server's grant rules:

| Surface (group) | admin | treasurer | ministry_leader |
|---|---|---|---|
| Inicio, Mi cuenta (Principal) | ✓ | ✓ | ✓ |
| Analíticas (Principal) | ✓ | — | — |
| Calendario, Próximos (Eventos) | ✓ | ✓ read-only | if granted |
| Registraciones (Eventos) | ✓ | — | if granted |
| Tesorería (Finanzas) | ✓ | ✓ | if granted — the ministry's books |
| Discipulado, Galería (Comunidad) | ✓ | — | if granted |
| Líderes (Comunidad) | ✓ | — | — |
| Ministerios (Comunidad), Usuarios, Actividad, Configuración (Administración) | each with its own key (`account_has_system_tab`) | — | — |
| unknown role / no profile | nothing | | |

Capabilities that are not surfaces: `church-books` (admin, treasurer — `is_finance()`) and `notifications` (the bell — admin). A leader's grants are read through the set admin-invite can grant (`OPERATIONAL_TABS`); an admin's system keys through `ADMIN_SYSTEM_TABS`; unknown keys are ignored. Registry labels and icons follow `admin/index.html`; only Inicio and Mi cuenta are `ported` (with `route`).

### `session.ts` (auth wrappers) — every call resolves to an `AuthResult`, never throws
`signInWithPassword(email, password)` · `signInWithOAuth(provider: 'google' | 'azure', { next? })` (keeps `next` in sessionStorage `ird.admin.oauth-next`; Microsoft asks for the `email` scope) · `oauthRedirectUrl(origin?)` = `new URL(ROUTES.oauth, origin).href` → `…/app/admin/acceso/oauth/` under `/app` · `takeOAuthNext()` · `exchangeCode(code)` · `verifyOtp(tokenHash, type)` (types `invite | recovery | email | signup | magiclink | email_change`) · `requestPasswordReset(email)` · `updatePassword({ password, current_password? })` (8 characters to 72 bytes) · `signOut(scope: 'local' | 'global' | 'others')` · `fetchEnabledProviders(): Promise<('google' | 'azure')[]>` (`GET /auth/v1/settings` with the anon key, 8 s timeout, any failure → `[]`) · for the store: `getSession`, `getAal`, `onAuthChange`, `setRealtimeAuth`, `reloadPage`.

### `mfa.ts` — the DF-006 gate, ported
Status from a fresh factor list (`listFactors` fetches the user — the cached session predates a factor enrolled elsewhere); enrollment with a unique friendly name (`IRD <ISO time> <4 chars>`) after clearing unverified leftovers; a challenge that accepts a code from **any** verified TOTP factor and stops at the first error that is not a wrong code; `realtime.setAuth(access_token)` after every verify; `replace: true` removes the old factors only after the new one verifies, clearing its own state first so a cancel racing the verify never removes them, with one retry per removal (`leftover` reports what stayed); `cancelEnroll` removes the new factor only while the server still lists it unverified; `removeFactor` never removes the last verified factor (S45).

### The stores
- **`session`** — the ONE `onAuthStateChange` subscriber. `status: 'loading' | AccessState | 'expired'`, `user`, `profile`, `aal`, `error`; `ready()`, `settled()`, `retry()`, `refresh()`, `signOut(scope)`. The callback is synchronous; reads run on a timer (auth-js holds its lock while calling it). SIGNED_IN / PASSWORD_RECOVERY re-resolve (profile only if a minute old); another user id → `reloadPage()`; TOKEN_REFRESHED re-reads session + aal; USER_UPDATED refetches the profile; MFA_CHALLENGE_VERIFIED → `setRealtimeAuth` + refetch (the `ministries` embed reads at aal2 only); SIGNED_OUT → `signed-out` when `signOut()` asked, `expired` when it did not (and the tab had a session), and pending confirms are cancelled. A visible tab refetches the profile at most once a minute. A background read that fails in transit keeps the page; only the first read and Retry show `error`. `settled()` resolves once no read is running or queued.
- **`guardAdmin(url)`** (exported from the session store) — the `(app)` layout's load: email links first (`emailLinkTarget`), then `ready()` + `settled()`, then `accessTarget` → `redirect(307, …)`.
- **`perms`** — `surfaces`, `nav` (ported), `legacy` (not ported), `has(key)`, `can(capability)`, `roleLabel`; empty until `session.status === 'ready'`.
- **`ministries`** — `items`, `status` (`idle | loading | ready | error`), `error`, `load({ force? })`, `byId(id)`, `namesFor(ids)`; loaded per account, shown to no other.

### Decisions and deviations (with the reason)
1. **The session store reaches Supabase only through `auth/`.** The task names `auth/` "the only non-repo module allowed to use the client"; the S05b config had instead exempted `stores/session.svelte.ts`. That exemption is gone: stores are barred from `db/client` like any other store, `auth/**` is allowed it, and `auth` is a new layer barred to primitives, repos, platform and pure libs (static and dynamic import). `layer-boundaries.test.ts` follows (now 117 cases).
2. **MFA lives in `auth/mfa.ts`**, not `session.ts` — it mirrors the legacy `mfa.js` module and keeps `session.ts` to the sign-in / account calls.
3. **`resolveAccess` checks the profile before the second factor.** An account without access is told so instead of being asked to enroll a device it could never use; a staff account still cannot get past `needs-mfa` / `needs-enroll` without aal2. A profile read that fails in transit is `error` (never a sign-out); `auth` → `signed-out`; `forbidden` / `not_found` → `forbidden`.
4. **System surfaces need their own key** (`ministries`, `users`, `activity`, `settings` one by one), exactly as legacy shows them and as `account_has_system_tab(uid, tab)` decides them on the server. "Developer" (`users`) is the Usuarios surface's key.
5. **No `LEGACY_LEADER_TABS` fallback** (`auth.js:321`): a missing `allowed_tabs` grants nothing (the column is `NOT NULL DEFAULT '{}'` since the page-permissions migration).
6. **The legacy email contract applies on every `(app)` route**, and a `token_hash` + `type` without a known `action` goes by its type (`recovery` → restablecer/, else invitacion/) — legacy `boot()` spent such a token whatever the action said.
7. **`next` is kept on verificar/ too** (the plan names it for acceso/), so a step-up lands where the person was going; Inicio itself carries no `next`.
8. **`ROUTES` call an untyped view of `resolve()`** until S37/S39/S45 create the pages (the generated `Path` union has no entry for a page that does not exist). Same runtime value; see Landmines.
9. **`AuthResult` keeps GoTrue's `code`** beside the RepoError fields, so S39 branches on `insufficient_aal`, `pkce_code_verifier_not_found`, `signup_disabled` without parsing text.

## PORT-DEBT coverage
| Item | Where | Status |
|---|---|---|
| S38: `session` / `ministries` / `perms` rune stores | `stores/*.svelte.ts` | ✅ |
| S38: `perms` derives from the profile, UX only; negative cases are tests | `surfaces.ts` + `surfaces.test.ts` (leader ≠ church books, treasurer ≠ registrations / discipulado / personal data, Administrador ≠ system surfaces, non-admin ≠ analytics / bell, unknown role → nothing) | ✅ |
| S38: `confirm` / `toast` callable from module code | S15/S16 stores; the session store cancels pending confirms on sign-out from module code | ✅ (already met) |
| S37: body classes / `perms.tabs` stay UX gating | `perms` is UX; RLS + aal2 layer are the guard | ✅ |
| S39: "enforce MFA" (client half) | `resolveAccess` + `guardAdmin` (aal2 required; the server half is PR-B) | ✅ client half |
| S39: preserve the scanner-safe `token_hash` + `verifyOtp` flow and expired-link handling | `verifyOtp`, `emailLinkTarget` (query and hash carried), `authErrorFromParams` (`otp_expired`) | ✅ plumbing (screens: S39) |
| S39: preserve "Si la cuenta existe…" | `requestPasswordReset` returns no hint either way | ✅ plumbing |

## Behaviour diffs vs legacy (review these)
1. **MFA is mandatory** (D-033): aal1 never reaches an admin page (legacy `routeAfterLogin` skipped it before DF-006).
2. **A failed profile read is `error` with Retry**, not "Tu cuenta no tiene un perfil asignado" + sign-out (`bootApp`): only a *missing* profile is `forbidden`, and nothing signs the person out.
3. **A session that ends unasked shows "expired"**; a different account in another tab reloads the page (legacy kept the old account's state).
4. **Error copy comes from GoTrue codes**, never from English message fragments; unmapped codes use their kind's copy, never the raw text (legacy fallback rendered `err.message`).
5. **Leader grants are read through the grantable set**; a stored `users` / `analytics` / `leaders` key no longer shows a tab the server refuses (legacy showed any stored key).
6. **Roles are the three the DB allows**; `pastor` (legacy `isPastor`) is gone — `profiles_role_check` refuses it.

## Test counts
| Suite | Before | After |
|---|---|---|
| `tests/unit/auth/` (access 20 · errors 44 · guard 24 · mfa 30 · next 74 · session 38 · surfaces 35) | — | 265 |
| `tests/unit/stores/` (session 39 · perms + ministries 9) | — | 48 |
| `client.test.ts` | 2 | 4 |
| `layer-boundaries.test.ts` | 93 | 117 |

`safeNext` is run against 34 open-redirect shapes at base `/app` **and** base `''` (`//host`, `/\host`, `https:`, `javascript:` in mixed case, `data:`, a tab or newline a browser strips, encoded slashes, backslashes and tabs, `%2e%2e` in both cases, other parts of the site and the legacy panel, look-alike prefixes, the acceso pages, unknown routes, absurd lengths) and with a router that throws. The session store is driven through every event with a mocked auth layer, including the races (a sign-out overtaking a read, a read queued during the first one, the guard right after a sign-in).

**Local-stack check (not committed; see the S40 file).** The auth module and the S40 repos ran against `supabase start` with a synthetic account: wrong password → `invalid_credentials` copy; aal1 → `needs-enroll`, `mfaStatus` = `enroll`, the aal1 RPC refused; TOTP enroll + verify (RFC 6238 from `node:crypto`) → aal2; `removeFactor` refused the last factor; a bogus `token_hash` refused; `signOut('local')` → staff reads `auth`. `fetchEnabledProviders` → `[]` (no provider on the local stack).

## Verification gate
```
[ ]  1. Install clean     not re-run (lockfile unchanged)
[x]  2. Typecheck         npm run check → 673 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     eslint . → exit 0 · prettier --check --end-of-line auto . → all files pass
[x]  4. Unit tests        npm run test → before (b7f92d8, PR-C1 review fixes merged) 67 files | 1 skipped ·
                          1979 passed | 2 skipped; after 79 files | 1 skipped · 2423 passed | 2 skipped
[ ]  5. Golden parity     n/a
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → done
[ ]  7. Preview smoke     n/a — no route yet (S37/S39)
[x]  8. Legacy untouched  only web/** and the two session files
[x] 12. Secrets/PII clean no keys; synthetic users/UUIDs only; the local-stack check read keys from
                          `supabase status` at run time and wrote none to disk
[ ] 13. Ledger updated    → PR-C2 ledger step
[ ] 14–15                 no e2e spec or page added; none touched
[x] 17. Budget            npm run budget → 15 pages within budget (±0.0%: nothing imports these yet)
[x] 18. Supply chain      npm audit --omit=dev --audit-level=high → found 0 vulnerabilities
[x] 19. Security (ASVS 5.0 L2, the parts this plumbing owns)
        V6  MFA required (aal2) before any admin page; any verified factor counts; OAuth = PKCE, one
            top-level redirect, no popup; providers shown only when the project enables them
        V7  one auth-state subscriber; refused refresh / foreign sign-out → "expired", never stale UI;
            another account in the same browser → full reload; sign-out scopes local/global/others;
            no client idle timeout (D-040)
        V8  surfaces and capabilities fail closed for unknown roles and keys; UX only — RLS + the aal2
            layer decide; open-redirect-safe `next`
```

## How to resume if interrupted
- Branch `c2/s40-s38`: `b7f92d8` (PR-C1 review fixes merged) → S40 commit → this commit.

## Landmines (S37 / S39 / S41 / S45 read these)
1. **`ROUTES` vs `svelte/no-navigation-without-resolve`.** The rule (not type-aware here) only accepts a `resolve(…)` call in `goto()` / `<a href>`; `goto(ROUTES.login)` and `href={surface.route}` are reported. In `.svelte` files call `resolve('admin/…/')` inline, or disable the rule on that line with a reason. `redirect()` in a load is not checked. When every admin page exists, replace the cast in `routes.ts` with typed `resolve('admin/…/')` calls.
2. **`guardAdmin` belongs in the `(app)` group's universal `+layout.ts`** (`ssr = false`, so it runs in the browser only). The acceso pages are outside that group; they call `session.ready()` / `session.settled()` themselves. After a sign-in or a verify, `await session.settled()` before deciding where to go — the store reads the new session on a timer.
3. **OAuth callback:** call `exchangeCode(code)` *before* scrubbing the URL, then `safeNext(takeOAuthNext())`. Parse failures with `authErrorFromParams(url.searchParams)` (and the hash); `pkce_code_verifier_not_found` means "started in another browser".
4. **MFA flow is module state, one at a time.** Prepare a step (`beginChallenge()` / `beginEnroll()`) before `submitCode()`; `beginEnroll()` failing with `code === 'insufficient_aal'` means a verified factor exists — challenge first. A verified recovery link is aal1: challenge before `updatePassword` (legacy `startRecovery`).
5. **`USER_UPDATED` does not fire for the profile RPCs:** after `setDisplayName` / `setAvatarUrl`, call `session.refresh()` so the sidebar footer updates.
6. **auth-js emits `SIGNED_IN` every time a tab becomes visible** (`_recoverAndRefresh`), so SIGNED_IN ≠ "a new sign-in"; the store treats it as "re-resolve" (cheap: the profile only if a minute old).
7. **Tests:** `vi.mock` factories are not re-run by `vi.resetModules()`, so a factory that imports a helper module must load it through `vi.hoisted(async () => import(…))` — otherwise each reset hands the module under test fresh, blank `vi.fn()`s (see `tests/unit/stores/session.test.ts`). `$app/paths` now has a Vitest alias + stub (base `''`); `pathsAt('/app')` from `tests/helpers/app-paths.ts` mocks another base — a branch adding its own `$app/*` stubs merges here.
8. **The local stack has no `on_auth_user_created` trigger** (the baseline dump did not capture the dashboard-created trigger on `auth.users`), so `handle_new_user()` never runs locally: an invited test user has **no profile**. The S39 integration suite must create profiles with the service role. Production is unaffected. (Candidate gotcha for the ledger.)
9. **CRLF checkout:** `npm run lint` fails on this Windows worktree for pristine files (`prettier --check .` with core.autocrlf=true); use `--end-of-line auto` locally. CI (LF) is unaffected.

## On completion (PR-C2 ledger step)
- [ ] MIGRATION.md: S38 on the board; candidate gotchas G-043 (no `on_auth_user_created` trigger locally), G-044 (`vi.mock` factories survive `vi.resetModules`), G-045 (auth-js SIGNED_IN on tab focus).
- [ ] ROADMAP S38 row → done (store names: `session`, `perms` — the oracle is `visibleSurfacesFor`, the nav list `perms.nav` — and `ministries`).
