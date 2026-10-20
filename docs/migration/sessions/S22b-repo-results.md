# Session S22b — Repo result contract (D-032 / ADR-0004)

**Stream:** foundation (data layer)
**Depends on:** S02b (Kit 3 harness), S22 (public repos), S52 (treasury repo), S56b backend (receipts repo)   **PR:** [#50](https://github.com/DanR978/IglesiaRestauracion/pull/50) (PR-C1)   **Branch:** `migrate/S02b-S05b-S22b-foundations`
**Status:** 🟦 PR open — `migrate/S02b-S05b-S22b-foundations` (PR-C1)

## Goal (one sentence)
Every repo function in `web/src/lib/repos/**` returns `ReadResult` / `WriteResult` carrying a typed `RepoError`, so a failed read can never be shown as an empty list, a "$0.00" or a missing record (D-032).

## In scope
- `web/src/lib/repos/types.ts` — the ADR-0004 types (`RepoErrorKind`, `RepoError`, `RepoFailure`, `ReadResult`, `WriteResult`) and the rewritten contract header.
- `web/src/lib/repos/errors.ts` (new) — the one mapping from Supabase / PostgREST / Postgres / Storage / GoTrue / fetch failures to a `RepoError`, its Spanish copy, and the `fail` / `invalid` / `noRows` / `ok` helpers every repo returns through.
- Every repo module: `events`, `gallery`, `discipleship`, `registrations`, `receipts`, `treasury/{catalog,entries,notes,payables,projects,recurring,summary,shared,index}`.
- `web/tests/unit/repos/**` — every suite moved to the new shapes, `mock-client.ts` (adds `status`), a new `results.ts` helper and `errors.test.ts`.

## Out of scope (do NOT touch)
- Live legacy files (`js/`, `css/`, root HTML, `sw.js`) — none changed. Root `CLAUDE.md` §5 keeps the legacy contract (D-032 supersedes it for `web/` only).
- `MIGRATION.md`, `ROADMAP.md` — the ledger step of this PR updates them (follow-ups below).
- UI. No route, component or loader consumes a repo yet (checked: nothing under `web/src` outside `repos/` imports one; three pure modules mention a repo in a comment only).
- DB / RLS / migrations, the S05b gates (another session in this PR), S40's new repos.

## Prereqs
- [x] Read `MIGRATION.md` §0–3 (D-007, D-027, D-030–D-032, G-018–G-021, G-024, G-029), ADR-0002, ADR-0004, `testing-and-rollout.md`, `target-architecture.md` §3, VERIFICATION, the template, and the plan's Decisions + PR-C1.
- [x] S02b done on this branch; S22, S52 and the S56b backend are on `develop`.
- [x] Baseline recorded before the first change (numbers below).
- [x] Library shapes read from the installed sources (supabase-js 2.112.3): postgrest-js resolves a failed fetch to `{ message: 'TypeError: …', code: '' }` with response `status: 0`; storage-js puts the body's status in `statusCode`; auth-js errors carry a snake_case `code` and an HTTP `status`; `delete({ count })` / `update(values, { count })` send `Prefer: count=…`.

## What changed

### The contract (`types.ts`)
```ts
type RepoErrorKind = 'network' | 'auth' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'unknown';
interface RepoError { kind: RepoErrorKind; message: string; detail?: string }
type ReadResult<T>  = { ok: true; data: T } | { ok: false; error: RepoError };
type WriteResult<T = undefined> = { ok: true; data: T } | { ok: false; error: RepoError };
```
- Reads and writes never throw. An empty list / `null` is a **success** ("nothing there"); a failure is always the `ok: false` branch.
- A read with no key to look up (`''`, `[]`) is an empty success; a key that is present but malformed is `invalid`.
- `message` is Spanish copy, safe to render; `detail` is the raw backend text for the console only.
- A delete/update that must change a row and changed none is a `not_found` failure (D-027).
- A prerender read that fails renders the loading state and lets the client refetch — never a baked-in empty state (no loader exists yet; the rule is in the header for S23/S26).

### The mapping (`errors.ts`)
Classification, first match wins:
1. **No answer at all** — response status 0, `AbortError` / `TimeoutError` / `AuthRetryableFetchError` / `FunctionsFetchError`, or the browser/Node wording of a failed fetch ("Failed to fetch", "fetch failed", "NetworkError…", "Load failed") → `network`.
2. **The code.** PostgREST `PGRST…` and Postgres SQLSTATE codes decide alone — an unlisted one is `unknown`, never guessed from the HTTP status (PostgREST answers a missing table with 404, which is a deploy bug, not "not found"). Listed: `PGRST116`→not_found, `PGRST301/302/303`→auth, `PGRST0xx`→network, `PGRST1xx`→invalid, `42501`→forbidden, `23505/23503/23P01/40001/40P01`→conflict, `23502/23514/P0001`→invalid, `P0002`→not_found; classes `08`→network, `22`→invalid, `23`/`40`→conflict, `28`→auth. GoTrue codes (auth-js `ErrorCode`) and Storage API codes come from tables in the module.
3. **The status** — the most specific one present: Storage's body `statusCode` (the API can answer 400 and put the real status in the body), then the error's own `status`, then the response status. 401→auth, 403→forbidden, 404→not_found, 409→conflict, 400/413/415/422→invalid, 408/502/503/504/520–530→network.
4. Otherwise `unknown`.

| kind | copy |
|---|---|
| network | No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo. |
| auth | Tu sesión expiró. Inicia sesión de nuevo para continuar. |
| forbidden | No tienes permiso para realizar esta acción. |
| not_found | No encontramos este registro. Puede que ya no exista o que no tengas acceso a él. |
| conflict | No se pudo guardar porque entra en conflicto con otros datos. Recarga e inténtalo de nuevo. |
| invalid | Algunos datos no son válidos. Revísalos e inténtalo de nuevo. |
| unknown | Algo salió mal. Inténtalo de nuevo en unos momentos. |

Codes whose kind copy would mislead get their own: `23505` ("Ya existe un registro con esos datos."), `23503`, `invalid_credentials`, `email_not_confirmed`, `mfa_verification_failed`, `otp_expired`, `insufficient_aal` / `reauthentication_needed`, `weak_password`, `same_password`, the three rate-limit codes and any 429. The module is pure (no client import), so S38/S39 map GoTrue errors through it too.

Logging: `fail(TAG, fn, error, status)` logs **once**, as `console.warn('[module] fn:', detail)` with the module's own tag (`[gallery]`, `[treasury]`, …), where `detail` = `code: message (hint)`. Views need not log it again. `invalid()` (refused before the network) logs nothing.

### Per module

| Module | Reads → `ReadResult` | Writes → `WriteResult` | Counted writes (0 rows → `not_found`) |
|---|---|---|---|
| `events` | 4 | 0 | — |
| `gallery` | 5 | 7 | `deleteAlbum`, `deletePhoto`, `setAlbumCover`, `reorderPhotos` |
| `discipleship` | 7 | 9 | `deleteGroup`, `removeMember` |
| `registrations` | 4 | 1 | — |
| `receipts` | 2 | 2 | `deleteReceipt` |
| `treasury/catalog` | 4 | 9 | `deleteFund`, `deleteIncomeCategory`, `deleteExpenseCategory` |
| `treasury/entries` | 5 | 9 | `deleteIncome`, `deleteExpense` |
| `treasury/notes` | 1 | 3 | `deleteNote` |
| `treasury/payables` | 1 | 4 | `deletePayable`, `markPayablePaid` (the payable update) |
| `treasury/projects` | 2 | 3 | `deleteProject` |
| `treasury/recurring` | 1 | 4 | `deleteRecurring` |
| `treasury/summary` | 4 | 0 | — |
| **Total** | **40** | **51** | **17** |

91 functions converted (counted with the TypeScript compiler API over the exported declarations). Method names and parameters are unchanged. The 15 updates that already chained `.select().single()` (`upsertAlbum`, `updatePhoto`, `upsertGroup`, `markGroupCompleted`, `updateInterestStatus`, `moveMember`, `updateFund`, `update{Income,Expense}Category`, `updateIncome`, `updateExpense`, `updateNote`, `updatePayable`, `updateProject`, `updateRecurring`) report a 0-row match as `PGRST116` → `not_found`. The 29 pure helpers (`treasury/shared`, the receipts path/retention/grouping helpers) and the 5 `subscribe*` functions are unchanged. Every `.select()` argument is still a literal (G-024); the two anon inserts still chain no `.select()` (G-006).

### Behaviour diffs (review these)
1. **Aggregates are all or nothing.** `fetchBooksSummary`, `fetchProjectTotals`, `fetchMinistryAllocationTotals`, `fetchReportEntries`, `fetchCatalog` and `fetchBudgetedMinistryIds` return `ok: false` if **any** of their parallel queries failed. The S52 `failed: string[]` field and the `FailedReads` type are removed: a balance computed without its expenses, or a report without its income, is wrong money — the "$0.00 on a failed fetch" bug (PORT-DEBT S53/S56) can no longer be represented. Each failed query is still logged (`[treasury] fetchBooksSummary payables:`).
2. **0-row writes fail (D-027).** The 17 counted writes ask PostgREST for `{ count: 'exact' }` and return `not_found` when nothing was deleted/updated (the row is gone, or RLS hid it). `deleteExpensesByNote` keeps accepting zero matches (most payables have no mirror).
3. **`deletePayable` deletes the mirror first, then the payable** (legacy: payable first). With rule 2, the legacy order strands the `auto:payable:<id>` expense for good when the second step fails — a Retry would find no payable. Mirror-first converges on Retry. Trade-off: if the payable delete fails after the mirror delete, the books lack that expense until the Retry the error state offers.
4. **`markPayablePaid` stops if the payable update matched no row** — it never posts a gasto for a bill that is still open. A failure after the update says the bill is paid and what failed: "Se marcó como pagada, pero no se pudo registrar el gasto. <kind copy>" (the raw backend text that S52 appended is now in `detail`). Retrying is safe (idempotent tag).
5. **`deleteAlbum` aborts when its photo listing fails** (legacy treated the failure as "no photos", deleted the album and orphaned every storage object).
6. **`listReceipts` with a non-integer year is `invalid`** (was `[]`); **`downloadReceipt` resolves to `ReadResult<Blob>`** (was `Blob | null`), an empty path is `invalid`.
7. **User-facing copy fixed**: `moveMember` returned the English `'invalid-args'`; the `'Argumentos inválidos'` refusals now say what is missing (`uploadPhoto` "Falta el álbum o la foto.", `deletePhoto`, `reorderPhotos`, `uploadReceipt`, `deleteReceipt`); receipts' "Año inválido." / "Mes inválido." gained a period.
8. **`uploadPhoto`'s cover step** stays best-effort (a Retry must not upload the photo twice) but its two failures are now logged instead of ignored.
9. **Treasury plumbing**: `warnRead` / `writeFail` / `writeOk` are gone from `treasury/shared.ts` (and the barrel); every module returns through `../errors`. Client-side refusals are no longer logged (treasury used to).

## Test counts

| Suite | Before | After |
|---|---|---|
| `discipleship` | 23 | 32 |
| `errors` (new) | — | 85 |
| `events` | 11 | 14 |
| `gallery` | 29 | 41 |
| `realtime` | 6 | 6 |
| `receipts` | 27 | 31 |
| `registrations` | 15 | 17 |
| `treasury-catalog` | 11 | 15 |
| `treasury-entries` | 25 | 31 |
| `treasury-notes` | 4 | 5 |
| `treasury-payables` | 13 | 18 |
| `treasury-projects` | 11 | 13 |
| `treasury-recurring` | 14 | 15 |
| `treasury-shared` | 19 | 19 |
| `treasury-summary` | 12 | 14 |
| `treasury-types` | 9 | 9 |
| `types` | 4 | 5 |
| **`tests/unit/repos`** | **16 files · 233** | **17 files · 370** |

Every read suite now has a case asserting that a failing read returns `ok: false` and **not** the empty success (`expect(res).not.toEqual({ ok: true, data: [] })`), next to a case where an empty table is `{ ok: true, data: [] }`. Network (status 0), RLS (`42501`), conflict (`23505`/`23503`), `PGRST116` and Storage `statusCode` failures are exercised through real repo calls, and every counted write has a 0-row case.

## Verification gate

```
[ ]  1. Install clean     not re-run (S02b's clean room covers the unchanged lockfile)
[x]  2. Typecheck         npm run check   → 647 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint    → prettier: all files pass · eslint: exit 0
[x]  4. Unit tests        npm run test    → before (S02b) 64 files passed | 1 skipped · 1610 passed | 2 skipped
                                            after          65 files passed | 1 skipped · 1747 passed | 2 skipped
                                            (+1 file, +137 tests — all in tests/unit/repos; re-run TZ=Asia/Tokyo: 370/370)
[ ]  5. Golden parity     n/a — no pure module changed; the fetchLiveEvents golden vectors
                          (tests/fixtures/special-events.json) still pass through the new ReadResult
                          in registrations.test.ts
[ ]  6. Build             not run here: no route imports a repo, so the bundle cannot change; skipped so as
                          not to rewrite web/build under the parallel S05b work in this worktree
[ ]  7. Preview smoke     n/a — no surface
[x]  8. Legacy untouched  only web/src/lib/repos/**, web/tests/unit/repos/** and this file
[ ]  9–11                 n/a (no UI, not a cutover)
[x] 12. Secrets/PII clean no keys, no service role; fixtures are synthetic ids and amounts
[x] 13. Ledger updated    → MIGRATION.md, PR-C1 ledger step (2026-10-19)
```

## Review follow-ups (2026-10-19)

Two reviewers checked `c226698` + `10f5a2b` with a scratch harness (the real repo code and supabase-js
2.112.3, only `fetch` and the auth storage injected). Each finding is fixed in `8e0cc07` with a test that
fails without the fix: every session guard and every other fix was mutation-checked (77 + 11 mutants, all
killed; the `InterestStatus` one by `npm run check`).

1. **A dead session read as "no data" or "$0.00".** With no session — signed out, or once a refresh is
   refused — supabase-js sends the anon key, and RLS answers a staff table with an empty 200: the harness got
   `fetchBooksSummary` → ok zeros after a revoked refresh token. Every staff-only function now calls
   `requireSession(TAG, fn)` first and returns `auth` before any query. Staff-only is read off the RLS
   policies — a call is staff-only when a signed-out visitor cannot legitimately get what it needs:

   | Module | Staff-only: session checked first | Public: never asks |
   |---|---|---|
   | `treasury/*` | all 50 (every `fin_*` policy is `to authenticated`) | — |
   | `receipts` | `listReceipts`, `downloadReceipt`, `uploadReceipt`, `deleteReceipt` (no anon policy on `fin_receipts` or the bucket) | — (the 6 pure helpers) |
   | `discipleship` | `fetchAllGroups`, `fetchGroupById`, `upsertGroup`, `deleteGroup`, `markGroupCompleted`, `fetchInterests`, `updateInterestStatus`, `fetchMembers`, `addMember`, `removeMember`, `moveMember`, `fetchMessages`, `sendMessage` | `fetchPublicGroups`, `fetchPublicGroupBy` (`dgroups_public_read`), `submitInterest` (anon insert) |
   | `gallery` | every write, `fetchAlbumByIdAdmin`, and `fetchAlbums` / `fetchAvailableYears` with `includeUnpublished` | `fetchAlbums`, `fetchAvailableYears`, `fetchAlbumBy`, `fetchPhotos` (`galbums_public_read`, `gphotos_public_read`) |
   | `events` | — | all four reads (`events_public_read`, `calevents_public_read`: every row) |
   | `registrations` | — | the four reads (`special_events_public_read`: every row, so the admin picker gets the same rows signed out) and `submitRegistrations` (anon insert) |

   `fetchCatalog`, `deletePayable` and `markGroupCompleted` delegate to guarded calls but check first
   themselves, so the one log line names the call the view made. The `subscribe*` helpers are synchronous
   channel openers, not reads: unchanged. `fetchPhotos` stays public; the admin editor reads an unpublished
   album's photos through it, but calls `fetchAlbumByIdAdmin` (staff-only) first.

   **What no session check can see:** a LIVE session that RLS filters down to nothing (no finance or
   `discipulado` tab) still reads as an empty success, indistinguishable from an empty table. That is RLS being
   the boundary (D-002); the view decides who reaches a screen. The two tests that claimed otherwise now assert
   this: `discipleship.test.ts` ("a staff read refused by RLS is forbidden" → signed out is `auth`; signed in,
   RLS-filtered is an empty success) and `treasury-summary.test.ts` ("zero is only ever a real zero" → the same
   pair).

   `tests/unit/repos/session-gate.ts` registers, per module: every exported function classified as
   staff-only, public or not a repo call (a new function cannot skip the decision); signed out, each staff-only
   call is `auth`, sends no query or storage call, asks for the session once and logs once under its own
   name; signed out, each public call still goes out and never asks.
2. **`downloadReceipt` could throw.** storage-js reads the body (`.blob()`) outside its error wrapping, so a
   connection lost mid-transfer rejected. It now catches and returns `fail()`. `errors.ts` adds to the
   no-answer set Chrome's body-read `network error` (anchored, so the phrase inside a server message that
   carries a code is still decided by the code), WebKit's `The network connection was lost.`, and a
   `StorageUnknownError` whose `originalError` is a `TypeError`, whatever its wording. Tests: a rejecting
   `download` mock for three engine wordings, a wrapped TypeError, the negative cases. Re-run with the real
   client and a live session: the dropped body resolves to `network`.
