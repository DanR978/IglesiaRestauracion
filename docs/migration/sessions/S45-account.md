# Session S45 — Mi cuenta: profile, security and preferences

**Stream:** admin (account + security)
**Depends on:** S37 (shell, `PageHeader`, `signOutAndLeave`, the `$app` test stand-ins), S38 (`session` / `ministries` stores, `#lib/auth/session` + `#lib/auth/mfa`), S40 (`repos/profiles`, `repos/ministries`), the PR-C2 primitives (ReadonlyField, SectionNav, SegmentedControl, FormField, PasswordField, CodeInput, Alert, Badge, Avatar, Modal, the state trio, ConfirmHost, ToastHost), S11 (D-038 admin theme), PR-B (the aal2 layer, `set_my_display_name` / `set_my_avatar`, `avatar_url_is_valid`)   **PR:** PR-C2 (not opened yet)   **Branch:** `c2/s45` → `migrate/S37-S45-admin`
**Status:** 🟦 built on the branch — PR-C2 not opened yet

## Goal (one sentence)
A staff member manages their own account at `/admin/cuenta/` — name and photo, the facts an administrator owns, password, two-factor devices, sign-in methods, sessions and the admin's theme — with every async part in a loading / empty / error + Retry state and every write answered in Spanish (PORT-DEBT S45, D-033, D-038, D-040, ASVS 5.0 V6/V7).

## In scope
- Route: `web/src/routes/(admin)/admin/(app)/cuenta/+page.svelte`.
- `web/src/lib/components/admin/account/`: `ProfileSection`, `AvatarUploader`, `DisplayNameForm`, `AccountFacts`, `SecuritySection`, `PasswordPanel`, `TwoFactorPanel`, `AddDeviceDialog`, `StepUpDialog`, `SignInMethods`, `SignOutOthersOffer`, `PreferencesSection`, `AccountSection` / `AccountPanel` (the section and panel frames) and `account.ts` (the pure half).
- `web/src/lib/image-optimizer.ts` — the DF-004 port (own commit).
- `web/src/lib/repos/profiles.ts` — one additive embed (`role_presets(name)`), see Decisions 1.
- Tests: `tests/unit/{image-optimizer,admin-account}.test.ts`, `tests/unit/repos/profiles.test.ts` (+1), `tests/component/account/{profile,security,page}.test.ts` (+ `fixtures/account-fakes.svelte.ts`), `tests/e2e/admin-cuenta.spec.ts`.

## Out of scope (do NOT touch)
- The shell, its hosts and the `(app)` guard (S37); the sign-in routes `acceso/**` (S39); Inicio (S41); the users / presets admin (S47); the audit log (S42).
- Legacy files, the database, Edge Functions, `budget.json` (the integrator re-baselines).

## Prereqs
- [x] The plan (D-033…D-041, PR-C2 item 10), the visual brief, `DESIGN-SYSTEM.md` §1/§4/§5/§6, `docs/architecture/design-system.md`, `target-architecture.md` §3–§9, `docs/admin-ux.md`, `MIGRATION.md` §2–§3, PORT-DEBT S45 (and S12/S14/S39 rows it points at), the S38 / S40 / S37 session files.
- [x] Legacy source of truth: `js/pages/admin/account.js` on `develop` and as fixed by DF-006 (`fix/DF-006-mandatory-mfa`: current password, `spanishError`, additive re-enrol), `js/pages/admin/prefs.js`; the DF-004 optimizer (`fix/DF-004-gallery-duplicate-variants:js/lib/image-optimizer.js`).
- [x] Installed behaviour read from source: Kit 3.1.0 (`beforeNavigate` / `cancel()` on `popstate`, `shallow`, link option `data-sveltekit-reset`, `goto(…, { replace })`), auth-js 2.112.3 (`_signOut` scopes, the `qr_code` prefix, AAL from the JWT), GoTrue 2.187 on the local stack (see Local-stack check).

## What changed

