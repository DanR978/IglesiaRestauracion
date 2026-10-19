# Session S40 — Admin repos F3, narrowed to what Inicio and Mi cuenta use

**Stream:** admin (data layer)
**Depends on:** S22b (repo result contract, with its review fixes: `requireSession` first in every staff-only call, the `describeSessionGate` suite check), PR-B `fix/authz-hardening` (the aal2 layer, the developer tier, `avatar_url_is_valid`)   **PR:** PR-C2 (not opened yet)   **Branch:** `c2/s40-s38` → `migrate/S37-S45-admin`
**Status:** 🟦 built on the branch — PR-C2 not opened yet

## Goal (one sentence)
Give S41 (Inicio) and S45 (Mi cuenta) typed, staff-safe repo calls — the own profile and its two self-service RPCs, the ministries, the audit log, and the Inicio counts — on the S22b contract, with regenerated schema types.

## In scope
- `web/src/lib/db/database.types.ts` — regenerated from the local stack (PR-B migration applied).
- New repos: `web/src/lib/repos/{profiles,ministries,activity}.ts`.
- Additive functions in `repos/events.ts` (`countCalendarEvents`, `countUpcomingSpecialEvents`, `fetchNextCalendarEvents`), `repos/discipleship.ts` (`countPendingInterests`), `repos/gallery.ts` (`countAlbums`).
- `repos/errors.ts` gains `noCount()`; `repos/session.ts` gains `requireUserId()` (requireSession's check, returning the user id).
- Tests in `web/tests/unit/repos/` (+ `mock-client.ts`: `rpc`, bucket names, a session user id).

## Out of scope (moved, not dropped — ROADMAP S40 row to be amended by the ledger step)
| Legacy repo the ROADMAP row listed | Now owned by | Why |
|---|---|---|
| `settings` (`app_settings`) | **S42** Activity + Settings | its only consumer is the Configuración tab |
| `notifications` (`admin_notifications`) | **S43** Notifications bell | its only consumer is the bell |
| `newsletter` | **S23** (the public subscribe repo already on `migrate/S23-S36-public-site`); admin-side reads with **S42** | no second `repos/newsletter.ts` (plan, "Coordination") |
| `admin` (the `admin-invite` client) | **S47** Users + presets | the Users tab is its only caller; it targets the hardened contract (D-034), not a byte-compatible one |

Also out: UI (S41/S45 consume these), DB/RLS changes, legacy files. (The S22/S52 staff-only functions adopted `requireSession` in PR-C1's review fixes, merged into this branch first.)

## Prereqs
- [x] `MIGRATION.md` §0–3, the plan (D-033…D-041, PR-C2 items 8–10), `target-architecture.md` §3–§9, PORT-DEBT S40/S41/S42/S44/S45 rows, S22b session file, SESSION-TEMPLATE.
- [x] Legacy sources: `js/pages/admin/{dashboard,activity-tab,ministries,account,auth}.js`.
- [x] Server rules read: `supabase/migrations/20261019000001_enforce_mfa_and_tiers.sql`, `supabase/functions/admin-invite/lib.ts`, `supabase/README.md` "Staff sign-in".
- [x] `supabase db reset` once on this worktree, then the `db.yml` grant (`grant supabase_auth_admin to postgres …`).

## What changed

### Types
`supabase gen types typescript --local --schema public`, prettier'd. `--schema public` keeps the S06 file's scope (the local default also emits `graphql_public`); the `__InternalSupabase` block and its two-line comment — the file's only header — are kept as S06 generated them from production (`PostgrestVersion: '13.0.4'`; the local CLI 2.78.1 omits the block). The diff is additive: `analytics_events`, `analytics_salts`, `fin_receipts`, `leader_members`, `leader_sections` and 11 functions (`set_my_avatar`, `set_my_display_name`, `is_developer`, `has_system_tab`, `account_has_system_tab`, `avatar_url_is_valid`, `admin_revoke_user_sessions`, `analytics_*`, `leaders_directory`, …). `npm run check` stays at 0 errors with the existing repos unchanged.

### New and added functions — who may call them (decided from the RLS policies)
The rule: a call checks the session first (`requireSession` / `requireUserId`) when a signed-out caller would get a **different** answer than staff, because supabase-js then sends the anon key and RLS answers with an empty 200 — "no data" instead of "signed out" (ADR-0004). As in the S22b review fixes, the check is the function's **first** statement, before its own input checks, and every suite classifies each exported function with `describeSessionGate` (signed out: `auth`, no query, one `getSession`, one warning under the function's own name; a public call still goes out).

| Function | Reads / writes | Signed out (anon) gets | Session check |
|---|---|---|---|
| `fetchOwnProfile()` | `profiles` own row + `ministries(name,color)` embed | nothing (no anon policy) | **yes** (`requireUserId`: the same check, and the id filters the row) |
| `setDisplayName(name)` | rpc `set_my_display_name` | refused (aal2 inside) | **yes** |
| `setAvatarUrl(url \| null)` | rpc `set_my_avatar` | refused | **yes** |
| `uploadAvatar(userId, blob, ext)` | storage `avatars`, own folder | refused (RLS + aal2 layer) | **yes** |
| `fetchMinistries()` | `ministries` | `[]` (no anon policy; aal1 gets `[]` too) | **yes** |
| `fetchRecentActivity({ limit })` · `fetchActivityPage({ before, limit })` | `audit_log` | `[]` (developer tier `activity` + aal2) | **yes** |
| `countPendingInterests()` | `discipleship_interests` head count | `0` | **yes** |
| `countAlbums()` | `gallery_albums` head count | published only | **yes** |
| `fetchNextCalendarEvents(limit, from?)` | `calendar_events` + `ministries` embed | the rows, every ministry `null` | **yes** (the embed is not public) |
| `countCalendarEvents({ from, to })` | `calendar_events` head count | the same count | no — every row is public |
| `countUpcomingSpecialEvents(nowIso)` | `events` head count | the same count | no — every row is public |

Counts use `select('id', { count: 'exact', head: true })`; a count that is missing from the answer is `noCount()` — `{ ok: false, kind: 'unknown' }`, logged, **never 0**. Every `.select()` is a literal (G-024).

### Per module
- **`profiles.ts`** — `STAFF_ROLES` / `StaffRole = 'admin' | 'treasurer' | 'ministry_leader'` (the `profiles_role_check` set) and `isStaffRole()`. `OwnProfile.role` is `StaffRole | null`: a stored role outside the three comes back `null` (logged), so the access oracle fails closed. `setDisplayName` normalises like admin-invite's `parseDisplayName` (control and bidi-control characters out, whitespace collapsed, 2–80 code points) and returns the name the RPC stored. `uploadAvatar` checks the uid (UUID), the extension (`jpg | jpeg | png | webp`), image type and ≤ 5 MB before any request, uploads `"<uid>/avatar-<ms>.<ext>"` with `upsert: false` (a new name each time; no UPDATE grant needed) and returns the public URL — exactly what `avatar_url_is_valid` accepts. `setAvatarUrl(null)` sends `''`, which the RPC stores as NULL.
- **`ministries.ts`** — `fetchMinistries()` by name (`id,name,color,created_at`).
- **`activity.ts`** — `fetchRecentActivity({ limit = 10 })` and `fetchActivityPage({ before, limit = 50 })`: ordered `(created_at desc, id desc)`, one row past the page decides `next`, and the next page is `created_at < c OR (created_at = c AND id < i)` with the timestamp double-quoted (PostgREST reserves `.` and `:`). The cursor is validated (timestamp shape + UUID) before it reaches the filter string; limits are clamped to 1–100.
- **`events.ts` / `discipleship.ts` / `gallery.ts`** — the Inicio reads above. `fetchNextCalendarEvents` defaults to six rows from the viewer's local `todayISO()`.
- **`discipleship.ts`** — `InterestStatus` is the DB's `'pending' | 'approved' | 'placed' | 'declined'` (narrowed by the PR-C1 review fixes, which this branch merged; `countPendingInterests` counts `'pending'`).

### Behaviour diffs vs legacy (review these)
1. **Counts are never 0 on failure.** Legacy Inicio rendered `count ?? 0` (`dashboard.js:57-71`); here a failed or missing count is the error state's input.
2. **The audit log pages** instead of stopping at 100 rows (`activity-tab.js:54`, PORT-DEBT S42).
3. **Ministries: a failed read is an error**, not "No hay ministerios todavía" (`ministries.js:14`, PORT-DEBT S44).
4. **Display names are normalised** before the RPC (the RPC only trims and truncates at 80); a name over 80 characters is refused instead of silently cut.
5. **Avatar uploads never overwrite** (`upsert: false`; legacy `upsert: true` on a timestamped path).
6. **`requireSession` is now a thin wrapper** over `requireUserId`; its behaviour and test expectations are unchanged.

## PORT-DEBT S40 coverage
| Item (PORT-DEBT §16 / ROADMAP S40) | Status |
|---|---|
| Typed `repos/{profiles, ministries, activity}` | ✅ this session |
| Typed `repos/{settings, notifications, newsletter, admin}` | ➡️ S42 / S43 / S23+S42 / S47 (table above) |
| `admin-invite` contract byte-compatible | ➡️ superseded by D-034: S47 targets the hardened contract (`code` + Spanish `error`) |
| `pause_invites` is cosmetic — enforce or drop | ✅ resolved server-side by PR-B: `admin-invite` refuses invite **and** resend while paused (`invitesPaused()`, `invites_paused`), so S42's toggle is real |

## Test counts
Before = this branch after merging the PR-C1 review fixes (`b7f92d8`).

| Suite | Before | After |
|---|---|---|
| `profiles` (new) | — | 46 |
| `activity` (new) | — | 22 |
| `ministries` (new) | — | 6 |
| `events` | 20 | 39 |
| `discipleship` | 50 | 54 |
| `gallery` | 56 | 60 |
| `session` | 5 | 8 |
| `errors` | 92 | 93 |
| **`tests/unit/repos`** | **18 files · 509** | **21 files · 614** |

Every new function is classified in its suite's `describeSessionGate` (staff-only: `fetchOwnProfile`, `setDisplayName`, `uploadAvatar`, `setAvatarUrl`, `fetchMinistries`, `fetchRecentActivity`, `fetchActivityPage`, `fetchNextCalendarEvents`, `countPendingInterests`, `countAlbums`; public: `countCalendarEvents`, `countUpcomingSpecialEvents`; not repo calls: `isStaffRole`, `normalizeDisplayName`). Every new read also has a "failure is never the empty success" case and, where it takes input, a malformed-input case.

**Local-stack check (not committed).** A throwaway Vitest file ran the new repos and the S38 auth module against `supabase start` with a synthetic account (created and deleted through the service role, no PII): aal1 reads its own profile while `ministries` answers `[]`; the aal1 RPC is refused (`forbidden`); after a TOTP enrollment the RPCs work, the avatar URL `uploadAvatar` returns is accepted by `avatar_url_is_valid` and a foreign URL is `invalid`; another user's folder is refused; the `ministries(name,color)` embed resolves on `calendar_events`; and `fetchActivityPage` walked five audit rows **sharing one timestamp** two at a time, each seen exactly once (the quoted keyset filter). All data was removed afterwards.

## Verification gate
```
[ ]  1. Install clean     not re-run (lockfile unchanged)
[x]  2. Typecheck         npm run check → 673 FILES 0 ERRORS 0 WARNINGS (with S38; one run for both commits)
[x]  3. Lint / format     eslint . → exit 0 · prettier --check --end-of-line auto . → all files pass
                          (this checkout has core.autocrlf=true: plain `prettier --check .` flags every
                          pristine CRLF file; committed content is LF — see Landmines)
[x]  4. Unit tests        tests/unit/repos → 21 files · 614 passed (was 18 · 509)
[ ]  5. Golden parity     n/a — no pure module changed
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → done (no route imports a repo)
[ ]  7. Preview smoke     n/a — no surface
[x]  8. Legacy untouched  only web/** and this file
[x] 12. Secrets/PII clean no keys; synthetic UUIDs and names in fixtures
[ ] 13. Ledger updated    → PR-C2 ledger step (below)
[x] 19. Security          V8 (authorization): every staff-only read checks the session first; no
                          function widens what RLS allows; the avatar path shape is the server's
```

## How to resume if interrupted
- Branch `c2/s40-s38`, worktree `IR-c2-s40-s38`: the PR-C1 review fixes merged first (`b7f92d8`), then this session's commit, then S38's.
- Next: S38 (second commit on the same branch).

## Landmines
1. **Callers gate before they read.** A staff account without the right tab gets an **empty** answer from RLS, not an error: `fetchActivityPage` for an admin without `activity`, `countPendingInterests` for a leader without `discipulado`, `countAlbums` without `galeria`. S41 calls them only when `perms.has(…)` (S38) says so.
2. **aal1 answers are empty too.** `ministries`, the embeds and every staff table read empty until the session is aal2; call these only when `session.status === 'ready'`.
3. **`receipts.ts` still carries its temporary `fin_receipts` row type**; `Tables<'fin_receipts'>` now exists — S56b-UI can drop the mirror.
4. **CRLF checkout:** `npm run lint` (`prettier --check .`) fails on this Windows worktree for every pristine file (core.autocrlf=true); check with `--end-of-line auto` locally — CI (LF) runs the plain command (G-025's cousin).
5. `mock-client.ts` now gives the default session a `user.id` (`TEST_USER_ID`) and records `rpc` calls on the table `rpc:<fn>`; `storage.from()` records bucket names.

## On completion (PR-C2 ledger step)
- [ ] ROADMAP S40 row: "narrowed to consumers; settings/notifications/newsletter/admin → S42/S43/S23+S42/S47; admin-invite contract = the hardened one (D-034)".
- [ ] MIGRATION.md board + Current state; PORT-DEBT S40 `pause_invites` closed by PR-B.