3. **G-033: aggregates truncated silently at max-rows.** `fetchBooksSummary`, `fetchProjectTotals`,
   `fetchMinistryAllocationTotals` and `fetchReportEntries` read `.range()` pages of 1000 (`max_rows` in
   Supabase and `supabase/config.toml`) under an `id`-terminated order (`order=id.asc`; the report keeps
   `occurred_on` first) until a short page. All or nothing: a failed page fails the read. A 50th page that
   comes back full is refused — `unknown`, "Hay demasiados movimientos para calcular este total. Acota el
   rango de fechas." — never truncated. Tests: two-page mocks for all four, a failed later page, the 50-page
   boundary and the cap. The local PostgREST accepts the shape (ordering by an unselected `id`, `offset` /
   `limit`). **Not changed:** the row lists in `entries.ts` (`fetchIncome`, `fetchExpenses`, the project and
   ministry-allocation lists) stay one request each, capped at 1000 rows — S53 paginates the UI, and no total
   is computed from them (noted in the module header).
4. **Invalid dates threw `RangeError`.** `fetchUpcomingEvents(new Date('…'))` and `fetchLiveEvents({ now })`
   with NaN, ±Infinity or an out-of-range epoch return `invalid('Fecha inválida.')` before any query.
5. **`InterestStatus` was `… | string`**, which collapses to `string`. It is exactly `'pending' | 'approved'
   | 'placed' | 'declined'` — `discipleship_interests_status_check` (baseline.sql:674) and legacy
   `discipleship-tab.js` — and `fetchInterests({ status })` takes it too. The tests used `new` and
   `archived`, values the CHECK rejects. A type test pins the union.

