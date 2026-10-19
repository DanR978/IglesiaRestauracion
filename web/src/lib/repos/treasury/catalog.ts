/* ============================================================================
 * web/src/lib/repos/treasury/catalog.ts — funds + income/expense categories
 * ----------------------------------------------------------------------------
 * The three lookup tables the "Configurar" sub-tab owns: `fin_funds`,
 * `fin_income_categories`, `fin_expense_categories`. Ported from
 * `treasury-tab.js` `loadFundData()` (:64-71) and the generic list wiring at
 * `:305-307` / `:576-603`.
 *
 * All three read the same way — unarchived, `sort` then `name` — but each gets
 * its own function rather than one parameterised by table: a computed
 * `.from()` / `.select()` argument degrades the row type to
 * `GenericStringError` (G-024), and duplicating a one-line literal is the
 * documented price of staying typed.
 *
 * `fin_funds.opening_balance` is money, so it crosses as
 * `openingBalanceCents` (D-003). Note the baseline puts **no** non-negative
 * CHECK on it (unlike every `amount` column), so this is the one write that
 * allows a negative cents value.
 *
 * Usage:
 *   import { fetchCatalog, createFund } from '#lib/repos/treasury/index.js';
 *   const res = await fetchCatalog();
 *   if (res.ok) fillSelects(res.data);
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
  toFundEntry,
  type ExpenseCategoryInsert,
  type ExpenseCategoryRow,
  type ExpenseCategoryUpdate,
  type FundEntry,
  type FundInsert,
  type FundUpdate,
  type IncomeCategoryInsert,
  type IncomeCategoryRow,
  type IncomeCategoryUpdate,
} from './shared';

/** Everything "Configurar" and the two entry wizards need, in one round trip. */
export type TreasuryCatalog = {
  funds: FundEntry[];
  incomeCategories: IncomeCategoryRow[];
  expenseCategories: ExpenseCategoryRow[];
};

/* ── Reads ─────────────────────────────────────────────────────────────── */

/** Unarchived funds, `sort` then `name` (`treasury-tab.js:66`). */
export async function fetchFunds(): Promise<ReadResult<FundEntry[]>> {
  const denied = await requireSession(TAG, 'fetchFunds');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_funds')
    .select('*')
    .eq('archived', false)
    .order('sort')
    .order('name');
  if (error) return fail(TAG, 'fetchFunds', error, status);
  return ok((data ?? []).map(toFundEntry));
}

/** Unarchived income categories, `sort` then `name` (`treasury-tab.js:67`). */
export async function fetchIncomeCategories(): Promise<ReadResult<IncomeCategoryRow[]>> {
  const denied = await requireSession(TAG, 'fetchIncomeCategories');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_income_categories')
    .select('*')
    .eq('archived', false)
    .order('sort')
    .order('name');
  if (error) return fail(TAG, 'fetchIncomeCategories', error, status);
  return ok(data ?? []);
}

/** Unarchived expense categories, `sort` then `name` (`treasury-tab.js:68`). */
export async function fetchExpenseCategories(): Promise<ReadResult<ExpenseCategoryRow[]>> {
  const denied = await requireSession(TAG, 'fetchExpenseCategories');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_expense_categories')
    .select('*')
    .eq('archived', false)
    .order('sort')
    .order('name');
  if (error) return fail(TAG, 'fetchExpenseCategories', error, status);
  return ok(data ?? []);
}

/**
 * The three lists in parallel — the port of `loadFundData()`. All or nothing:
 * a wizard offered an empty category list because that one read failed would
 * look like a church with no categories.
 */
export async function fetchCatalog(): Promise<ReadResult<TreasuryCatalog>> {
  const denied = await requireSession(TAG, 'fetchCatalog');
  if (denied) return denied;
  const [funds, incomeCategories, expenseCategories] = await Promise.all([
    fetchFunds(),
    fetchIncomeCategories(),
    fetchExpenseCategories(),
  ]);
  if (!funds.ok) return funds;
  if (!incomeCategories.ok) return incomeCategories;
  if (!expenseCategories.ok) return expenseCategories;
  return ok({
    funds: funds.data,
    incomeCategories: incomeCategories.data,
    expenseCategories: expenseCategories.data,
  });
}