### The page
`PageHeader` "Mi cuenta" (S37's), then SectionNav in link mode — Perfil / Seguridad / Preferencias as `?seccion=` (default and fallback Perfil), so a section can be linked, reloaded, and Back returns to the one before. The links sit under `data-sveltekit-reset="false"`: switching keeps focus on the link and the scroll where it is. A section stays mounted once opened (hidden while another is open), so an unsaved name survives a look at Seguridad and its guard keeps watching. Each section sits in a `<svelte:boundary>` whose failure is a StateError with Retry (the error to the console). Desktop: the list beside the section (13rem + the section, max 48rem); ≤900px SectionNav is its own scrolling pill bar above it.

### Perfil (`ProfileSection`)
- **Foto y nombre.** `AvatarUploader`: Avatar 96 + "Subir foto" / "Cambiar foto" + "Quitar foto". A picked file must be an image ≤ 5 MB (`avatarFileProblem`), then `optimizeSquare` (512px JPEG) → `uploadAvatar(userId, jpeg, 'jpg')` → `setAvatarUrl(url)` → `session.refresh()` → "Foto actualizada". The button carries the progress (Button `loading`) and a polite status line names the stage ("Preparando… / Subiendo… / Guardando la foto…"). "Quitar foto" asks first (ConfirmDialog, danger) → `setAvatarUrl(null)`. Every failure is a Spanish toast (the optimizer's or the repo's copy). Focus is handed back to the photo button when the busy one dropped it.
- `DisplayNameForm`: "Nombre visible" (required, 2–80, `normalizeDisplayName`). The draft follows the stored name until edited; dirty = differs once normalised. Save → `setDisplayName` → `session.refresh()` → "Nombre actualizado"; a name that does not fit is an inline error (aria-invalid), a refused save a toast; "Descartar cambios". The field is read-only while saving. **Guard** (`beforeNavigate`): a dirty name holds a navigation to another page and asks "¿Salir sin guardar los cambios?" ("Salir sin guardar" / "Seguir editando"); yes repeats it (`goto`, `history.go(delta)` for Back, `location.assign` for a full load); closing or reloading the tab gets the browser's own prompt. It lets through shallow navigations (the shell's drawer), same-page query changes (another section) and a session that is no longer ready. Several held navigations ask once; the latest wins.
- **Datos de la cuenta** (`AccountFacts`), each once, as ReadonlyField: Correo (lock: "Lo gestiona un administrador."), Rol (a role Badge labelled with the access preset's name when the account may read it — Decisions 1 — lock: "Lo asigna un administrador."), Ministerios (the led ministries as tinted Badges; "Ninguno asignado"; lock: "Los asigna un administrador."), Miembro desde, Último inicio de sesión (missing → the "Sin dato" mark). The ministries' names come from the shared store, read only when the account leads one: a detail skeleton for the panel while it loads, then a StateError + Retry in the Ministerios field alone if it failed.

### Seguridad (`SecuritySection`)
- **Contraseña** (`PasswordPanel`). With an email identity: "Contraseña actual" (current-password, optional, hint "Déjala vacía solo si nunca creaste una contraseña (entras con Google o Microsoft).") + "Nueva contraseña" (new-password, strength meter) + "Confirma la nueva contraseña" (match). The new password must be acceptable on the meter (`newPasswordProblem`: ≥ 8, not predictable, ≤ 72 bytes); `current_password` is sent only when typed; `current_password_required` / `current_password_invalid` / `same_password` / `weak_password` become inline errors on their field (an edit clears them), anything else a toast. A hidden `username` field lets a password manager file the new password. Without an email identity: "Crear una contraseña" opens a fresh TOTP step-up first, then the form without the current field; if GoTrue answers `current_password_required` the panel becomes the change form and asks for it.
- **Verificación en dos pasos** (`TwoFactorPanel`): the verified factors, oldest first — name, "Agregado el …", "Verificado" — fetched fresh (`listFactors`): list skeleton, StateError + Retry, StateEmpty with "Agregar dispositivo". "Agregar dispositivo" (`AddDeviceDialog`, at aal2): three steps, the QR as an `<img alt="Código QR para agregar este dispositivo a tu app de autenticación">` on a fixed white tile, the secret in blocks of four with "Copiar clave", CodeInput → `submitCode` → "Dispositivo agregado". Cancel / Escape / × → `cancelEnroll()`; the scrim does not close it. "Quitar" exists only while two devices or more remain; it asks first (ConfirmDialog, danger, the device named), then a fresh code (`StepUpDialog`: `beginChallenge` → CodeInput → `submitCode`), then `removeFactor` → "Dispositivo quitado". With one device the panel says why it stays (two-step verification is required, D-033).
- **Métodos de inicio de sesión** (`SignInMethods`): read-only from the identities — "Correo y contraseña", Google, Microsoft (an unknown provider is "Otro proveedor", never its raw name) — with "Último uso: …" (or "Vinculado el …") and the note "Google o Microsoft se vinculan solos cuando su correo coincide con el tuyo."
- After a password or device change, the panel that changed is followed by **"¿Cerrar sesión en tus otros dispositivos?"** (`SignOutOthersOffer`, an info Alert): `session.signOut('others')` → toast, this session stays; dismissible.
- **Sesiones**: "Cerrar sesión en todos los dispositivos" → ConfirmDialog (danger) → `session.signOut('others')` (a failure is a toast, nothing signed out) → the shell's `signOutAndLeave('local')` → the sign-in page with "Sesión cerrada." (Decisions 5).

### Preferencias (`PreferencesSection`)
"Tema": SegmentedControl Claro / Oscuro / Sistema bound to `adminTheme.current` (`#lib/theme.svelte`, the admin's own key `ird.app.admin.theme`, D-038), applied as it is chosen; "Se guarda en este dispositivo. El sitio público conserva su propia elección." Density, reduce-motion and landing-tab are **not ported** — reduced motion follows the system everywhere and the admin opens on Inicio — and the dead plumbing (`setPref`, `landingOptions`, `applyLandingPref`, `adm-density-compact`, `adm-reduce-motion`) is not carried.

### `#lib/image-optimizer.ts` (own commit)
The DF-004 module, typed: `optimizeImage` (main ≤ 1920px wide q0.90 + thumb ≤ 640px q0.86, never up-scaled) and `optimizeMany` for S46, plus `optimizeSquare` (the centred square, ≤ 512px, q0.90) for the avatar. JPEG only, the encoded type verified on both canvas paths (WebKit hands back PNG for WebP without an error). Failures throw `ImageOptimizerError` (`invalid | decode | encode`, Spanish copy, the detail to `console.warn`). Differences from DF-004: the canvas is painted white first (a transparent PNG came out on black), the decoded image is released even when encoding fails, `optimizeMany` always runs at least one worker, the per-file `console.info` is gone.

### Decisions and deviations (with the reason)
1. **Rol names the access preset through an embed in `fetchOwnProfile`** (`role_presets(name)`, additive; `OwnProfile.role_presets`). The task asks for the preset name "when one applies"; `role_presets` is readable by admins only (`role_presets_admin_all`) and only at aal2, so treasurers and leaders (and any aal1 read) get `null` and see the role's label. One embed in the read the store already makes, rather than a second request with its own states. Verified on the local stack (below).
2. **Facts field set** — Correo, Rol, Ministerios, Miembro desde, Último inicio; dropped: Usuario (an "@handle" cut from the email), Zona horaria (the browser's, not the account's), Idioma (always "Español"), the always-green "Activa", "ID de cuenta" (an internal identifier) and the synthetic "Actividad" timeline. Departamento became Ministerios: the ministries the account leads, "Ninguno asignado" otherwise (legacy said "Acceso total" for admins, which the tiers no longer make true).
3. **Sections stay mounted once opened.** The guard must let same-page section switches through (the task), so the draft has to survive them: only the open section shows, the others stay hidden. Unvisited sections load nothing.
4. **The four password codes are inline, not toasts.** They are a field's fault and the task asks for inline Spanish errors; a toast on top would announce the same failure twice (both are live regions). Every other failure, and every success, is a toast.
5. **"Cerrar sesión en todos los dispositivos" = `signOut('others')`, then `signOutAndLeave('local')`** — not one `signOutAndLeave('global')` as the coordinator's merge note puts it. Same end state (every session ends), through the shell's helper as required (no bounce, "Sesión cerrada." notice), but a failure stays honest: auth-js drops this device's session even when the server never heard a global sign-out, and the page would then leave saying the sessions were closed while the other devices stayed signed in. Ending the others first gets an answer that can still be shown; S37's `sign-out.svelte.ts` documents exactly this order for reporting a failure in place.
6. **Step-up after the confirm, and from any device.** "Quitar" asks first (a misclick never costs a code), then asks for a code; any verified device's code counts (`beginChallenge`), the one being removed included.
7. **Upload progress is staged, not a percentage**: storage-js uploads with `fetch`, which reports no bytes; the stages are the honest progress.
8. **No toast for the theme**: the page repaints as the option is chosen — that is the confirmation; the radio announces its own state.
9. **"Crear una contraseña" is chosen by identities** (the task), with `app_metadata.providers` as the fallback and "yes" when neither exists. On this stack an invitation already creates an `email` identity, so every invite-only account gets the change form (whose hint covers "never created one"); the create path serves an account with only Google / Microsoft identities.
10. **The QR `src` is normalised** (`qrImageSrc`): auth-js puts GoTrue's raw SVG markup behind `data:image/svg+xml;utf-8,`; a `#` in that markup would cut the URL, so raw markup is percent-encoded; anything that is not an SVG data URL is refused and only the secret shows.
11. **Panels are flat** (`AccountPanel`, a border on `--color-surface`): the visual brief's "no shadow" — Card carries `--shadow-sm` at rest — with the brief's h3 at `--fs-md`.
12. **Opened sections are a `$state` record, not a `SvelteSet`**: in a page, `SvelteSet` joined the shared `svelte/reactivity` chunk every page loads for the theme's `MediaQuery` (+0.6 kB on every page, box 17).

## PORT-DEBT coverage (S45 row)
| Item | Where | Status |
|---|---|---|
| MUST FIX: five immutable fields as `<input disabled>` → ReadonlyField | `AccountFacts` | ✅ (and the field set corrected — Decisions 2) |
| MUST FIX: always-green "Activa" (`renderHero` + `renderAccountSection`) | — | ✅ removed: an account that reaches the page is active; nothing to show |
| MUST FIX: synthetic 4-row "Actividad" | — | ✅ cut, not ported (the audit log is S42's) |
| MUST FIX: no page title | `PageHeader` "Mi cuenta" (tab: "Mi cuenta · Panel · …") | ✅ |
| MUST FIX: email ×3, role ×2 | `AccountFacts` | ✅ once each |
| MUST FIX: leaky `set_my_display_name` copy | repo `RepoError.message` only | ✅ |
| MUST FIX: build the Preferences UI or delete the plumbing | `PreferencesSection` | ✅ theme built; density / reduce-motion / landing not ported, their plumbing not carried |
| MUST FIX: password change — current password, strength, show/hide | `PasswordPanel` on PasswordField | ✅ |
| MUST FIX: avatar — image-only, ≤ 5 MB, square, progress on the button, through the optimizer | `AvatarUploader` + `optimizeSquare` | ✅ |
| DO NOT PORT: disabled-input wall · "Activa" · synthetic timeline · migration-detail string · dead prefs plumbing | — | ✅ none ported |
| S12: `adm-density-compact` / `adm-reduce-motion` hooks | — | ✅ not carried (the prefs they served are not ported) |
| D-022 / D-038: the admin's theme switch on its own key | `PreferencesSection` → `adminTheme` | ✅ |

## Behaviour diffs vs legacy (review these)
1. **Fields**: Usuario, Zona horaria, Idioma, Estado ("Activa"), ID de cuenta and Actividad are gone; Departamento is Ministerios (Decisions 2). Rol shows the access preset's name to admins.
2. **Two-factor**: legacy "Reconfigurar" re-enrolled through the sign-in screen and replaced the factor; here a device is added in place (the old one stays) and removed on purpose — behind a confirm and a fresh code, never the last.
3. **Password**: the current password is sent only when typed; strength, show/hide and the four GoTrue codes as inline errors; a first password for a Google / Microsoft account behind a step-up.
4. **Avatar**: a 512px JPEG square, a new object name each time (`upsert: false`); legacy stored the raw file (any format, up to 5 MB) with `upsert: true`. Errors are toasts instead of a box under the form.
5. **Name**: normalised like the server; legacy's "Perfil actualizado" is "Nombre actualizado".
6. **Unsaved name**: switching section keeps the draft (legacy asked "¿Descartarlos?"); leaving the page asks (legacy: `beforeunload` only).
7. **New**: sign-in methods, "Cerrar sesión en otros dispositivos" after a change, "Cerrar sesión en todos los dispositivos", the theme switch.

## Test counts
Before = the branch base `b837ef3`: 98 files (1 skipped), 2825 passed / 2 skipped. S45 adds 5 Vitest files and 140 tests (2965 before the S37 merge); after the merge with S37: 111 files (1 skipped), 3034 passed / 2 skipped.

| Suite | Tests |
|---|---|
| `tests/unit/image-optimizer.test.ts` (new) | 25 — sizes, the crop rectangle, no up-scaling, JPEG verified on both canvas paths, the `<img>` fallback, the failure reasons, `optimizeMany` concurrency |
| `tests/unit/admin-account.test.ts` (new) | 25 — sections / `?seccion=`, dates, role, ministries, avatar file check, sign-in methods, `hasEmailIdentity`, devices + last-device rule, secret, QR src, new-password check, password codes |
| `tests/unit/repos/profiles.test.ts` | 38 (was 37; +1: the preset embed) |
| `tests/component/account/profile.test.ts` (new) | 37 — uploader (validation, optimise → upload → set → refresh, progress, failures, the remove confirm), name (dirty, inline error, save, discard, follow-until-edited), **the guard** (asks, stays, leaves, Back by the same step, one question for several, same-page and shallow pass, `leave`, ended session), facts (once each, no fabricated field, lock notes, preset, "Sin dato", ministries loading / error / Retry, **no retry loop**) |
| `tests/component/account/security.test.ts` (new) | 42 — password change (current only when typed, the four codes inline, other failures toasted, success), **create behind the step-up** (wrong code, cancel, `current_password_required` switch), devices (skeleton, list, error + Retry, empty, **last device**, confirm → **step-up** → remove, refused removal, add: QR alt, secret, copy, code, cancel), sign-in methods, **the sign-out-others offer**, the all-devices sign-out |
| `tests/component/account/page.test.ts` (new) | 10 — title, links, default / deep link / unknown section, mounted-once draft, fallback skeleton; Preferencias (one control, own key, stored choice) |
| `tests/e2e/admin-cuenta.spec.ts` (new) | 8 × 4 projects — in the S37 shell, backend mocked: facts once each; sections via links, Back, deep link; the guard's dialog (stay / leave) and a section switch keeping the draft; all-devices sign-out sends `scope=others` then `scope=local` and lands on `/admin/acceso/?aviso=sesion-cerrada`; no sideways scroll at 360px in any section; axe in both themes on the populated page; the theme painted and kept across a reload |

**Local-stack check (not committed).** Throwaway scripts against `supabase start`, synthetic users created and deleted through the service role (no PII; a synthetic developer was banned before its deletion — the last-developer guard refuses deleting the only developer, and treats a banned account as none): fetchOwnProfile's select with the new embed → an admin with "Desarrollador" reads `{"name":"Desarrollador"}` at aal2 and `null` at aal1; a leader with "Medios" reads `null` at both (RLS). A second TOTP factor enrols at aal2 (2 verified), one is removed (1 left). An invited, never-accepted user and a user created without a password both carry an `email` identity; setting a password adds none. The stack does not require the current password (`weak_password` → 422 with `reasons: ["length"]`). `totp.qr_code` is raw SVG markup (no `#` today) — auth-js adds the data-URL prefix. No audit rows were left.

## Verification gate
```
[ ]  1. Install clean     not re-run (lockfile unchanged — no dependency added)
[x]  2. Typecheck         npm run check → 806 FILES 0 ERRORS 0 WARNINGS (after the S37 merge)
[x]  3. Lint / format     eslint . → 0 problems · prettier --check --end-of-line auto . → all files pass
[x]  4. Unit tests        npm run test → 111 passed | 1 skipped files · 3034 passed | 2 skipped
                          (S45: +5 files, +140 tests; base b837ef3: 98 | 1 · 2825 | 2)
[ ]  5. Golden parity     n/a — the optimizer is a canvas pipeline (unit-tested on fakes)
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → done; build/admin/cuenta/index.html
[x]  7. Preview smoke     part of box 14
[x]  8. Legacy untouched  only web/** and this file
[x] 12. Secrets/PII clean no keys; synthetic data; the local-stack scripts read keys from `supabase status`
                          at run time, live outside the repo and were not committed
[ ] 13. Ledger updated    → PR-C2 ledger step
[x] 14. Cross-engine e2e  admin-cuenta.spec.ts → 32 passed (chromium, webkit, Mobile Safari, Mobile Chrome);
                          admin-shell.spec.ts (S37) → 68 passed with Mi cuenta in the shell
[!] 15. Automated a11y    a11y.spec.ts → 216 passed, 16 failed: every page passes except /admin/ and
                          /admin/cuenta/ (2 routes × 2 themes × 4 projects = 16): a signed-out visit is sent
                          to /admin/acceso/ (S39, not on this branch) and lands on Kit's untitled 404
                          (`document-title`). Expected until S39 lands. Signed in, the populated page has
                          0 serious/critical violations in both themes on all four engines
                          (admin-cuenta.spec.ts).
[x] 16. Manual WCAG 2.2   by eye at 360 / 1280 × light / dark (sections, the add-device dialog): names,
                          visible focus, targets ≥ 24px (44px buttons), no sideways scroll, inputs ≥ 16px,
                          errors announced (role=alert inline, toasts), reduced motion; focus handed back
                          after busy buttons; one h1, sections h2, panels h3
[!] 17. Budget            /admin/cuenta/ has no baseline (164.4 kB — expected); every page +0.5 kB over the
                          S37 tree (/ 43.5 → 44.0 kB) — see "Budget"
[x] 18. Supply chain      no dependency change
[x] 19. Security (ASVS 5.0 L2, the parts this page owns)
        V6  password change with current_password when the account has one (6.2.3); new passwords
            checked for length and predictability, ≤ 72 bytes; a fresh TOTP before creating a first
            password or removing a device; the last device cannot go (D-033); manual linking off,
            methods read-only (D-035)
        V7  sign out the other sessions after a credential change; sign out every session; no client
            idle timeout (D-040)
        V8  UX only — RLS and the aal2 layer decide; the preset name is read only where RLS allows it;
            the avatar URL shape is the server's (`avatar_url_is_valid`)
```

### Budget
On top of S37's tree (`migrate/S37-S45-admin`), measured by building the merged branch without and with `(app)/cuenta/`: `/` 43.5 → 44.0 kB, the same +0.5 kB on every page, so 15 pages are over the +5% tolerance instead of S37's 12. None of it is account code — the page itself is lazy-loaded. It is framework code every page carries once a route uses it: Kit's `goto` / `beforeNavigate` (the unsaved-name guard and its re-navigation) kept in the shared runtime chunk, and the route's entry in `entry/app.js`'s manifest. A `SvelteSet` in the page had added another 0.6 kB to every page through the shared `svelte/reactivity` chunk; it was replaced (Decisions 12). The integrator's re-baseline covers the rest; `budget.json` is untouched.

## How to resume if interrupted
- Branch `c2/s45`: `c5ca660` (optimizer) → `aa6f513` (Mi cuenta) → `f7ef09f` (merge of `migrate/S37-S45-admin`, conflicts resolved to S37's PageHeader and `$app` stand-ins) → `02da465` (Mi cuenta on the shell) → this file.

## Landmines (the integrator, S39, S46, S47 read these)
1. **`fetchOwnProfile` now embeds `role_presets(name)`** (S40's read, additive). Fixtures that build an `OwnProfile` by type need `role_presets: null`; the session store's loose mocks do not care.
2. **Removing the device the session was verified with** downgrades the sessions bound to that factor to aal1 on the server (GoTrue `DowngradeSessionsToAAL1`); the access token keeps saying aal2 until it is refreshed (≤ 15 min, `jwt_exp = 900`), then the shell sends the person to verify with a remaining device. The step-up accepts any device's code, so typing the removed device's code is what binds the session to it.
3. **Old avatar objects stay in the `avatars` bucket** (`upsert: false`, a new name each time; legacy did the same). Storage policy lets an account delete its own objects; a cleanup needs a repo function — follow-up.
4. **S39's verificar/ and S45's dialogs overlap**: QR + secret + CodeInput (AddDeviceDialog) and the challenge (StepUpDialog). Candidates for one shared piece once both exist.
5. **Kit 3 link options**: `data-sveltekit-keepfocus` / `noscroll` are gone — `data-sveltekit-reset="false"` keeps both; `goto` takes `{ replace }`, not `replaceState`.
6. **A `SvelteSet` / `SvelteMap` in a page** rides into the shared reactivity chunk every page loads (box 17). Prefer a `$state` record or array there.
7. **e2e**: the session key is `sb-<first label of PUBLIC_SUPABASE_URL's host>-auth-token` (`sb-127-auth-token` for the loopback build); auth-js refuses a token whose segments are not base64url (the signature too); a link injected for the router must be inside the app's container (`main`).
8. **The account fakes' `ministries.load` reads the store's status** the way the real one does, so a component that calls it inside an effect without `untrack` loops in the test as it would in the app (`AccountFacts` had that bug; fixed and pinned).

## On completion (PR-C2 ledger step)
- [ ] MIGRATION.md: S45 on the board; candidate gotchas — "a Svelte reactivity class in one page enlarges every page" (Landmine 6), "removing the session's own factor downgrades it at the next refresh" (Landmine 2).
- [ ] ROADMAP S45 row → done (Mi cuenta at `/admin/cuenta/`; preferences = theme only).
- [ ] PORT-DEBT S45 → covered (table above); D-022: record that the admin's appearance switch shipped on its own key (D-038).
- [ ] `budget.json` re-baseline (integrator), with `/admin/cuenta/`.
