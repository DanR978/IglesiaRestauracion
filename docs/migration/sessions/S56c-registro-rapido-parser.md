# Session S56c (parser half) — bulk-entry engine

> Target path in the repo: `docs/migration/sessions/S56c-registro-rapido.md` (this file replaces the
> "⬜ not started" spec of the same name; the spec's Steps 2–5 — the Svelte grid/paste UI, the batch
> repo fns and the Playwright smoke — stay open and are re-listed under "How to resume" below).

**Stream:** admin / hard-subsystem
**Depends on:** S07 (`$lib/date`), S08 (`$lib/money`), S05 (Vitest harness) — **not** S53/S56, which the
UI half still needs   **PR:** <#\_\_\_>   **Branch:** `migrate/S56c-registro-rapido`
**Status:** 🟦 PR open

## Goal (one sentence)

Build the PURE half of Registro rápido — `web/src/lib/bulk-parse.ts`, the "pegar desde Excel" engine
(delimiter sniff → day-first dates as `YYYY-MM-DD` strings → money as integer cents) plus the row →
insert-payload mappers the wizard and the grid must share — with a Vitest suite exhaustive enough to
be the frozen contract the UI session is written against.

## In scope

- `web/src/lib/bulk-parse.ts` — parser (`parseBulkPaste`, `parseDate`, `parseAmount`) + payload
  mappers (`toInsertPayload`, `targetTable`, `allocDecode`) + the Spanish `FIELD_LABELS`.
- `web/tests/unit/bulk-parse.test.ts` — 178 tests; the contract, incl. the two-timezone date block.

## Out of scope (do NOT touch)

- Every legacy file (`js/`, `css/`, `admin/`, `src/`) — DUAL-MAINTENANCE; the feature exists only
  under `/app`.
- `BulkEntryGrid.svelte` / `PasteImport.svelte` (spec steps 2–3) — they need the S21 FormWizard /
  DataTable work and the S53/S56 treasury views.
- `insertIncomeBatch` / `insertExpenseBatch` (spec step 4) — they belong to the S52 treasury repo.
- DB / RLS / migrations: none. Plain `fin_income` / `fin_expenses` inserts under existing policies.
- Receipts (S56b). Reports (S55). Recurrentes / Por pagar / Notas / Config (S54).

## Prereqs (read before writing code)

- [x] Read `MIGRATION.md` (§0, §2 — D-002, **D-003 cents**, D-016 — §3 — **G-002 dates**, G-014,
      G-015, G-016, G-024, G-025), `CLAUDE.md` (§5, §7), `docs/migration/VERIFICATION.md`,
      `SESSION-TEMPLATE.md`, and the two feature specs `S56b-treasury-recibos.md` /
      `S56c-registro-rapido.md`.
- [x] Schema verified against git, not memory: `supabase/migrations/00000000000000_baseline.sql`
      — `fin_income` (`baseline.sql:818-831`) and `fin_expenses` (`baseline.sql:781-798`), including
      both `check (amount >= 0)` constraints and `fin_expenses_status_check in ('paid','pending')`.
- [x] Dependency sessions: S07 ✅, S08 ✅ on the board. S53/S56 are ⬜ — this session deliberately
      ships only the half that does not depend on them (see NOTES.md §2, decision D-a).
- [x] Legacy source of truth: `js/pages/admin/treasury-tab.js:35-45` (`allocChoice`/`allocDecode`/
      `allocEncode`), `:181-182` (`WIZ.income.toPayload`), `:202-205` (`WIZ.expenses.toPayload`);
      `js/pages/admin/project-treasury.js:294` (`addEntry`), payload at `:310-316`.
- [x] Fixture / golden: **none — new feature, VERIFICATION.md box #5 is N/A** (the spec says so
      explicitly). The oracle is the suite written this session.

## Steps

1. Catalogued the legacy payload shapes and the allocation vocabulary (NOTES.md §1) and checked each
   field against the baseline schema.
2. Wrote `bulk-parse.ts`: line splitting with quote awareness → delimiter sniff (tab → `;` → `,`,
   ≥80 % of non-empty lines) → header detection → positional 3/4-column mapping → per-field
   validation. No `Date`, no clock, no DOM, no Supabase.
3. Wrote the payload mappers as ONE overloaded `toInsertPayload(row, ctx)` so the wizard and the grid
   cannot drift, reproducing the legacy field sets key-for-key.
4. Wrote the 178-test contract, incl. the money matrix, the day-first date matrix under
   `TZ=America/New_York` **and** `TZ=Asia/Tokyo`, and a `Date`-constructor trap.
5. Ran the gate in a scratch harness (`git archive` of `origin/migrate/S22-repos` + these two files).

## Acceptance criteria

- [x] Delimiter sniff: tab / semicolon / comma, priority order, the 80 % threshold (4-of-5 accepted,
      3-of-5 rejected), quoted fields containing the delimiter, and a single row error when nothing
      splits the block.