/* ── Writes: funds ─────────────────────────────────────────────────────── */

/** `opening_balance` is the only money column with no non-negative CHECK. */
const OPENING_BALANCE = { field: 'saldo inicial', allowNegative: true } as const;

export async function createFund(input: FundInsert): Promise<WriteResult<FundEntry>> {
  const denied = await requireSession(TAG, 'createFund');
  if (denied) return denied;
  const { openingBalanceCents, ...rest } = input;
  const row: TablesInsert<'fin_funds'> = { ...rest };
  if (openingBalanceCents !== undefined) {
    const bad = centsError(openingBalanceCents, OPENING_BALANCE);
    if (bad) return invalid(bad);
    row.opening_balance = toNumeric(openingBalanceCents);
  }
  const { data, error, status } = await supabase.from('fin_funds').insert(row).select().single();
  if (error) return fail(TAG, 'createFund', error, status);
  return ok(toFundEntry(data));
}

export async function updateFund(id: string, patch: FundUpdate): Promise<WriteResult<FundEntry>> {
  const denied = await requireSession(TAG, 'updateFund');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del fondo.');
  const { openingBalanceCents, ...rest } = patch;
  const row: TablesUpdate<'fin_funds'> = { ...rest };
  if (openingBalanceCents !== undefined) {
    const bad = centsError(openingBalanceCents, OPENING_BALANCE);
    if (bad) return invalid(bad);
    row.opening_balance = toNumeric(openingBalanceCents);
  }
  const { data, error, status } = await supabase
    .from('fin_funds')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateFund', error, status);
  return ok(toFundEntry(data));
}

export async function deleteFund(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteFund');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador del fondo.');
  const { error, status, count } = await supabase
    .from('fin_funds')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteFund', error, status);
  if (!count) return noRows(TAG, 'deleteFund');
  return ok(undefined);
}

/* ── Writes: income categories ─────────────────────────────────────────── */

export async function createIncomeCategory(
  input: IncomeCategoryInsert,
): Promise<WriteResult<IncomeCategoryRow>> {
  const denied = await requireSession(TAG, 'createIncomeCategory');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_income_categories')
    .insert(input)
    .select()
    .single();
  if (error) return fail(TAG, 'createIncomeCategory', error, status);
  return ok(data);
}

export async function updateIncomeCategory(
  id: string,
  patch: IncomeCategoryUpdate,
): Promise<WriteResult<IncomeCategoryRow>> {
  const denied = await requireSession(TAG, 'updateIncomeCategory');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la categoría.');
  const { data, error, status } = await supabase
    .from('fin_income_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateIncomeCategory', error, status);
  return ok(data);
}

export async function deleteIncomeCategory(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteIncomeCategory');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la categoría.');
  const { error, status, count } = await supabase
    .from('fin_income_categories')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteIncomeCategory', error, status);
  if (!count) return noRows(TAG, 'deleteIncomeCategory');
  return ok(undefined);
}

/* ── Writes: expense categories ────────────────────────────────────────── */

export async function createExpenseCategory(
  input: ExpenseCategoryInsert,
): Promise<WriteResult<ExpenseCategoryRow>> {
  const denied = await requireSession(TAG, 'createExpenseCategory');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('fin_expense_categories')
    .insert(input)
    .select()
    .single();
  if (error) return fail(TAG, 'createExpenseCategory', error, status);
  return ok(data);
}

export async function updateExpenseCategory(
  id: string,
  patch: ExpenseCategoryUpdate,
): Promise<WriteResult<ExpenseCategoryRow>> {
  const denied = await requireSession(TAG, 'updateExpenseCategory');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la categoría.');
  const { data, error, status } = await supabase
    .from('fin_expense_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateExpenseCategory', error, status);
  return ok(data);
}

export async function deleteExpenseCategory(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deleteExpenseCategory');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la categoría.');
  const { error, status, count } = await supabase
    .from('fin_expense_categories')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteExpenseCategory', error, status);
  if (!count) return noRows(TAG, 'deleteExpenseCategory');
  return ok(undefined);
}
