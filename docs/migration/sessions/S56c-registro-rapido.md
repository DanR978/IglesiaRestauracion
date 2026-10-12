# Session S56c — Registro rápido (bulk entry + paste import for ingresos/gastos)

**Stream:** admin / hard-subsystem
**Depends on:** S53, S56   **PR:** <#___>   **Branch:** `migrate/S56c-registro-rapido`
**Status:** ⬜ not started

## Goal (one sentence)
Add an intuitive bulk-entry flow — a repeatable quick-row grid PLUS a "pegar desde Excel/CSV" box
that parses into the same grid for preview — to the church books' Ingresos/Gastos and the
ministry/project quick-add, inserting all rows in one atomic batch with totals in integer cents.

## In scope
- `web/src/lib/bulk-parse.ts` — PURE parsing module (delimiter sniff, dates, money→cents) + Vitest suite.
- `web/src/lib/components/bulk/BulkEntryGrid.svelte` + `PasteImport.svelte`.
- Batch-insert fns added to the S52 treasury repo (`insertIncomeBatch(rows)`, `insertExpenseBatch(rows)`).
- Mounts: S53 Ingresos + Gastos views ("Registro rápido" button beside "Agregar", opens a wide S16
  Modal) and the S56 ministry/project view addbar (same component, project context fixed).

## Out of scope (do NOT touch)
- Any legacy file. Receipts (S56b). Recurrentes/Por pagar/Notas/Config (S54). Reports (S55).
- No new DB objects, no RLS change — plain `fin_income`/`fin_expenses` inserts under existing policies.
- No file import (xlsx upload) — paste only; a real file importer is a post-migration issue.

## Prereqs (read before writing code)
- [ ] Read `MIGRATION.md` (§0, §2 — D-003 cents, D-016 money tokens — §3 esp. G-002 dates), `CLAUDE.md`,
      `docs/admin-ux.md`, and `docs/migration/DESIGN-SYSTEM.md` (form vocabulary, DataTable collapse).
- [ ] Confirm S53 + S56 ✅. Read the S53 wizard specs' payload shapes (ported from
      `js/pages/admin/treasury-tab.js` WIZ.income/WIZ.expenses `toPayload`) — bulk rows must produce
      IDENTICAL payloads (`occurred_on, source, fund, amount, note, created_by` /
      `occurred_on, ministry_id, label, payee, category, amount, status, note, created_by`).
- [ ] Legacy source of truth for the allocation contract: `treasury-tab.js` `allocChoice/allocDecode/allocEncode`
      (General '' → both null; ministry uuid → ministry_id; 'pastor' → label='Pastor') — reuse the S53 port.
- [ ] Fixture/golden: none from legacy (new feature — box #5 N/A). The oracle is the `bulk-parse.ts`
      Vitest suite written THIS session (it becomes the contract).

## Steps
1. Build `bulk-parse.ts` with its test suite FIRST (pure, no DOM):
   - **Delimiter sniff** per pasted block, in priority order: tab (Excel) → semicolon → comma; a
     delimiter must appear on ≥80% of non-empty lines to win; quoted CSV fields (`"a, b"`) honored.
   - **Dates** → `YYYY-MM-DD` strings (G-002 — never `new Date` round-trips): accepts `dd/mm/yyyy`,
     `d/m/yy` (yy→20yy), `dd-mm-yyyy`, `yyyy-mm-dd`. Ambiguity rule: day-first ALWAYS (Spanish-locale
     paste); document it in the UI hint. Invalid date → per-row error, never a guess.
   - **Money → integer cents** via S08 `money.ts` `toCents`, after normalization: strip `$`, spaces,
     currency words; if BOTH `.` and `,` present, the LAST separator is the decimal; a single `,`
     followed by exactly 2 digits at end = decimal comma; else thousands. Negative/zero → row error.
   - **Column mapping**: 3 cols = fecha, concepto, monto; 4 cols = fecha, concepto, monto, nota;
     header row auto-detected (first row without a parsable date/amount) and skipped.
   - Output: `{ rows: ParsedRow[], errors: {line, field, message}[] }` — never throws.
2. `BulkEntryGrid.svelte`: repeatable rows — ingresos: fecha (default hoy) · fuente (select from
   income categories) · monto · nota; gastos: fecha · asignado-a (allocation choice) · pagado-a ·
   categoría (select) · monto · estado (default Pagado) · nota; ministry/project mode: fecha ·
   concepto · monto · nota (payload per `project-treasury.js addEntry`, category 'Proyecto',
   status 'paid'). Add row (button + Enter on last row), per-row remove, inline per-row validation,
   **live total** via `sumC` styled with the semantic money tokens (D-016). ≤768px each row
   collapses to a labeled card — no horizontal scroll ever (admin-ux §2).
3. `PasteImport.svelte`: textarea + "Analizar" → fills the grid (parse errors listed per line with
   the offending text, valid rows editable before saving). Paste never inserts directly — the grid
   IS the preview.
4. Save: map rows through the S53 payload builders → ONE `.insert(rows)` per table. A single batch
   insert is **atomic** — there is no partial DB failure; "partial failure" is handled ENTIRELY
   client-side (invalid rows block save; the button shows "Guardar N movimientos" counting only
   valid rows — with invalid rows present, offer "Corregir" or "Guardar solo los válidos"). On a
   server error: map the message to human Spanish, keep ALL rows in the grid (zero data loss),
   toast the failure. On success: "N movimientos agregados", close, refetch the underlying view.
5. Playwright smoke: paste a 10-row tab-separated block with 1 bad date + 1 bad amount → 8 valid
   rows + 2 inline errors → save valid → list shows 8 new rows and the month total moves by the
   exact cent sum.

## Acceptance criteria
- [ ] `bulk-parse.ts` suite green: tab/semicolon/comma sniffing; `dd/mm/yyyy`, `d/m/yy`, `yyyy-mm-dd`;
      `"1.234,56"` → 123456, `"1,234.56"` → 123456, `"$12.50"` → 1250, `"12,5"` → row error
      (ambiguous — documented), header-row skip; run under two TZs per G-002.
- [ ] Grid + paste flows work in all three mounts; gastos allocation encodes exactly like the wizard.
- [ ] One `.insert(rows)` per save (network tab shows a single request); wizard single-add unchanged.
- [ ] Live total exact in cents vs hand-computed (D-003); money colors via tokens only (D-016).
- [ ] Usable at 360px; inputs ≥16px on mobile; all copy Spanish; identifiers English.

## Verification gate
- [ ] `docs/migration/VERIFICATION.md` — #1,2,3,4,6,7,8,12,13; #5 N/A (new feature, recorded here).

## How to resume if interrupted
- Branch: `migrate/S56c-registro-rapido`. Done so far: <bullets>. Next action: <…>.
- Landmines: dates stay `YYYY-MM-DD` strings end-to-end (G-002); never send floats — cents convert
  at the repo boundary exactly as S52/S53 do; don't fork the allocation logic — import the S53 port.

## On completion
- [ ] Update `MIGRATION.md`: S56c ✅, Current state, Next up; append any new G-xxx.
- [ ] Open PR; paste gate results; link this file.