- [x] `dd/mm/yyyy`, `d/m/yy` (→ 20yy), `dd-mm-yyyy`, `yyyy-mm-dd` (and `/`-separated ISO), day-first
      always; `04/13/2026`, `31/02/2026`, `29/02/2026` are errors, `29/02/2024` is not; dates stay
      `YYYY-MM-DD` strings and the parser never constructs a `Date` (asserted, not asserted-by-eye).
- [x] `"1.234,56"` → 123456, `"1,234.56"` → 123456, `"$12.50"` → 1250, `"12,5"` → row error;
      negatives (ASCII and U+2212), zero, NBSP/narrow-NBSP thousands, currency words, out-of-range.
- [x] Header row auto-detected (Spanish, English, 3- and 4-column) and skipped; only the FIRST line
      is ever a header; a lone line never is.
- [x] 3-col vs 4-col mapping, ragged rows, trailing empty Excel cells, blank lines, CRLF/LF/CR, BOM,
      a 200-row paste totalling exactly `$20,150.00` in cents.
- [x] `parseBulkPaste` never throws (13 adversarial inputs) and returns `{ rows, errors }`.
- [x] Payload mappers for all three modes (+ project income/expense) reproduce the legacy field sets
      exactly, including the allocation encoding (General → both null · ministry uuid →
      `ministry_id` · Pastor → `label:'Pastor'`) and the project hardcodes `category:'Proyecto'`,
      `status:'paid'`.
- [x] TypeScript strict, no `any`, named exports, boxed header comment, Prettier-clean.

## Verification gate

Ran `docs/migration/VERIFICATION.md` in a scratch harness — `git -c core.autocrlf=false -c core.eol=lf
archive origin/migrate/S22-repos web` (see NOTES.md §5, the G-025 addendum) + the two deliverable
files, `web/.env` stubbed with `PUBLIC_SUPABASE_URL=https://example.supabase.co` /
`PUBLIC_SUPABASE_ANON_KEY=stub`:

```
[x]  1. Install clean     npm ci                        → 0 errors
[x]  2. Typecheck         npm run check                 → 501 FILES 0 ERRORS 0 WARNINGS
[x]  3. Lint / format     npm run lint                  → prettier: all matched files pass ·
                                                          eslint: 0 problems
[x]  4. Unit tests        npm run test                  → 32 files passed | 1 skipped (33)
                                                          939 tests passed | 2 skipped (941)
                                                          baseline without this file: 763 → +178 tests
                                                          mutation check: swapping day/month in
                                                          parseDate turns 38 of them red
[ ]  5. Golden parity     n/a — new feature, no legacy oracle (the spec records box #5 as N/A).
                          Substitute: the suite above. The pre-existing goldens stay green:
                          npm run test:golden → 12 files · 533 tests passed
[x]  6. Build             MSYS_NO_PATHCONV=1 BASE_PATH=/app npm run build
                                                        → "✓ built in 3.06s" · adapter-static wrote
                                                          build/ · prerender ran with no network
[ ]  7. Preview smoke     n/a — no route or surface in this session (pure module)
[x]  8. Legacy untouched  only web/src/lib/bulk-parse.ts + web/tests/unit/bulk-parse.test.ts added;
                          no legacy file read-modified, nothing outside web/ changed
[ ]  9. Parity walk       n/a (no UI). Payload parity is asserted by the mapper tests (#4)
[ ] 10. SEO diff          n/a
[ ] 11. SW cache bumped   n/a (not a cutover)
[x] 12. Secrets/PII clean no keys, no PII; fixtures are synthetic uuids and church vocabulary
[ ] 13. Ledger updated    → to do in the PR: MIGRATION.md status board (S56c 🟨 parser half),
                          Current state, Next up; append the G-025 addendum from NOTES.md §5
```

## How to resume if interrupted

- Branch: `migrate/S56c-registro-rapido`. Done so far: everything under "In scope"; all four gates
  green; NOTES.md written.
- Next concrete action: copy the two `web/**` files + this session file onto the branch, run
  `cd web && npm run check && npm run lint && npm run test && BASE_PATH=/app npm run build`, update
  `MIGRATION.md`, open the PR.
- **Still open in the S56c spec** (blocked on S21 FormWizard/DataTable and S53/S56):
  step 2 `BulkEntryGrid.svelte`, step 3 `PasteImport.svelte`, step 4 `insertIncomeBatch` /
  `insertExpenseBatch` + the save flow, step 5 the Playwright smoke.
- Landmines (full list in NOTES.md §5): `amount` in every payload is **cents** — the repo converts
  with `toNumeric()` at the `.insert()` boundary; dates never round-trip through `Date`; do not fork
  `allocDecode` when S53 lands; a lone `.` is always the decimal point (`"1.234"` is $1.23).

## On completion

- [ ] Update `MIGRATION.md`: status board (S56c parser half 🟦 → ✅ on merge, UI half still ⬜),
      Current state, Next up; append the G-025 addendum.
- [ ] Open/refresh the PR; paste the gate results above; link this file.
- [ ] Set this file's Status and PR number.
