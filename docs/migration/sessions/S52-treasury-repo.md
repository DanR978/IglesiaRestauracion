# Session S52 — Data-layer F2: typed treasury repo

> Target path in the repo: `docs/migration/sessions/S52-treasury-repo.md`

**Stream:** hard-subsystem (data layer)
**Depends on:** S06 (typed client + `database.types.ts`), S08 (`money.ts`), S05 (Vitest harness), S22 (repo contract)   **PR:** <#___>   **Branch:** `migrate/S52-treasury-repo`
**Status:** 🟦 PR open

## Goal (one sentence)
Give every `fin_*` query in the legacy treasury surface a typed, never-throwing repo function under `web/src/lib/repos/treasury/`, with the date range pushed into the query (fixes PERF-07) and money crossing the boundary as integer cents (D-003).

## In scope
- `web/src/lib/repos/treasury/` — `index.ts` (barrel + the frozen surface), `shared.ts` (pure: cents mapping, allocation contract, `auto:` tags, date ranges), `entries.ts` (`fin_income`/`fin_expenses`), `summary.ts` (aggregates), `catalog.ts` (funds + categories), `recurring.ts`, `payables.ts`, `notes.ts`, `projects.ts`.
- `web/tests/unit/repos/treasury-{shared,entries,summary,catalog,recurring,payables,notes,projects,types}.test.ts` — query shape, never-throw, cents exactness, allocation encode/decode, `auto:` tag handling, plus a type-level suite.

