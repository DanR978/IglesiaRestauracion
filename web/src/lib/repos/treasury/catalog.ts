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
 *   import { fetchCatalog, createFund } from '$lib/repos/treasury';
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import { toNumeric } from '$lib/money';
import type { TablesInsert, TablesUpdate } from '$lib/db/database.types';
import type { WriteResult } from '../types';
import {
  centsError,
  toFundEntry,
  warnRead,
  writeFail,
  writeOk,
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
export async function fetchFunds(): Promise<FundEntry[]> {
  const { data, error } = await supabase
    .from('fin_funds')
    .select('*')
    .eq('archived', false)
    .order('sort')
    .order('name');
  if (error) {
    warnRead('fetchFunds', error.message);
    return [];
  }
  return (data ?? []).map(toFundEntry);
}

/** Unarchived income categories, `sort` then `name` (`treasury-tab.js:67`). */
export async function fetchIncomeCategories(): Promise<IncomeCategoryRow[]> {
  const { data, error } = await supabase
    .from('fin_income_categories')
    .select('*')
    .eq('archived', false)
    .order('sort')
    .order('name');
  if (error) {
    warnRead('fetchIncomeCategories', error.message);
    return [];
  }
  return data ?? [];
}

/** Unarchived expense categories, `sort` then `name` (`treasury-tab.js:68`). */
export async function fetchExpenseCategories(): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabase
    .from('fin_expense_categories')
    .select('*')
    .eq('archived', false)
    .order('sort')
    .order('name');
  if (error) {
    warnRead('fetchExpenseCategories', error.message);
    return [];
  }
  return data ?? [];
}

/** The three lists in parallel — the port of `loadFundData()`. */
export async function fetchCatalog(): Promise<TreasuryCatalog> {
  const [funds, incomeCategories, expenseCategories] = await Promise.all([
    fetchFunds(),
    fetchIncomeCategories(),
    fetchExpenseCategories(),
  ]);
  return { funds, incomeCategories, expenseCategories };
}

/* ── Writes: funds ─────────────────────────────────────────────────────── */

/** `opening_balance` is the only money column with no non-negative CHECK. */
const OPENING_BALANCE = { field: 'saldo inicial', allowNegative: true } as const;

export async function createFund(input: FundInsert): Promise<WriteResult<FundEntry>> {
  const { openingBalanceCents, ...rest } = input;
  const row: TablesInsert<'fin_funds'> = { ...rest };
  if (openingBalanceCents !== undefined) {
    const bad = centsError(openingBalanceCents, OPENING_BALANCE);
    if (bad) return writeFail('createFund', bad);
    row.opening_balance = toNumeric(openingBalanceCents);
  }
  const { data, error } = await supabase.from('fin_funds').insert(row).select().single();
  if (error) return writeFail('createFund', error.message);
  return writeOk(toFundEntry(data));
}

export async function updateFund(id: string, patch: FundUpdate): Promise<WriteResult<FundEntry>> {
  if (!id) return writeFail('updateFund', 'Falta el identificador del fondo.');
  const { openingBalanceCents, ...rest } = patch;
  const row: TablesUpdate<'fin_funds'> = { ...rest };
  if (openingBalanceCents !== undefined) {
    const bad = centsError(openingBalanceCents, OPENING_BALANCE);
    if (bad) return writeFail('updateFund', bad);
    row.opening_balance = toNumeric(openingBalanceCents);
  }
  const { data, error } = await supabase
    .from('fin_funds')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateFund', error.message);
  return writeOk(toFundEntry(data));
}

export async function deleteFund(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteFund', 'Falta el identificador del fondo.');
  const { error } = await supabase.from('fin_funds').delete().eq('id', id);
  if (error) return writeFail('deleteFund', error.message);
  return writeOk(undefined);
}

/* ── Writes: income categories ─────────────────────────────────────────── */

export async function createIncomeCategory(
  input: IncomeCategoryInsert,
): Promise<WriteResult<IncomeCategoryRow>> {
  const { data, error } = await supabase
    .from('fin_income_categories')
    .insert(input)
    .select()
    .single();
  if (error) return writeFail('createIncomeCategory', error.message);
  return writeOk(data);
}

export async function updateIncomeCategory(
  id: string,
  patch: IncomeCategoryUpdate,
): Promise<WriteResult<IncomeCategoryRow>> {
  if (!id) return writeFail('updateIncomeCategory', 'Falta el identificador de la categoría.');
  const { data, error } = await supabase
    .from('fin_income_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateIncomeCategory', error.message);
  return writeOk(data);
}

export async function deleteIncomeCategory(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteIncomeCategory', 'Falta el identificador de la categoría.');
  const { error } = await supabase.from('fin_income_categories').delete().eq('id', id);
  if (error) return writeFail('deleteIncomeCategory', error.message);
  return writeOk(undefined);
}

/* ── Writes: expense categories ────────────────────────────────────────── */

export async function createExpenseCategory(
  input: ExpenseCategoryInsert,
): Promise<WriteResult<ExpenseCategoryRow>> {
  const { data, error } = await supabase
    .from('fin_expense_categories')
    .insert(input)
    .select()
    .single();
  if (error) return writeFail('createExpenseCategory', error.message);
  return writeOk(data);
}

export async function updateExpenseCategory(
  id: string,
  patch: ExpenseCategoryUpdate,
): Promise<WriteResult<ExpenseCategoryRow>> {
  if (!id) return writeFail('updateExpenseCategory', 'Falta el identificador de la categoría.');
  const { data, error } = await supabase
    .from('fin_expense_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateExpenseCategory', error.message);
  return writeOk(data);
}

export async function deleteExpenseCategory(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteExpenseCategory', 'Falta el identificador de la categoría.');
  const { error } = await supabase.from('fin_expense_categories').delete().eq('id', id);
  if (error) return writeFail('deleteExpenseCategory', error.message);
  return writeOk(undefined);
}
