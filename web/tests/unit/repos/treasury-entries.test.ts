// S52 — repos/treasury/entries: query shape per the legacy `fin_income` /
// `fin_expenses` calls and cents conversion in both directions. S22b — the
// ReadResult / WriteResult contract: a failed ledger read is `{ ok: false }`,
// never an empty month, and a delete that matched no row is `not_found`
// (D-027). Query SHAPE is what we assert; RLS behaviour is staging's job
// (VERIFICATION.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NOT_FOUND, OFFLINE, failure, invalidInput } from './results';
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
} from '#lib/repos/treasury/index.js';

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
      const res = await fetchIncome(AUG);
      expect(mock.query().table).toBe('fin_income');
      expect(mock.chain()).toEqual(['select', 'is', 'gte', 'lte', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['project_id', null],
        ['occurred_on', '2026-08-01'],
        ['occurred_on', '2026-08-31'],
        ['occurred_on', { ascending: false }],
      ]);
      if (!res.ok) throw new Error('expected rows');
      expect(res.data[0].amountCents).toBe(123456);
      expect(res.data[0]).not.toHaveProperty('amount');
    });

    it('a month with no income is an empty SUCCESS', async () => {
      mock.results.fin_income = [{ data: [] }];
      expect(await fetchIncome(AUG)).toEqual({ ok: true, data: [] });
    });

    it('a failed read is an error, never an empty month (D-032)', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      const res = await fetchIncome(AUG);
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
      expect(warn).toHaveBeenCalledWith('[treasury] fetchIncome:', 'boom');
    });
  });

  describe('fetchExpenses (treasury-tab.js:344)', () => {
    it('scopes to the church books and pushes the range down', async () => {
      mock.results.fin_expenses = [{ data: [expenseRow()] }];
      const res = await fetchExpenses(AUG);
      expect(mock.query().table).toBe('fin_expenses');
      expect(mock.chain()).toEqual(['select', 'is', 'gte', 'lte', 'order']);
      expect(mock.args('select')).toEqual(['*']);
      expect(mock.args('is')).toEqual(['project_id', null]);
      expect(mock.args('gte')).toEqual(['occurred_on', '2026-08-01']);
      expect(mock.args('lte')).toEqual(['occurred_on', '2026-08-31']);
      expect(res.ok && res.data[0].amountCents).toBe(85000);
    });

    it('a failed read is an error, never an empty month (D-032)', async () => {
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchExpenses(AUG)).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchExpenses:', 'boom');
    });

    it('a dropped connection is a network error', async () => {
      mock.results.fin_expenses = [OFFLINE];
      expect(await fetchExpenses(AUG)).toEqual(failure('network', 'TypeError: Failed to fetch'));
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

    it('issues no query for a missing project id: an empty success', async () => {
      expect(await fetchProjectIncome('')).toEqual({ ok: true, data: [] });
      expect(await fetchProjectExpenses('')).toEqual({ ok: true, data: [] });
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed read is an error + warn, never []', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      expect(await fetchProjectIncome('p1')).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjectIncome:', 'boom');
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchProjectExpenses('p1')).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjectExpenses:', 'boom');
    });
  });

  describe('fetchMinistryAllocations (project-treasury.js:239)', () => {
    it('reads church-books expenses tagged to the ministries', async () => {
      mock.results.fin_expenses = [{ data: [expenseRow({ ministry_id: MIN_A, amount: 12.5 })] }];
      const res = await fetchMinistryAllocations([MIN_A, MIN_B]);
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'order']);
      expect(mock.args('is')).toEqual(['project_id', null]);
      expect(mock.args('in')).toEqual(['ministry_id', [MIN_A, MIN_B]]);
      expect(res.ok && res.data[0].amountCents).toBe(1250);
    });

    it('adds the range when given, and issues no query for an empty list', async () => {
      await fetchMinistryAllocations([MIN_A], AUG);
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'gte', 'lte', 'order']);
      mock.reset();
      expect(await fetchMinistryAllocations([])).toEqual({ ok: true, data: [] });
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed read is an error — never a ministry with "no budget" (PORT-DEBT S56)', async () => {
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchMinistryAllocations([MIN_A])).toEqual(failure('unknown', 'boom'));
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
      expect(await createIncome({ source: 'x', amountCents: 10.5 })).toEqual(
        invalidInput('El monto debe ser una cantidad válida.'),
      );
      expect(await createIncome({ source: 'x', amountCents: -1 })).toEqual(
        invalidInput('El monto no puede ser negativo.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('returns the mapped error branch, never throws', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      expect(await createIncome({ source: 'x', amountCents: 100 })).toEqual(
        failure('unknown', 'boom'),
      );
      expect(warn).toHaveBeenCalledWith('[treasury] createIncome:', 'boom');
    });

    it('an RLS refusal is forbidden', async () => {
      mock.results.fin_income = [
        {
          data: null,
          error: { message: 'new row violates row-level security policy', code: '42501' },
          status: 403,
        },
      ];
      const res = await createIncome({ source: 'x', amountCents: 100 });
      expect(res.ok === false && res.error.kind).toBe('forbidden');
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
      ).toEqual(invalidInput('Fila 2: El monto no puede ser negativo.'));
      expect(mock.queries).toHaveLength(0);
    });

    it('surfaces a server error without throwing', async () => {
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await insertExpenseBatch([{ amountCents: 100 }])).toEqual(failure('unknown', 'boom'));
      mock.results.fin_income = [OFFLINE];
      expect(await insertIncomeBatch([{ source: 'Diezmos', amountCents: 100 }])).toEqual(
        failure('network', 'TypeError: Failed to fetch'),
      );
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
      expect(await updateIncome('i1', { amountCents: 1.5 })).toEqual(
        invalidInput('El monto debe ser una cantidad válida.'),
      );
      expect(await updateExpense('', { amountCents: 100 })).toEqual(
        invalidInput('Falta el identificador del gasto.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('moving an entry to another project is refused by the D-027 trigger (42501)', async () => {
      mock.results.fin_expenses = [
        {
          data: null,
          error: {
            message: 'Solo tesorería puede mover un movimiento a otro proyecto.',
            code: '42501',
          },
          status: 403,
        },
      ];
      expect(await updateExpense('e1', { project_id: 'p2' })).toEqual(
        failure('forbidden', '42501: Solo tesorería puede mover un movimiento a otro proyecto.'),
      );
    });

    it('an update that matched no entry (PGRST116) is not_found', async () => {
      mock.results.fin_income = [
        {
          data: null,
          error: {
            message: 'JSON object requested, multiple (or no) rows returned',
            code: 'PGRST116',
          },
          status: 406,
        },
      ];
      const res = await updateIncome('gone', { note: 'x' });
      expect(res.ok === false && res.error.kind).toBe('not_found');
    });
  });

  describe('deletes', () => {
    it('delete by id, counted', async () => {
      mock.results.fin_income = [{ count: 1 }];
      expect(await deleteIncome('i1')).toEqual({ ok: true, data: undefined });
      expect(mock.query().table).toBe('fin_income');
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([{ count: 'exact' }]);
      expect(mock.args('eq')).toEqual(['id', 'i1']);
      mock.reset();
      mock.results.fin_expenses = [{ count: 1 }];
      expect(await deleteExpense('e1')).toEqual({ ok: true, data: undefined });
      expect(mock.args('eq')).toEqual(['id', 'e1']);
    });

    it('a delete that matched no row is not_found, never a success (D-027)', async () => {
      mock.results.fin_income = [{ count: 0 }];
      expect(await deleteIncome('i1')).toEqual(NOT_FOUND);
      mock.results.fin_expenses = [{ count: 0 }];
      expect(await deleteExpense('e1')).toEqual(NOT_FOUND);
      expect(warn).toHaveBeenCalledWith('[treasury] deleteExpense:', 'no row was affected');
    });

    it('delete by exact `auto:` tag (treasury-tab.js:419) — zero matches is fine', async () => {
      expect(await deleteExpensesByNote('auto:payable:p1')).toEqual({ ok: true, data: undefined });
      expect(mock.query().table).toBe('fin_expenses');
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([]);
      expect(mock.args('eq')).toEqual(['note', 'auto:payable:p1']);
    });

    it('guards missing arguments and surfaces errors', async () => {
      expect(await deleteIncome('')).toEqual(invalidInput('Falta el identificador del ingreso.'));
      expect(await deleteExpensesByNote('')).toEqual(invalidInput('Falta la etiqueta de la nota.'));
      expect(mock.queries).toHaveLength(0);
      mock.results.fin_expenses = [{ error: ERR }];
      expect(await deleteExpense('e1')).toEqual(failure('unknown', 'boom'));
    });
  });
});