Noted, not changed: the harness's probe D — postgrest-js turns an **empty-bodied** 404 on a list read into
`{ data: [], error: null, status: 200 }` (its workaround for postgrest-js#295), so that one shape still reads
as an empty success. PostgREST itself answers 404 with a JSON body and a code (e.g. `PGRST205`); only a proxy
or CDN sending an empty 404 could produce it.

| Suite | S22b | After the follow-ups |
|---|---|---|
| `discipleship` | 32 | 50 |
| `errors` | 85 | 92 |
| `events` | 14 | 20 |
| `gallery` | 41 | 56 |
| `receipts` | 31 | 42 |
| `registrations` | 17 | 26 |
| `session` (`10f5a2b`) | — | 5 |
| `treasury-catalog` | 15 | 29 |
| `treasury-entries` | 31 | 46 |
| `treasury-notes` | 5 | 10 |
| `treasury-payables` | 18 | 24 |
| `treasury-projects` | 13 | 19 |
| `treasury-recurring` | 15 | 21 |
| `treasury-summary` | 14 | 29 |
| `types` | 5 | 6 |
| unchanged: `realtime` 6, `treasury-shared` 19, `treasury-types` 9 | | |
| **`tests/unit/repos`** | **17 files · 370** | **18 files · 509** |

```
[x]  2. Typecheck         npm run check   → 653 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint    → prettier: all files pass · eslint: 0 problems
[x]  4. Unit tests        npm run test    → 67 passed | 1 skipped files · 1979 passed | 2 skipped
                                            (+134 in tests/unit/repos, +93 in S05b's layer-boundaries)
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build → 15 prerendered pages;
                          npm run budget → 15 pages within budget (±0.0%: no route imports a repo yet)
[x] 14. Cross-engine e2e  E2E_PORT=4185 npx playwright test → 504 tests, 0 failed (see S05b)
```

## How to resume if interrupted
- Branch: `migrate/S02b-S05b-S22b-foundations` (worktree `IR-port-foundations`). S22b is committed:
  `c226698` (the contract), `10f5a2b` (`requireSession`), `8e0cc07` (the review follow-ups).
- Done: everything above.
- Next concrete action: open PR-C1 and paste the gate results.

## Landmines
1. **The local S23 branch** (`migrate/S23-S36-public-site`) must adapt on rebase: its `repos/newsletter.ts` returns through `./errors` (`fail` / `invalid` / `ok`) and resolves to a `WriteResult` carrying a `RepoError`, so any consumer that rendered the old string `error` renders `error.message` (the safe copy) instead; its homepage loaders branch on `res.ok`, and a failed prerender read renders the **loading** state with a client refetch, never an empty section (ADR-0004 item 3).
2. **The unmerged DF-004 branch** rewrites `repos/gallery.ts` (the storage variants). Whichever lands second resolves `storageVariants`, `deleteAlbum`, `uploadPhoto` and `deletePhoto` by hand: DF-004's variant set + this contract (counted deletes, `fail`/`invalid`/`ok`, `deleteAlbum` aborting on a failed photo listing).
3. **Counted writes depend on `Content-Range`.** supabase-js reads the count from that header; PostgREST exposes it to the browser (the `head: true` counts rely on the same header). If a proxy ever stripped it, counted deletes would report `not_found` — a loud failure, by design.
4. **Repo tests:** the mock client returns `status` (200, or 500 when the canned result has an `error`) and `count`; a counted write needs `count: 1` in its canned result or it comes back `not_found`. Build expected failures with `tests/unit/repos/results.ts` instead of restating the copy.
5. **S53's port of `form-wizard.js`**: S52's landmine said `res.error.message` did not exist on a `WriteResult`; it does now, and it is the copy to show.
6. **Log tag:** failures log under each module's own tag (`[gallery] fetchAlbums:`), the CLAUDE.md §5 house style the S22/S52 suites already pinned, not one shared `[repos]` tag.
7. **A new repo function must be classified.** The mock client answers a signed-in session unless a test sets `mock.session`, and each suite's `describeSessionGate` fails until a new export is listed as staff-only (and calls `requireSession` first), public, or not a repo call. Decide from the RLS policies, not from who calls it.

## On completion (ledger step of PR-C1)
- [ ] `MIGRATION.md`: S22b on the board/Current state; D-032 executed; candidate gotchas — "classify Supabase errors by code, never by HTTP status when a SQLSTATE/PGRST code exists (PostgREST answers a missing table with 404)", "Storage puts the real status in the body `statusCode`", "a 0-row delete/update is only detectable with `{ count: 'exact' }` — RLS filters silently".
- [ ] `ROADMAP.md` S22b row → done; PORT-DEBT S53/S56 "$0.00 on a failed fetch" notes can point at the all-or-nothing aggregates.
- [ ] Paste the gate results into the PR; set this file's Status and PR number.
