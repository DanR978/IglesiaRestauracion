/* ============================================================================
 * web/src/lib/repos/treasury/entries.ts — `fin_income` + `fin_expenses` (S52)
 * ----------------------------------------------------------------------------
 * Every row-level read and every write of the two ledger tables. Extracted
 * from the inline queries in `js/pages/admin/treasury-tab.js` (Ingresos,
 * Gastos) and `js/pages/admin/project-treasury.js` (project entries, church
 * allocations to a ministry). Narrow aggregate projections live next door in
 * `./summary`.
 *
 * Two invariants:
 *   · `project_id IS NULL` IS the church books. A row with a `project_id`
 *     belongs to a leader's project/ministry tab and must never be summed into
 *     the church totals (`treasury-tab.js:119-120, 326, 344`).
 *   · Amounts cross this boundary as INTEGER CENTS (D-003). Reads map through
 *     `toIncomeEntry`/`toExpenseEntry`, writes through `toNumeric`.
 *
 * PERF-07: every church-books read takes a required `DateRange` and pushes it
 * into the query with `.gte/.lte` on `occurred_on`. The legacy report paths
 * fetched a whole year and filtered in JS (`treasury-tab.js:443-444`,
 * `project-treasury.js:399-409`).
 *
 * The row lists are one request each, so PostgREST's max-rows (1000) caps
 * them; S53 pages the UI (G-033). Totals never come from these lists — the
 * aggregates in `./summary` read every page.
 *
 * Usage:
 *   import { fetchExpenses, createExpense, monthRange } from '#lib/repos/treasury/index.js';
 *   const res = await fetchExpenses(monthRange('2026-08'));
 *   if (res.ok) render(res.data);
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { toNumeric } from '#lib/money.js';
import type { TablesInsert, TablesUpdate } from '#lib/db/database.types.js';
import { fail, invalid, noRows, ok } from '../errors';
import { requireSession } from '../session';
import type { ReadResult, WriteResult } from '../types';
import {
  TAG,
  centsError,
  toExpenseEntry,
  toIncomeEntry,
  type DateRange,
  type ExpenseEntry,
  type ExpenseInsert,
  type ExpenseUpdate,
  type IncomeEntry,
  type IncomeInsert,
  type IncomeUpdate,
} from './shared';

/* ── Reads ─────────────────────────────────────────────────────────────── */

/** Church-books income for the range, newest first (`treasury-tab.js:326`). */
export async function fetchIncome(range: DateRange): Promise<ReadResult<IncomeEntry[]>> {
  const denied = await requireSession(TAG, 'fetchIncome');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_income')
    .select('*')
    .is('project_id', null)
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false });
  if (error) return fail(TAG, 'fetchIncome', error, status);
  return ok((data ?? []).map(toIncomeEntry));
}

/** Church-books expenses for the range, newest first (`treasury-tab.js:344`). */
export async function fetchExpenses(range: DateRange): Promise<ReadResult<ExpenseEntry[]>> {
  const denied = await requireSession(TAG, 'fetchExpenses');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_expenses')
    .select('*')
    .is('project_id', null)
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false });
  if (error) return fail(TAG, 'fetchExpenses', error, status);
  return ok((data ?? []).map(toExpenseEntry));
}

/**
 * One project's income (`project-treasury.js:236`). `range` is optional
 * because the legacy project ledger is all-time; pass one and the filter is
 * pushed into the query instead of run in JS (PERF-07,
 * `project-treasury.js:399`).
 */
export async function fetchProjectIncome(
  projectId: string,
  range?: DateRange,
): Promise<ReadResult<IncomeEntry[]>> {
  const denied = await requireSession(TAG, 'fetchProjectIncome');
  if (denied) return denied;
  if (!projectId) return ok([]);
  let q = supabase.from('fin_income').select('*').eq('project_id', projectId);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error, status } = await q.order('occurred_on', { ascending: false });
  if (error) return fail(TAG, 'fetchProjectIncome', error, status);
  return ok((data ?? []).map(toIncomeEntry));
}

/** One project's expenses (`project-treasury.js:237`, `:402`). */
export async function fetchProjectExpenses(
  projectId: string,
  range?: DateRange,
): Promise<ReadResult<ExpenseEntry[]>> {
  const denied = await requireSession(TAG, 'fetchProjectExpenses');
  if (denied) return denied;
  if (!projectId) return ok([]);
  let q = supabase.from('fin_expenses').select('*').eq('project_id', projectId);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error, status } = await q.order('occurred_on', { ascending: false });
  if (error) return fail(TAG, 'fetchProjectExpenses', error, status);
  return ok((data ?? []).map(toExpenseEntry));
}

/**
 * The church's allocations to a set of ministries: treasurer expenses with no
 * `project_id`, tagged to one of those ministries. This is the read-only
 * "Presupuesto de la iglesia" income a ministry leader sees
 * (`project-treasury.js:239`, `:404`).
 */
export async function fetchMinistryAllocations(
  ministryIds: string[],
  range?: DateRange,
): Promise<ReadResult<ExpenseEntry[]>> {
  const denied = await requireSession(TAG, 'fetchMinistryAllocations');
  if (denied) return denied;
  if (!ministryIds.length) return ok([]);
  let q = supabase
    .from('fin_expenses')
    .select('*')
    .is('project_id', null)
    .in('ministry_id', ministryIds);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error, status } = await q.order('occurred_on', { ascending: false });
  if (error) return fail(TAG, 'fetchMinistryAllocations', error, status);
  return ok((data ?? []).map(toExpenseEntry));
}

