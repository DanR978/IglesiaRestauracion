/* ============================================================================
 * web/src/lib/repos/treasury/index.ts — the treasury data layer (S52)
 * ----------------------------------------------------------------------------
 * ONE import path — `#lib/repos/treasury` — for every `fin_*` query in the new
 * app. This is a FROZEN FOUNDATION: S53 (books), S54 (recurrentes / por pagar
 * / notas / config), S55 (reportes), S56 (ministry & project), S56b (recibos)
 * and S56c (registro rápido) all sit on these signatures, so changing one is a
 * cross-session decision, not a refactor.
 *
 * It is a folder rather than one file because the treasury spans nine tables
 * and three consumer shapes; each module is one table's slice of the surface
 * and stays readable on its own:
 *
 *   shared.ts     PURE — no Supabase import. Cents mapping (D-003), the
 *                 allocation contract, the `auto:` note tags, date ranges.
 *                 Import it directly when you want the rules without a client.
 *   entries.ts    `fin_income` + `fin_expenses`: row reads and every write.
 *   summary.ts    Narrow, aggregated projections: Resumen KPIs, project
 *                 rollups, the report-builder feed.
 *   catalog.ts    `fin_funds`, `fin_income_categories`, `fin_expense_categories`.
 *   recurring.ts  `fin_recurring` + `materializeRecurring(month)`.
 *   payables.ts   `fin_payables` + the `auto:payable:<id>` books mirror.
 *   notes.ts      `fin_notes`.
 *   projects.ts   `fin_projects` containers (owner- and D-019 ministry-scoped).
 *
 * The five rules that hold across all of them:
 *   1. MONEY IS INTEGER CENTS above this boundary (D-003). Reads expose
 *      `amountCents`; writes take `amountCents`. The `numeric` dollars column
 *      never escapes.
 *   2. NOTHING THROWS, AND A FAILURE IS NEVER AN EMPTY RESULT (ADR-0004).
 *      Reads return `ReadResult`, writes `WriteResult` (`repos/types.ts`):
 *      `{ ok: true, data } | { ok: false, error: RepoError }`, logged as
 *      `[treasury] fn:`. Aggregates are all-or-nothing — a total computed
 *      without one of its queries, or one of its pages (G-033), is wrong
 *      money, so it is an error, not a "$0.00". A delete/update that changed
 *      no row is `not_found` (D-027).
 *   3. DATE RANGES ARE PUSHED INTO THE QUERY (`.gte/.lte` on `occurred_on`),
 *      never filtered in JS — that is the PERF-07 fix.
 *   4. RLS IS THE BOUNDARY (D-002). Nothing here is a permission check; the
 *      scoping arguments (`ownerId`, `ministryIds`) shape the query, and the
 *      policies decide what actually comes back.
 *   5. EVERY CALL NEEDS A LIVE SESSION. Every `fin_*` policy is `to
 *      authenticated`, so a signed-out client (the anon key) reads empty
 *      tables and "$0.00"; each function checks first and returns `auth`
 *      (`../session`). A live session RLS filters down to nothing still reads
 *      as empty — that is rule 4, not a failure.
 *
 * There are no `subscribe*` helpers: the legacy treasury has no realtime, so
 * adding one would be an abstraction with no caller.
 *
 * Usage:
 *   import { fetchBooksSummary, fetchExpenses, monthRange } from '#lib/repos/treasury/index.js';
 *   const range = monthRange('2026-08');
 *   const [kpis, rows] = await Promise.all([fetchBooksSummary(range), fetchExpenses(range)]);
 *   if (!kpis.ok) showError(kpis.error.message); // never a "$0.00" tile
 * ========================================================================== */

export * from './shared';
export * from './entries';
export * from './summary';
export * from './catalog';
export * from './recurring';
export * from './payables';
export * from './notes';
export * from './projects';
