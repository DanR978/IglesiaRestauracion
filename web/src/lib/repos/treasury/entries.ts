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
 * Usage:
 *   import { fetchExpenses, createExpense, monthRange } from '$lib/repos/treasury';
 *   const rows = await fetchExpenses(monthRange('2026-08'));
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import { toNumeric } from '$lib/money';
import type { TablesInsert, TablesUpdate } from '$lib/db/database.types';
import type { WriteResult } from '../types';
import {
  centsError,
  toExpenseEntry,
  toIncomeEntry,
  warnRead,
  writeFail,
  writeOk,
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
export async function fetchIncome(range: DateRange): Promise<IncomeEntry[]> {
  const { data, error } = await supabase
    .from('fin_income')
    .select('*')
    .is('project_id', null)
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false });
  if (error) {
    warnRead('fetchIncome', error.message);
    return [];
  }
  return (data ?? []).map(toIncomeEntry);
}

/** Church-books expenses for the range, newest first (`treasury-tab.js:344`). */
export async function fetchExpenses(range: DateRange): Promise<ExpenseEntry[]> {
  const { data, error } = await supabase
    .from('fin_expenses')
    .select('*')
    .is('project_id', null)
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false });
  if (error) {
    warnRead('fetchExpenses', error.message);
    return [];
  }
  return (data ?? []).map(toExpenseEntry);
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
): Promise<IncomeEntry[]> {
  if (!projectId) return [];
  let q = supabase.from('fin_income').select('*').eq('project_id', projectId);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error } = await q.order('occurred_on', { ascending: false });
  if (error) {
    warnRead('fetchProjectIncome', error.message);
    return [];
  }
  return (data ?? []).map(toIncomeEntry);
}

/** One project's expenses (`project-treasury.js:237`, `:402`). */
export async function fetchProjectExpenses(
  projectId: string,
  range?: DateRange,
): Promise<ExpenseEntry[]> {
  if (!projectId) return [];
  let q = supabase.from('fin_expenses').select('*').eq('project_id', projectId);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error } = await q.order('occurred_on', { ascending: false });
  if (error) {
    warnRead('fetchProjectExpenses', error.message);
    return [];
  }
  return (data ?? []).map(toExpenseEntry);
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
): Promise<ExpenseEntry[]> {
  if (!ministryIds.length) return [];
  let q = supabase
    .from('fin_expenses')
    .select('*')
    .is('project_id', null)
    .in('ministry_id', ministryIds);
  if (range) q = q.gte('occurred_on', range.start).lte('occurred_on', range.end);
  const { data, error } = await q.order('occurred_on', { ascending: false });
  if (error) {
    warnRead('fetchMinistryAllocations', error.message);
    return [];
  }
  return (data ?? []).map(toExpenseEntry);
}

/* ── Writes: income ────────────────────────────────────────────────────── */

function incomeRow(input: IncomeInsert): TablesInsert<'fin_income'> {
  const { amountCents, ...rest } = input;
  return { ...rest, amount: toNumeric(amountCents) };
}

/** Insert one income row (`treasury-tab.js:583` via `WIZ.income.toPayload`). */
export async function createIncome(input: IncomeInsert): Promise<WriteResult<IncomeEntry>> {
  const bad = centsError(input.amountCents);
  if (bad) return writeFail('createIncome', bad);
  const { data, error } = await supabase
    .from('fin_income')
    .insert(incomeRow(input))
    .select()
    .single();
  if (error) return writeFail('createIncome', error.message);
  return writeOk(toIncomeEntry(data));
}

/**
 * Insert many income rows in ONE statement — Postgres makes it atomic, so
 * there is no partial-failure state to reconcile client-side (S56c).
 */
export async function insertIncomeBatch(rows: IncomeInsert[]): Promise<WriteResult<IncomeEntry[]>> {
  if (!rows.length) return writeOk([]);
  for (let i = 0; i < rows.length; i++) {
    const bad = centsError(rows[i].amountCents);
    if (bad) return writeFail('insertIncomeBatch', `Fila ${i + 1}: ${bad}`);
  }
  const { data, error } = await supabase.from('fin_income').insert(rows.map(incomeRow)).select();
  if (error) return writeFail('insertIncomeBatch', error.message);
  return writeOk((data ?? []).map(toIncomeEntry));
}

export async function updateIncome(
  id: string,
  patch: IncomeUpdate,
): Promise<WriteResult<IncomeEntry>> {
  if (!id) return writeFail('updateIncome', 'Falta el identificador del ingreso.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_income'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return writeFail('updateIncome', bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error } = await supabase
    .from('fin_income')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateIncome', error.message);
  return writeOk(toIncomeEntry(data));
}

export async function deleteIncome(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteIncome', 'Falta el identificador del ingreso.');
  const { error } = await supabase.from('fin_income').delete().eq('id', id);
  if (error) return writeFail('deleteIncome', error.message);
  return writeOk(undefined);
}

/* ── Writes: expenses ──────────────────────────────────────────────────── */

function expenseRow(input: ExpenseInsert): TablesInsert<'fin_expenses'> {
  const { amountCents, ...rest } = input;
  return { ...rest, amount: toNumeric(amountCents) };
}

/** Insert one expense row (`treasury-tab.js:583` via `WIZ.expenses.toPayload`). */
export async function createExpense(input: ExpenseInsert): Promise<WriteResult<ExpenseEntry>> {
  const bad = centsError(input.amountCents);
  if (bad) return writeFail('createExpense', bad);
  const { data, error } = await supabase
    .from('fin_expenses')
    .insert(expenseRow(input))
    .select()
    .single();
  if (error) return writeFail('createExpense', error.message);
  return writeOk(toExpenseEntry(data));
}

/** One atomic statement for the whole batch (S56c). */
export async function insertExpenseBatch(
  rows: ExpenseInsert[],
): Promise<WriteResult<ExpenseEntry[]>> {
  if (!rows.length) return writeOk([]);
  for (let i = 0; i < rows.length; i++) {
    const bad = centsError(rows[i].amountCents);
    if (bad) return writeFail('insertExpenseBatch', `Fila ${i + 1}: ${bad}`);
  }
  const { data, error } = await supabase.from('fin_expenses').insert(rows.map(expenseRow)).select();
  if (error) return writeFail('insertExpenseBatch', error.message);
  return writeOk((data ?? []).map(toExpenseEntry));
}

export async function updateExpense(
  id: string,
  patch: ExpenseUpdate,
): Promise<WriteResult<ExpenseEntry>> {
  if (!id) return writeFail('updateExpense', 'Falta el identificador del gasto.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_expenses'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return writeFail('updateExpense', bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error } = await supabase
    .from('fin_expenses')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateExpense', error.message);
  return writeOk(toExpenseEntry(data));
}

export async function deleteExpense(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteExpense', 'Falta el identificador del gasto.');
  const { error } = await supabase.from('fin_expenses').delete().eq('id', id);
  if (error) return writeFail('deleteExpense', error.message);
  return writeOk(undefined);
}

/**
 * Delete every expense carrying an exact `auto:` linkage tag. The tag is what
 * makes the payable mirror idempotent (`treasury-tab.js:419, 430`) — this is
 * the only supported way to remove a generated row by tag.
 */
export async function deleteExpensesByNote(note: string): Promise<WriteResult> {
  if (!note) return writeFail('deleteExpensesByNote', 'Falta la etiqueta de la nota.');
  const { error } = await supabase.from('fin_expenses').delete().eq('note', note);
  if (error) return writeFail('deleteExpensesByNote', error.message);
  return writeOk(undefined);
}