/* ── Writes: income ────────────────────────────────────────────────────── */

function incomeRow(input: IncomeInsert): TablesInsert<'fin_income'> {
  const { amountCents, ...rest } = input;
  return { ...rest, amount: toNumeric(amountCents) };
}

/** Insert one income row (`treasury-tab.js:583` via `WIZ.income.toPayload`). */
export async function createIncome(input: IncomeInsert): Promise<WriteResult<IncomeEntry>> {
  const denied = await requireSession(TAG, 'createIncome');
  if (denied) return denied;
  const bad = centsError(input.amountCents);
  if (bad) return invalid(bad);
  const { data, error, status } = await supabase
    .from('fin_income')
    .insert(incomeRow(input))
    .select()
    .single();
  if (error) return fail(TAG, 'createIncome', error, status);
  return ok(toIncomeEntry(data));
}

/**
 * Insert many income rows in ONE statement — Postgres makes it atomic, so
 * there is no partial-failure state to reconcile client-side (S56c).
 */
export async function insertIncomeBatch(rows: IncomeInsert[]): Promise<WriteResult<IncomeEntry[]>> {
  const denied = await requireSession(TAG, 'insertIncomeBatch');
  if (denied) return denied;
  if (!rows.length) return ok([]);
  for (let i = 0; i < rows.length; i++) {
    const bad = centsError(rows[i].amountCents);
    if (bad) return invalid(`Fila ${i + 1}: ${bad}`);
  }
  const { data, error, status } = await supabase
    .from('fin_income')
    .insert(rows.map(incomeRow))
    .select();
  if (error) return fail(TAG, 'insertIncomeBatch', error, status);
  return ok((data ?? []).map(toIncomeEntry));
}

export async function updateIncome(
  id: string,
  patch: IncomeUpdate,
): Promise<WriteResult<IncomeEntry>> {
  const denied = await requireSession(TAG, 'updateIncome');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del ingreso.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_income'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return invalid(bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error, status } = await supabase
    .from('fin_income')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateIncome', error, status);
  return ok(toIncomeEntry(data));
}

export async function deleteIncome(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteIncome');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del ingreso.');
  const { error, status, count } = await supabase
    .from('fin_income')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteIncome', error, status);
  if (!count) return noRows(TAG, 'deleteIncome');
  return ok(undefined);
}

/* ── Writes: expenses ──────────────────────────────────────────────────── */

function expenseRow(input: ExpenseInsert): TablesInsert<'fin_expenses'> {
  const { amountCents, ...rest } = input;
  return { ...rest, amount: toNumeric(amountCents) };
}

/** Insert one expense row (`treasury-tab.js:583` via `WIZ.expenses.toPayload`). */
export async function createExpense(input: ExpenseInsert): Promise<WriteResult<ExpenseEntry>> {
  const denied = await requireSession(TAG, 'createExpense');
  if (denied) return denied;
  const bad = centsError(input.amountCents);
  if (bad) return invalid(bad);
  const { data, error, status } = await supabase
    .from('fin_expenses')
    .insert(expenseRow(input))
    .select()
    .single();
  if (error) return fail(TAG, 'createExpense', error, status);
  return ok(toExpenseEntry(data));
}

/** One atomic statement for the whole batch (S56c). */
export async function insertExpenseBatch(
  rows: ExpenseInsert[],
): Promise<WriteResult<ExpenseEntry[]>> {
  const denied = await requireSession(TAG, 'insertExpenseBatch');
  if (denied) return denied;
  if (!rows.length) return ok([]);
  for (let i = 0; i < rows.length; i++) {
    const bad = centsError(rows[i].amountCents);
    if (bad) return invalid(`Fila ${i + 1}: ${bad}`);
  }
  const { data, error, status } = await supabase
    .from('fin_expenses')
    .insert(rows.map(expenseRow))
    .select();
  if (error) return fail(TAG, 'insertExpenseBatch', error, status);
  return ok((data ?? []).map(toExpenseEntry));
}

export async function updateExpense(
  id: string,
  patch: ExpenseUpdate,
): Promise<WriteResult<ExpenseEntry>> {
  const denied = await requireSession(TAG, 'updateExpense');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del gasto.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_expenses'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return invalid(bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error, status } = await supabase
    .from('fin_expenses')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateExpense', error, status);
  return ok(toExpenseEntry(data));
}

export async function deleteExpense(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteExpense');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del gasto.');
  const { error, status, count } = await supabase
    .from('fin_expenses')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteExpense', error, status);
  if (!count) return noRows(TAG, 'deleteExpense');
  return ok(undefined);
}

/**
 * Delete every expense carrying an exact `auto:` linkage tag. The tag is what
 * makes the payable mirror idempotent (`treasury-tab.js:419, 430`) — this is
 * the only supported way to remove a generated row by tag. Matching zero rows
 * is a success: most payables have no mirror yet.
 */
export async function deleteExpensesByNote(note: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteExpensesByNote');
  if (denied) return denied;
  if (!note) return invalid('Falta la etiqueta de la nota.');
  const { error, status } = await supabase.from('fin_expenses').delete().eq('note', note);
  if (error) return fail(TAG, 'deleteExpensesByNote', error, status);
  return ok(undefined);
}
