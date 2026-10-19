/* ============================================================================
 * web/src/lib/repos/treasury/summary.ts — aggregate reads (KPIs & reports)
 * ----------------------------------------------------------------------------
 * The narrow, range-pushed projections behind Resumen, the project cards and
 * the report builder. Ported from `treasury-tab.js` `renderResumen`
 * (:118-137), `project-treasury.js` `projectTotals` (:130-147) /
 * `ministryBudgets` (:166-173), and `report-builder.js` `loadData` (:107-112).
 *
 * Why these are separate functions instead of a `columns` argument: a
 * `.select()` argument must be a LITERAL string or the row type collapses to
 * `GenericStringError` (G-024). Each projection therefore owns its literal.
 *
 * Every total is exact integer cents (D-003) — the legacy paths summed floats
 * (`treasury-tab.js:25`, `report-builder.js:131-134`), which is the approved
 * golden divergence.
 *
 * ALL OR NOTHING (ADR-0004). Each aggregate runs its queries in parallel and
 * returns `{ ok: false, error }` if ANY of them failed — never totals computed
 * from the reads that happened to succeed. A balance without its expenses, or
 * a report without its income, is wrong money; legacy rendered exactly that
 * as "$0.00" (PORT-DEBT S53, S56). Each failed query is logged as
 * `[treasury] <fn> <part>:`.
 *
 * Usage:
 *   import { fetchBooksSummary, monthRange } from '#lib/repos/treasury/index.js';
 *   const res = await fetchBooksSummary(monthRange('2026-08'));
 *   if (res.ok) renderTiles(res.data);
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { fail, ok } from '../errors';
import type { ReadResult } from '../types';
import {
  PASTOR_LABEL,
  TAG,
  amountToCents,
  sumCents,
  type DateRange,
  type ExpenseRow,
  type IncomeRow,
} from './shared';

/* ── Resumen (church books) ────────────────────────────────────────────── */

/** Expenses split across the three allocation lines (`treasury-tab.js:126-131`). */
export type ExpenseAllocationTotals = {
  /** No ministry and no `Pastor` label. */
  generalCents: number;
  /** `label = 'Pastor'` — the stipend line. */
  pastorCents: number;
  /** Ministry uuid → cents. Ministry NAMES are not this repo's business. */
  byMinistryCents: Record<string, number>;
};

export type BooksSummary = {
  incomeCents: number;
  expensesCents: number;
  /** `incomeCents - expensesCents`. */
  balanceCents: number;
  /**
   * Open payables, **all-time** — deliberately not range-scoped, exactly as
   * legacy (`treasury-tab.js:121`). It renders beside three month tiles and
   * looks month-scoped; PORT-DEBT S53 owns making that honest in the UI.
   */
  openPayablesCents: number;
  byAllocation: ExpenseAllocationTotals;
};

/** The four Resumen KPI tiles plus the "Gastos por línea" breakdown. */
export async function fetchBooksSummary(range: DateRange): Promise<ReadResult<BooksSummary>> {
  const [inc, exp, pay] = await Promise.all([
    supabase
      .from('fin_income')
      .select('amount')
      .is('project_id', null)
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end),
    supabase
      .from('fin_expenses')
      .select('amount,ministry_id,label')
      .is('project_id', null)
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end),
    supabase.from('fin_payables').select('amount').eq('status', 'open'),
  ]);
  if (inc.error) return fail(TAG, 'fetchBooksSummary income', inc.error, inc.status);
  if (exp.error) return fail(TAG, 'fetchBooksSummary expenses', exp.error, exp.status);
  if (pay.error) return fail(TAG, 'fetchBooksSummary payables', pay.error, pay.status);

  const incomeCents = sumCents(
    (inc.data ?? []).map((r) => amountToCents(r.amount, 'fetchBooksSummary')),
  );
  const byAllocation: ExpenseAllocationTotals = {
    generalCents: 0,
    pastorCents: 0,
    byMinistryCents: {},
  };
  let expensesCents = 0;
  for (const row of exp.data ?? []) {
    const cents = amountToCents(row.amount, 'fetchBooksSummary');
    expensesCents += cents;
    if (row.label === PASTOR_LABEL) byAllocation.pastorCents += cents;
    else if (!row.ministry_id) byAllocation.generalCents += cents;
    else {
      byAllocation.byMinistryCents[row.ministry_id] =
        (byAllocation.byMinistryCents[row.ministry_id] ?? 0) + cents;
    }
  }
  const openPayablesCents = sumCents(
    (pay.data ?? []).map((r) => amountToCents(r.amount, 'fetchBooksSummary')),
  );

  return ok({
    incomeCents,
    expensesCents,
    balanceCents: incomeCents - expensesCents,
    openPayablesCents,
    byAllocation,
  });
}

/* ── Project / ministry rollups ────────────────────────────────────────── */

export type ProjectTotals = { incomeCents: number; expensesCents: number };

export type ProjectTotalsResult = {
  /** Project uuid → totals. Every requested id is present, zeroed when empty. */
  byProject: Record<string, ProjectTotals>;
};

