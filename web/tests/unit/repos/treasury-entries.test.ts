// S52 — repos/treasury/entries: query shape per the legacy `fin_income` /
// `fin_expenses` calls, the never-throw contract, and cents conversion in both
// directions. Query SHAPE is what we assert; RLS behaviour is staging's job
// (VERIFICATION.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  createExpense,
  createIncome,
  deleteExpense,
  deleteExpensesByNote,
  deleteIncome,
  fetchExpenses,
  fetchIncome,
  fetchMinistryAllocations,
  fetchProjectExpenses,
  fetchProjectIncome,
  insertExpenseBatch,
  insertIncomeBatch,
  updateExpense,
  updateIncome,
} from '$lib/repos/treasury';

const ERR = { message: 'boom' };
const AUG = { start: '2026-08-01', end: '2026-08-31' };
const MIN_A = '11111111-1111-1111-1111-111111111111';
const MIN_B = '22222222-2222-2222-2222-222222222222';

const incomeRow = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  occurred_on: '2026-08-03',
  source: 'Diezmos',
  fund: 'General',
  fund_id: null,
  category_id: null,
  project_id: null,
  amount: 1234.56,
  note: null,
  created_by: null,
  created_at: '2026-08-03T12:00:00Z',
  ...over,
});

const expenseRow = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  occurred_on: '2026-08-05',
  ministry_id: null,
  payee: 'Arrendador',
  category: 'Renta',
  category_id: null,
  amount: 850,
  status: 'paid',
  note: null,
  label: null,
  fund_id: null,
  project_id: null,
  created_by: null,
  created_at: '2026-08-05T12:00:00Z',
  ...over,
});

