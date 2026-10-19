// S52 — type-level contract for the treasury repo. The frozen part of the
// foundation is the SHAPE: rows come from the generated Database types, money
// crosses as `amountCents` and never as `amount`, reads resolve to ReadResult
// (S22b, ADR-0004 — an error is never an empty list) and writes to
// WriteResult. These assertions are checked by `npm run check` (svelte-check
// covers tests/**).
import { describe, expectTypeOf, it } from 'vitest';
import type { Database } from '#lib/db/database.types.js';
import type { ReadResult, WriteResult } from '#lib/repos/types.js';
import * as treasury from '#lib/repos/treasury/index.js';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

describe('repos/treasury types', () => {
  it('row aliases are the generated Row types', () => {
    expectTypeOf<treasury.IncomeRow>().toEqualTypeOf<Row<'fin_income'>>();
    expectTypeOf<treasury.ExpenseRow>().toEqualTypeOf<Row<'fin_expenses'>>();
    expectTypeOf<treasury.PayableRow>().toEqualTypeOf<Row<'fin_payables'>>();
    expectTypeOf<treasury.RecurringRow>().toEqualTypeOf<Row<'fin_recurring'>>();
    expectTypeOf<treasury.ProjectRow>().toEqualTypeOf<Row<'fin_projects'>>();
    expectTypeOf<treasury.FundRow>().toEqualTypeOf<Row<'fin_funds'>>();
    expectTypeOf<treasury.IncomeCategoryRow>().toEqualTypeOf<Row<'fin_income_categories'>>();
    expectTypeOf<treasury.ExpenseCategoryRow>().toEqualTypeOf<Row<'fin_expense_categories'>>();
    expectTypeOf<treasury.NoteRow>().toEqualTypeOf<Row<'fin_notes'>>();
  });

  it('entries are the generated Row with `amount` swapped for `amountCents`', () => {
    expectTypeOf<treasury.IncomeEntry>().toEqualTypeOf<
      Omit<Row<'fin_income'>, 'amount'> & { amountCents: number }
    >();
    expectTypeOf<treasury.ExpenseEntry>().toEqualTypeOf<
      Omit<Row<'fin_expenses'>, 'amount'> & { amountCents: number }
    >();
    expectTypeOf<treasury.PayableEntry>().toEqualTypeOf<
      Omit<Row<'fin_payables'>, 'amount'> & { amountCents: number }
    >();
    expectTypeOf<treasury.RecurringEntry>().toEqualTypeOf<
      Omit<Row<'fin_recurring'>, 'amount'> & { amountCents: number }
    >();
    expectTypeOf<treasury.FundEntry>().toEqualTypeOf<
      Omit<Row<'fin_funds'>, 'opening_balance'> & { openingBalanceCents: number }
    >();
    // The dollars column must NOT be reachable from an entry — that is the
    // whole point of D-003 at this boundary.
    expectTypeOf<treasury.IncomeEntry>().not.toHaveProperty('amount');
    expectTypeOf<treasury.ExpenseEntry>().not.toHaveProperty('amount');
    expectTypeOf<treasury.FundEntry>().not.toHaveProperty('opening_balance');
    expectTypeOf<treasury.IncomeEntry>().toHaveProperty('occurred_on').toEqualTypeOf<string>();
  });

  it('write payloads are the generated Insert/Update with cents swapped in', () => {
    expectTypeOf<treasury.IncomeInsert>().toEqualTypeOf<
      Omit<Insert<'fin_income'>, 'amount'> & { amountCents: number }
    >();
    expectTypeOf<treasury.ExpenseUpdate>().toEqualTypeOf<
      Omit<Update<'fin_expenses'>, 'amount'> & { amountCents?: number }
    >();
    expectTypeOf<treasury.NoteInsert>().toEqualTypeOf<Insert<'fin_notes'>>();
    expectTypeOf<treasury.ProjectInsert>().toEqualTypeOf<Insert<'fin_projects'>>();
    expectTypeOf<treasury.IncomeCategoryUpdate>().toEqualTypeOf<Update<'fin_income_categories'>>();
  });

  it('reads resolve to a ReadResult of typed entries, never to a nullable list', () => {
    expectTypeOf(treasury.fetchIncome).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.IncomeEntry[]>
    >();
    expectTypeOf(treasury.fetchExpenses).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.ExpenseEntry[]>
    >();
    expectTypeOf(treasury.fetchPayables).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.PayableEntry[]>
    >();
    expectTypeOf(treasury.fetchRecurring).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.RecurringEntry[]>
    >();
    expectTypeOf(treasury.fetchFunds).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.FundEntry[]>
    >();
    expectTypeOf(treasury.fetchNotes).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'fin_notes'>[]>
    >();
    expectTypeOf(treasury.fetchProjects).returns.resolves.toEqualTypeOf<
      ReadResult<Row<'fin_projects'>[]>
    >();
    expectTypeOf(treasury.fetchBudgetedMinistryIds).returns.resolves.toEqualTypeOf<
      ReadResult<string[]>
    >();
    expectTypeOf(treasury.fetchCatalog).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.TreasuryCatalog>
    >();
  });

  it('range reads take a DateRange, and the church books require one (PERF-07)', () => {
    expectTypeOf(treasury.fetchIncome).parameter(0).toEqualTypeOf<treasury.DateRange>();
    expectTypeOf(treasury.fetchExpenses).parameter(0).toEqualTypeOf<treasury.DateRange>();
    expectTypeOf(treasury.fetchBooksSummary).parameter(0).toEqualTypeOf<treasury.DateRange>();
    expectTypeOf(treasury.fetchReportEntries).parameter(0).toEqualTypeOf<treasury.DateRange>();
    expectTypeOf(treasury.monthRange).returns.toEqualTypeOf<treasury.DateRange>();
    expectTypeOf(treasury.yearRange).returns.toEqualTypeOf<treasury.DateRange>();
    // Project ledgers stay optionally-ranged (legacy is all-time).
    expectTypeOf(treasury.fetchProjectIncome)
      .parameter(1)
      .toEqualTypeOf<treasury.DateRange | undefined>();
  });

  it('aggregates are all-or-nothing ReadResults of exact cents', () => {
    expectTypeOf(treasury.fetchBooksSummary).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.BooksSummary>
    >();
    expectTypeOf<treasury.BooksSummary>().toEqualTypeOf<{
      incomeCents: number;
      expensesCents: number;
      balanceCents: number;
      openPayablesCents: number;
      byAllocation: treasury.ExpenseAllocationTotals;
    }>();
    // No partial-success channel: a failed query is the error branch, not a
    // flag next to totals a view could still render as "$0.00".
    expectTypeOf<treasury.BooksSummary>().not.toHaveProperty('failed');
    expectTypeOf<treasury.ExpenseAllocationTotals>().toEqualTypeOf<{
      generalCents: number;
      pastorCents: number;
      byMinistryCents: Record<string, number>;
    }>();
    expectTypeOf(treasury.fetchProjectTotals).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.ProjectTotalsResult>
    >();
    expectTypeOf<treasury.ProjectTotalsResult>().toEqualTypeOf<{
      byProject: Record<string, treasury.ProjectTotals>;
    }>();
    expectTypeOf<treasury.ProjectTotals>().toEqualTypeOf<{
      incomeCents: number;
      expensesCents: number;
    }>();
    expectTypeOf(treasury.fetchMinistryAllocationTotals).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.MinistryAllocationTotals>
    >();
    expectTypeOf(treasury.fetchReportEntries).returns.resolves.toEqualTypeOf<
      ReadResult<treasury.ReportEntries>
    >();
    expectTypeOf<treasury.ReportIncomeRow>().toHaveProperty('amountCents').toEqualTypeOf<number>();
    expectTypeOf<treasury.ReportExpenseRow>().not.toHaveProperty('amount');
  });

  it('writes resolve to WriteResult', () => {
    expectTypeOf(treasury.createIncome).returns.resolves.toEqualTypeOf<
      WriteResult<treasury.IncomeEntry>
    >();
    expectTypeOf(treasury.insertIncomeBatch).returns.resolves.toEqualTypeOf<
      WriteResult<treasury.IncomeEntry[]>
    >();
    expectTypeOf(treasury.insertExpenseBatch)
      .parameter(0)
      .toEqualTypeOf<treasury.ExpenseInsert[]>();
    expectTypeOf(treasury.updateExpense).returns.resolves.toEqualTypeOf<
      WriteResult<treasury.ExpenseEntry>
    >();
    expectTypeOf(treasury.deleteIncome).returns.resolves.toEqualTypeOf<WriteResult>();
    expectTypeOf(treasury.deleteExpensesByNote).returns.resolves.toEqualTypeOf<WriteResult>();
    expectTypeOf(treasury.createFund).returns.resolves.toEqualTypeOf<
      WriteResult<treasury.FundEntry>
    >();
    expectTypeOf(treasury.createNote).returns.resolves.toEqualTypeOf<
      WriteResult<Row<'fin_notes'>>
    >();
    expectTypeOf(treasury.createProject).returns.resolves.toEqualTypeOf<
      WriteResult<Row<'fin_projects'>>
    >();
    expectTypeOf(treasury.materializeRecurring).returns.resolves.toEqualTypeOf<
      WriteResult<{ inserted: number }>
    >();
    expectTypeOf(treasury.markPayablePaid).returns.resolves.toEqualTypeOf<
      WriteResult<{ paidAt: string }>
    >();
    expectTypeOf(treasury.markPayablePaid).parameter(0).toEqualTypeOf<treasury.PayableToPay>();
  });

  it('the allocation contract is typed, not stringly-guessed', () => {
    expectTypeOf(treasury.allocDecode).returns.toEqualTypeOf<treasury.Allocation>();
    expectTypeOf(treasury.allocEncode).returns.toEqualTypeOf<treasury.AllocationChoice>();
    expectTypeOf<treasury.Allocation>().toEqualTypeOf<{
      ministry_id: string | null;
      label: string | null;
    }>();
    // The decoded allocation drops straight into an expense payload.
    expectTypeOf<treasury.Allocation>().toMatchTypeOf<
      Pick<Insert<'fin_expenses'>, 'ministry_id' | 'label'>
    >();
  });

  it('the CHECK-constraint unions narrow the generated `string` columns', () => {
    expectTypeOf<treasury.ExpenseStatus>().toEqualTypeOf<'paid' | 'pending'>();
    expectTypeOf<treasury.PayableStatus>().toEqualTypeOf<'open' | 'paid'>();
    expectTypeOf<treasury.RecurringFrequency>().toEqualTypeOf<'monthly' | 'weekly' | 'yearly'>();
    expectTypeOf<treasury.ExpenseStatus>().toMatchTypeOf<
      NonNullable<Insert<'fin_expenses'>['status']>
    >();
  });
});