/**
 * Income and expense totals per project container
 * (`project-treasury.js:130-141`). Church budget seeded into a ministry tab is
 * NOT included — compose with `fetchMinistryAllocationTotals`, which is what
 * legacy `projectTotals()` did at `:142-145`.
 */
export async function fetchProjectTotals(
  projectIds: string[],
  range?: DateRange,
): Promise<ReadResult<ProjectTotalsResult>> {
  const byProject: Record<string, ProjectTotals> = {};
  for (const id of projectIds) byProject[id] = { incomeCents: 0, expensesCents: 0 };
  if (!projectIds.length) return ok({ byProject });

  let incQ = supabase.from('fin_income').select('project_id,amount').in('project_id', projectIds);
  let expQ = supabase.from('fin_expenses').select('project_id,amount').in('project_id', projectIds);
  if (range) {
    incQ = incQ.gte('occurred_on', range.start).lte('occurred_on', range.end);
    expQ = expQ.gte('occurred_on', range.start).lte('occurred_on', range.end);
  }
  const [inc, exp] = await Promise.all([incQ, expQ]);
  if (inc.error) return fail(TAG, 'fetchProjectTotals income', inc.error, inc.status);
  if (exp.error) return fail(TAG, 'fetchProjectTotals expenses', exp.error, exp.status);

  for (const row of inc.data ?? []) {
    const bucket = row.project_id ? byProject[row.project_id] : undefined;
    if (bucket) bucket.incomeCents += amountToCents(row.amount, 'fetchProjectTotals');
  }
  for (const row of exp.data ?? []) {
    const bucket = row.project_id ? byProject[row.project_id] : undefined;
    if (bucket) bucket.expensesCents += amountToCents(row.amount, 'fetchProjectTotals');
  }
  return ok({ byProject });
}

export type MinistryAllocationTotals = {
  /** Ministry uuid → cents the church allocated to it in the range. */
  byMinistry: Record<string, number>;
};

/**
 * What the church allocated to each ministry — church-books expenses
 * (`project_id IS NULL`) tagged to that ministry. This is the read-only
 * "Presupuesto de la iglesia" income on a ministry tab
 * (`project-treasury.js:166-173`).
 */
export async function fetchMinistryAllocationTotals(
  ministryIds: string[],
  range?: DateRange,
): Promise<ReadResult<MinistryAllocationTotals>> {
  const byMinistry: Record<string, number> = {};
  for (const id of ministryIds) byMinistry[id] = 0;
  if (!ministryIds.length) return ok({ byMinistry });

  let q = supabase
    .from('fin_expenses')
    .select('ministry_id,amount')
    .is('project_id', null)
    .in('ministry_id', ministryIds);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error, status } = await q;
  if (error) return fail(TAG, 'fetchMinistryAllocationTotals', error, status);
  for (const row of data ?? []) {
    if (!row.ministry_id) continue;
    byMinistry[row.ministry_id] =
      (byMinistry[row.ministry_id] ?? 0) +
      amountToCents(row.amount, 'fetchMinistryAllocationTotals');
  }
  return ok({ byMinistry });
}

/* ── Report builder feed ───────────────────────────────────────────────── */

export type ReportIncomeRow = Pick<IncomeRow, 'occurred_on' | 'source' | 'fund'> & {
  amountCents: number;
};
export type ReportExpenseRow = Pick<
  ExpenseRow,
  'occurred_on' | 'payee' | 'category' | 'label' | 'ministry_id'
> & { amountCents: number };

export type ReportEntries = {
  income: ReportIncomeRow[];
  expenses: ReportExpenseRow[];
};

/**
 * Church-books rows for a report period, oldest first, in the two narrow
 * projections the report builder needs (`report-builder.js:107-112`).
 * The range is pushed into the query — legacy fetched the whole year for a
 * weekly report and filtered in JS (PERF-07).
 */
export async function fetchReportEntries(range: DateRange): Promise<ReadResult<ReportEntries>> {
  const [inc, exp] = await Promise.all([
    supabase
      .from('fin_income')
      .select('occurred_on,source,fund,amount')
      .is('project_id', null)
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end)
      .order('occurred_on'),
    supabase
      .from('fin_expenses')
      .select('occurred_on,payee,category,label,ministry_id,amount')
      .is('project_id', null)
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end)
      .order('occurred_on'),
  ]);
  if (inc.error) return fail(TAG, 'fetchReportEntries income', inc.error, inc.status);
  if (exp.error) return fail(TAG, 'fetchReportEntries expenses', exp.error, exp.status);
  return ok({
    income: (inc.data ?? []).map(({ amount, ...rest }) => ({
      ...rest,
      amountCents: amountToCents(amount, 'fetchReportEntries'),
    })),
    expenses: (exp.data ?? []).map(({ amount, ...rest }) => ({
      ...rest,
      amountCents: amountToCents(amount, 'fetchReportEntries'),
    })),
  });
}