describe('repos/treasury/entries', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  /* ── church-books reads (PERF-07: the range is IN the query) ─────────── */

  describe('fetchIncome (treasury-tab.js:326)', () => {
    it('scopes to the church books and pushes the range down', async () => {
      mock.results.fin_income = [{ data: [incomeRow()] }];
      const rows = await fetchIncome(AUG);
      expect(mock.query().table).toBe('fin_income');
      expect(mock.chain()).toEqual(['select', 'is', 'gte', 'lte', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['project_id', null],
        ['occurred_on', '2026-08-01'],
        ['occurred_on', '2026-08-31'],
        ['occurred_on', { ascending: false }],
      ]);
      expect(rows[0].amountCents).toBe(123456);
      expect(rows[0]).not.toHaveProperty('amount');
    });

    it('returns [] and warns on error', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      expect(await fetchIncome(AUG)).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchIncome:', 'boom');
    });
  });

  describe('fetchExpenses (treasury-tab.js:344)', () => {
    it('scopes to the church books and pushes the range down', async () => {
      mock.results.fin_expenses = [{ data: [expenseRow()] }];
      const rows = await fetchExpenses(AUG);
      expect(mock.query().table).toBe('fin_expenses');
      expect(mock.chain()).toEqual(['select', 'is', 'gte', 'lte', 'order']);
      expect(mock.args('select')).toEqual(['*']);
      expect(mock.args('is')).toEqual(['project_id', null]);
      expect(mock.args('gte')).toEqual(['occurred_on', '2026-08-01']);
      expect(mock.args('lte')).toEqual(['occurred_on', '2026-08-31']);
      expect(rows[0].amountCents).toBe(85000);
    });

    it('returns [] and warns on error', async () => {
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchExpenses(AUG)).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchExpenses:', 'boom');
    });
  });

  /* ── project-scoped reads (project-treasury.js:236-241, 399-409) ─────── */

  describe('fetchProjectIncome / fetchProjectExpenses', () => {
    it('filters by project, all-time by default (legacy ledger)', async () => {
      await fetchProjectIncome('p1');
      expect(mock.query().table).toBe('fin_income');
      expect(mock.chain()).toEqual(['select', 'eq', 'order']);
      expect(mock.args('eq')).toEqual(['project_id', 'p1']);
    });

    it('pushes an optional range into the query instead of filtering in JS', async () => {
      await fetchProjectExpenses('p1', AUG);
      expect(mock.query().table).toBe('fin_expenses');
      expect(mock.chain()).toEqual(['select', 'eq', 'gte', 'lte', 'order']);
      expect(mock.args('gte')).toEqual(['occurred_on', '2026-08-01']);
      expect(mock.args('lte')).toEqual(['occurred_on', '2026-08-31']);
    });

    it('issues no query for a missing project id', async () => {
      expect(await fetchProjectIncome('')).toEqual([]);
      expect(await fetchProjectExpenses('')).toEqual([]);
      expect(mock.queries).toHaveLength(0);
    });

    it('[] + warn on error', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      expect(await fetchProjectIncome('p1')).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjectIncome:', 'boom');
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchProjectExpenses('p1')).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjectExpenses:', 'boom');
    });
  });

  describe('fetchMinistryAllocations (project-treasury.js:239)', () => {
    it('reads church-books expenses tagged to the ministries', async () => {
      mock.results.fin_expenses = [{ data: [expenseRow({ ministry_id: MIN_A, amount: 12.5 })] }];
      const rows = await fetchMinistryAllocations([MIN_A, MIN_B]);
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'order']);
      expect(mock.args('is')).toEqual(['project_id', null]);
      expect(mock.args('in')).toEqual(['ministry_id', [MIN_A, MIN_B]]);
      expect(rows[0].amountCents).toBe(1250);
    });

    it('adds the range when given, and issues no query for an empty list', async () => {
      await fetchMinistryAllocations([MIN_A], AUG);
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'gte', 'lte', 'order']);
      mock.reset();
      expect(await fetchMinistryAllocations([])).toEqual([]);
      expect(mock.queries).toHaveLength(0);
    });

    it('[] + warn on error', async () => {
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchMinistryAllocations([MIN_A])).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchMinistryAllocations:', 'boom');
    });
  });

  /* ── writes: cents in, numeric out ───────────────────────────────────── */

  describe('createIncome (WIZ.income.toPayload)', () => {
    it('writes `amount` as numeric dollars, never cents', async () => {
      mock.results.fin_income = [{ data: incomeRow() }];
      const res = await createIncome({
        occurred_on: '2026-08-03',
        source: 'Diezmos',
        fund: 'General',
        amountCents: 123456,
        note: null,
        created_by: 'u1',
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')).toEqual([
        {
          occurred_on: '2026-08-03',
          source: 'Diezmos',
          fund: 'General',
          amount: 1234.56,
          note: null,
          created_by: 'u1',
        },
      ]);
      expect(res).toEqual({ ok: true, data: expect.objectContaining({ amountCents: 123456 }) });
    });

    it('rejects an invalid amount before touching the network', async () => {
      expect(await createIncome({ source: 'x', amountCents: 10.5 })).toEqual({
        ok: false,
        error: 'El monto debe ser una cantidad válida.',
      });
      expect(await createIncome({ source: 'x', amountCents: -1 })).toEqual({
        ok: false,
        error: 'El monto no puede ser negativo.',
      });
      expect(mock.queries).toHaveLength(0);
    });

    it('returns the error branch, never throws', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      expect(await createIncome({ source: 'x', amountCents: 100 })).toEqual({
        ok: false,
        error: 'boom',
      });
      expect(warn).toHaveBeenCalledWith('[treasury] createIncome:', 'boom');
    });
  });

  describe('createExpense (WIZ.expenses.toPayload)', () => {
    it('carries the decoded allocation straight through', async () => {
      mock.results.fin_expenses = [{ data: expenseRow() }];
      await createExpense({
        occurred_on: '2026-08-05',
        ministry_id: null,
        label: 'Pastor',
        payee: 'Pastor Juan',
        category: 'Sueldo',
        amountCents: 120000,
        status: 'paid',
        note: null,
        created_by: 'u1',
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')[0]).toMatchObject({
        ministry_id: null,
        label: 'Pastor',
        amount: 1200,
        status: 'paid',
      });
    });
  });

  describe('insertIncomeBatch / insertExpenseBatch (S56c)', () => {
    it('sends ONE insert with every row converted to numeric', async () => {
      mock.results.fin_income = [{ data: [incomeRow(), incomeRow({ id: 'i2', amount: 0.5 })] }];
      const res = await insertIncomeBatch([
        { source: 'Diezmos', amountCents: 123456 },
        { source: 'Ofrenda', amountCents: 50 },
      ]);
      expect(mock.queries).toHaveLength(1);
      expect(mock.chain()).toEqual(['insert', 'select']);
      expect(mock.args('insert')).toEqual([
        [
          { source: 'Diezmos', amount: 1234.56 },
          { source: 'Ofrenda', amount: 0.5 },
        ],
      ]);
      expect(res.ok && res.data.map((r) => r.amountCents)).toEqual([123456, 50]);
    });

    it('an empty batch is a no-op success', async () => {
      expect(await insertIncomeBatch([])).toEqual({ ok: true, data: [] });
      expect(await insertExpenseBatch([])).toEqual({ ok: true, data: [] });
      expect(mock.queries).toHaveLength(0);
    });

    it('names the offending 1-based row and sends nothing', async () => {
      expect(
        await insertExpenseBatch([{ amountCents: 100 }, { amountCents: -5 }, { amountCents: 100 }]),
      ).toEqual({ ok: false, error: 'Fila 2: El monto no puede ser negativo.' });
      expect(mock.queries).toHaveLength(0);
    });

    it('surfaces a server error without throwing', async () => {
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await insertExpenseBatch([{ amountCents: 100 }])).toEqual({
        ok: false,
        error: 'boom',
      });
    });
  });

  describe('updateIncome / updateExpense', () => {
    it('omits `amount` entirely when no new amount is given', async () => {
      mock.results.fin_income = [{ data: incomeRow() }];
      await updateIncome('i1', { note: 'corregido' });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      expect(mock.args('update')).toEqual([{ note: 'corregido' }]);
      expect(mock.args('eq')).toEqual(['id', 'i1']);
    });

    it('converts a new amount to numeric', async () => {
      mock.results.fin_expenses = [{ data: expenseRow() }];
      await updateExpense('e1', { amountCents: 99 });
      expect(mock.args('update')).toEqual([{ amount: 0.99 }]);
    });

    it('validates the new amount and requires an id', async () => {
      expect(await updateIncome('i1', { amountCents: 1.5 })).toEqual({
        ok: false,
        error: 'El monto debe ser una cantidad válida.',
      });
      expect(await updateExpense('', { amountCents: 100 })).toEqual({
        ok: false,
        error: 'Falta el identificador del gasto.',
      });
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('deletes', () => {
    it('delete by id', async () => {
      expect(await deleteIncome('i1')).toEqual({ ok: true, data: undefined });
      expect(mock.query().table).toBe('fin_income');
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('eq')).toEqual(['id', 'i1']);
      mock.reset();
      expect(await deleteExpense('e1')).toEqual({ ok: true, data: undefined });
      expect(mock.args('eq')).toEqual(['id', 'e1']);
    });

    it('delete by exact `auto:` tag (treasury-tab.js:419)', async () => {
      await deleteExpensesByNote('auto:payable:p1');
      expect(mock.query().table).toBe('fin_expenses');
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('eq')).toEqual(['note', 'auto:payable:p1']);
    });

    it('guards missing arguments and surfaces errors', async () => {
      expect(await deleteIncome('')).toEqual({
        ok: false,
        error: 'Falta el identificador del ingreso.',
      });
      expect(await deleteExpensesByNote('')).toEqual({
        ok: false,
        error: 'Falta la etiqueta de la nota.',
      });
      expect(mock.queries).toHaveLength(0);
      mock.results.fin_expenses = [{ error: ERR }];
      expect(await deleteExpense('e1')).toEqual({ ok: false, error: 'boom' });
    });
  });
});
