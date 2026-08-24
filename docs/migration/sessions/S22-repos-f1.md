# Session S22 — Data-layer repos F1 (public-read)

> Target path in the repo: `docs/migration/sessions/S22-repos-public.md`

**Stream:** foundation
**Depends on:** S06 (typed client + `database.types.ts`), S05 (Vitest harness), S07 (`$lib/date`)   **PR:** <#___>   **Branch:** `migrate/S22-repos-public`
**Status:** 🟦 PR open

## Goal (one sentence)
Give every public-site Supabase query for the events / gallery / discipleship / registrations domains a typed, never-throwing repo function under `web/src/lib/repos/`, porting `js/lib/discipleship.js`, `js/lib/gallery.js` and `js/lib/special-events.js` and extracting the inline `sb.from()` calls from the public pages and components.

## In scope
- `web/src/lib/repos/{types,events,gallery,discipleship,registrations}.ts` — the typed data layer.
- `web/src/lib/{slug,gallery,discipleship,special-events}.ts` — the **pure** halves of the three legacy libs (vocabularies, display status, lifecycle rules), split out so UI can import them without the client. Golden-tested against the legacy modules.
- `web/tests/fixtures/{discipleship,gallery,special-events}.json` — goldens captured by running the LEGACY modules (TZ=America/New_York and Asia/Tokyo, byte-identical).
- `web/tests/golden/{discipleship,gallery,special-events}.test.ts`, `web/tests/unit/repos/*.test.ts` (+ `mock-client.ts` recorder).

## Out of scope (do NOT touch)
- Every live legacy file under `js/`, `css/`, `src/`, root HTML — nothing outside `web/` changes.
- DB / RLS / migrations — the repo layer runs against the existing policies (D-002).
- Admin-support repos (`profiles`, `ministries`, `settings`, …) → S40. Treasury `fin_*` → S52.
- `image-optimizer.js` (S46 — `uploadPhoto` takes already-optimised blobs), `YT_*` sermon fetches (S30), `app_settings`/`maintenance.js` (S24/S40).
- No showcase route (no UI in this session).

## Prereqs (read before writing code)
- [x] Read `MIGRATION.md` (§0, §2 D-002/D-005/D-007, §3 G-001/G-002/G-004/G-006) and `CLAUDE.md` §5.
- [x] S06 present on `origin/migrate/S09-pdf` (typed `supabase` client + generated `Database`).
- [x] Legacy source of truth: `js/lib/discipleship.js`, `js/lib/gallery.js`, `js/lib/special-events.js`, `js/main.js:129-170`, `js/components/calendar.js:45-59`, `js/components/event-detail.js:41`, `js/pages/eventos/hub.js:54-59`, `js/pages/eventos/registro-wizard.js:441-490`.
- [x] Fixture / golden: created this session (`web/tests/fixtures/{discipleship,gallery,special-events}.json`).

## Steps
1. Catalogue every non-admin `sb.from()` / `sb.channel()` (see NOTES.md §1) and map each to a repo function.
2. Capture goldens by running the legacy pure helpers under Node with stubbed imports (NOTES.md §4).
3. Port the pure halves (`$lib/slug`, `$lib/gallery`, `$lib/discipleship`, `$lib/special-events`) with explicit `now`/`today` params so prerenders are deterministic.
4. Write the four repos against `Tables<'…'>` / `TablesInsert<'…'>` with the read/write contract in `repos/types.ts`; `subscribe*` no-ops when `!browser`.
5. Unit-test query shape (table, columns, filters, order), never-throw, `WriteResult`, G-006 (no `.select()` on the two anon inserts), realtime channel names + teardown, and a type-level suite.
6. Run the gate.

## Acceptance criteria
- [x] Every public `sb.from()` for `events`, `calendar_events`, `special_events`, `gallery_*`, `discipleship_*`, `event_registrations` has a typed repo fn (catalogue in NOTES.md §1 — 100 % covered).
- [x] Reads never throw: `console.warn('[module] fn:', message)` + safe empty. Writes return `{ ok: true, data } | { ok: false, error }`.
- [x] G-006: `submitInterest` and `submitRegistrations` insert with **no** `.select()` — asserted by tests.
- [x] Pure helpers byte-identical to legacy goldens (204 golden vectors), TZ-independent.
- [x] `subscribe*` opens no socket during prerender (`browser === false`); in the browser it uses the legacy channel names/filters and tears down via `removeChannel`.
- [x] No `any`; strict; named exports; boxed header comments.

## Verification gate
- [x] Ran `docs/migration/VERIFICATION.md` — results (scratch harness = `git archive origin/migrate/S09-pdf web` + these files, `.env` stubbed):

```
[x]  1. Install clean     npm ci                      → 280 packages, 0 errors
[x]  2. Typecheck         npm run check               → 449 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint                → prettier: all files pass · eslint: 0 problems
[x]  4. Unit tests        npm run test                → 25 files passed | 1 skipped · 667 tests passed | 2 skipped
                                                        (baseline before S22: 16 files · 417 tests → +9 files, +250 tests)
[x]  5. Golden parity     npm run test:golden         → discipleship / gallery / special-events goldens green;
                                                        re-run under TZ=Asia/Tokyo: 18 files · 621 tests passed
[x]  6. Build             BASE_PATH=/app npm run build → "✓ built", adapter-static wrote build/, prerender with no network
[ ]  7. Preview smoke     n/a — no route/surface in this session
[x]  8. Legacy untouched  only web/** added; no legacy file modified
[ ]  9. Parity walk       n/a (no UI); parity is the golden suite (#5)
[ ] 10. SEO diff          n/a
[ ] 11. SW cache bumped   n/a (not a cutover)
[x] 12. Secrets/PII clean anon key only via $lib/config; fixtures hold synthetic ids/phones ("617…" placeholders)
[ ] 13. Ledger updated    → to do in the PR: MIGRATION.md status board (S22 🟦), Current state, Next up; new G-013 (NOTES.md §6)
```

## How to resume if interrupted
- Branch: `migrate/S22-repos-public`. Last known-good: the scratch deliverables in this folder (all four gates green).
- Done so far: everything in "In scope"; gate run; NOTES.md written.
- Next concrete action: copy `web/**` + this file into the branch, run `cd web && npm run check && npm run lint && npm run test && BASE_PATH=/app npm run build`, update `MIGRATION.md`, open the PR.
- Landmines: see NOTES.md §6 (select-string literal typing, `browser` stub, `.single()` → `.maybeSingle()`, legacy URL builders).

## On completion
- [ ] Update `MIGRATION.md`: status board (S22 🟦 → ✅ on merge), Current state, Next up (S26/S27/S29/S31/S34 now unblocked on S22), append G-013.
- [ ] Open/refresh the PR; paste the gate results above; link this file.
- [ ] Set this file's Status and PR number.