## Out of scope (do NOT touch)
- Every live legacy file under `js/`, `css/`, `admin/`, `src/` — DUAL-MAINTENANCE. Nothing outside `web/` changes.
- DB / RLS / migrations. The repo runs against the existing policies (D-002); the D-019 widening is S56b's.
- UI. No route, no component, no Svelte file — S53/S54/S55/S56 mount this layer.
- `ministries` (`report-builder.js:43`) and `audit_log` (`activity-tab.js:51`) — S40's repos, not `fin_*`.
- The dead `renderReports()`/`printReport()` yearly report (`treasury-tab.js:441-539`) — PORT-DEBT S55 says do not re-implement.

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 — D-002, D-003, D-016, D-018, D-019 — §3 — G-002, G-014, G-015, G-016, G-024, G-025 — and Current state) and `CLAUDE.md` §5/§7.
- [x] Confirm S06 + S08 are ✅ on the status board. (Both merged; S22's `repos/types.ts` contract is also on `main` as of `fcadf1b`.)
- [x] Schema verified column-by-column against `supabase/migrations/00000000000000_baseline.sql` (`:767-915` DDL, `:1683-1764` FKs, `:1966-2177` RLS) and `web/src/lib/db/database.types.ts` (`:689-1092`) — never against the legacy JS.
- [x] Legacy source of truth: `js/pages/admin/treasury-tab.js`, `project-treasury.js`, `report-builder.js`, `activity-tab.js`, `form-wizard.js`. Full catalogue in NOTES.md §1.
- [x] Fixture / golden: **none — box #5 is N/A for this session.** There is no legacy oracle to be byte-identical to: the port's whole point is the approved float→cents divergence (D-003) and the range pushdown. The oracle is the Vitest suite written here (118 assertions), and the treasury golden diff lands with S53 per D-003.

## Steps
1. Catalogue every `sb.from('fin_*')` call in the five legacy files → NOTES.md §1 (`file:line` → table → filters → repo fn). 100 % covered.
2. Write `shared.ts` first (pure, no client): cents mappers, `centsError`, `sumCents`, `monthRange`/`yearRange`/`lastDayOfMonth`, `allocDecode`/`allocEncode`, the `auto:` tag builders and `cleanNote`.
3. Write the seven query modules against `Tables<>`/`TablesInsert<>`/`TablesUpdate<>`, each `.select()` a literal string (G-024); barrel them from `index.ts`.
4. Push every church-books range into the query; make `DateRange` a **required** argument there so an unbounded books read cannot compile.
5. Unit-test each catalogued legacy query's shape (table, literal select, filters incl. the pushed-down range, order), the never-throw and `WriteResult` contracts, cent round-trips over awkward amounts, the allocation contract, and the `auto:` tag idempotency — plus a type-level suite.
6. Run the gate.

## Acceptance criteria
- [x] Every `sb.from('fin_*')` in the legacy treasury surface has a typed repo fn (NOTES.md §1 — 100 %; the two non-`fin_*` tables are recorded as S40's).
- [x] Reads never throw: `console.warn('[treasury] fn:', message)` + safe empty. Writes never throw: `{ ok:true, data } | { ok:false, error }`.
- [x] **Money never crosses as a float.** Entries are `Omit<Row,'amount'> & { amountCents }`; the dollars column is structurally unreachable (`expectTypeOf<IncomeEntry>().not.toHaveProperty('amount')`), and the assertion was verified to actually fail `npm run check` when broken.
- [x] Cent conversion is exact in both directions over 26 awkward amounts, signed, as number and as string.
- [x] **PERF-07:** the church-books reads require a `DateRange`; project/ministry reads accept one. No repo function filters a range in JS.
- [x] Legacy semantics preserved exactly: `project_id IS NULL` = church books; `allocEncode` label-first and case-sensitive; `auto:recurring:<id>:<month>` / `auto:payable:<id>` + `cleanNote()`; `materializeRecurring` monthly-only; `openPayablesCents` all-time.
- [x] `materializeRecurring` is idempotent AND cannot double-post: a failed existing-tag read aborts instead of re-inserting (the one deliberate hardening — legacy would have duplicated the month).
- [x] No `any`, strict, named exports, boxed header comments, Spanish user-facing strings / English identifiers.
- [x] No legacy file modified.

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md`. Scratch harness = `git -c core.autocrlf=false -c core.eol=lf archive origin/main web` (see NOTES.md §6 — the G-025 command needs `core.eol=lf` too) + these files, `.env` stubbed with `PUBLIC_SUPABASE_URL=https://example.supabase.co` / `PUBLIC_SUPABASE_ANON_KEY=stub`.

```
[x]  1. Install clean     npm ci                        → 0 errors (4 pre-existing audit advisories, untouched)
[x]  2. Typecheck         npm run check                 → 517 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
[x]  3. Lint / format     npm run lint                  → prettier: "All matched files use Prettier code
                                                           style!" · eslint: exit 0, 0 problems
[x]  4. Unit tests        npm run test                  → 40 files passed | 1 skipped (41)
                                                           879 tests passed | 2 skipped (881)
                                                           baseline before S52: 31 files / 761 tests
                                                           → +9 files, +118 tests (S52 files alone: 9 / 118)
                                                         re-run TZ=Asia/Tokyo: identical, 879 passed | 2 skipped
[ ]  5. Golden parity     n/a — no legacy oracle for this layer (D-003 float→cents IS the approved
                              divergence; the treasury golden diff lands with S53). The existing
                              suite was re-run unchanged: npm run test:golden → 12 files / 533 tests.
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build
                                                         → "✓ built in 2.37s"; adapter-static
                                                           "Wrote site to build" ✔ done; prerender, no network
[ ]  7. Preview smoke     n/a — no route or surface in this session
[x]  8. Legacy untouched  git status --porcelain identical to the pre-session state (4 unrelated
                          pre-existing modifications left alone); every S52 file is new under web/
[ ]  9. Parity walk       n/a (no UI). Parity is the catalogue in NOTES.md §1 + the query-shape suite.
[ ] 10. SEO diff          n/a
[ ] 11. SW cache bumped   n/a (not a cutover)
[x] 12. Secrets/PII clean grep of the patch: no service_role, no keys, no PII — fixtures are synthetic
                          uuids and amounts; the client comes from $lib/db/client only
[ ] 13. Ledger updated    → to do in the PR: MIGRATION.md status board (S52 🟦), Current state, Next up
                            (S53 + S56 unblocked), and the G-025 amendment from NOTES.md §6
```

## How to resume if interrupted
- Branch: `migrate/S52-treasury-repo`. Last known-good: the scratch deliverables in this folder (all four gates green).
- Done so far: everything in "In scope"; catalogue, repo, tests, gate run, NOTES.md written.
- Next concrete action: copy `web/**` + this file into the branch, run `cd web && npm run check && npm run lint && npm run test && MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build`, update `MIGRATION.md`, open the PR.
- Landmines: NOTES.md §5 — especially (1) `form-wizard.js` reads `res.error.message`, which a `WriteResult` does not have, so S53's wizard port must switch to `if (!res.ok)`; (2) `.select()` must stay a literal string (G-024); (3) `monthRange`/`yearRange` throw on a malformed key by design; (4) `markPayablePaid` has a non-transactional partial-failure window and says so in Spanish.

## On completion
- [ ] Update `MIGRATION.md`: status board (S52 🟦 → ✅ on merge), Current state, Next up; append the G-025 amendment (`-c core.eol=lf`, cause = root `.gitattributes` `* text=auto`); correct the board line that still shows S11–S13/S22 as 🟦 (they are merged into `main`).
- [ ] Open/refresh the PR; paste the gate results above; link this file.
- [ ] Set this file's Status and PR number.
