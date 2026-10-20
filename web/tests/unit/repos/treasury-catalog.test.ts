// S52 — repos/treasury/catalog: the three Configurar lookup tables. S22b — the
// ReadResult / WriteResult contract: a failed read is `{ ok: false }` (never
// an empty dropdown), the catalog is all-or-nothing, and every call made
// signed out is `auth`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NOT_FOUND, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import * as catalog from '#lib/repos/treasury/catalog.js';
import {
  createExpenseCategory,
  createFund,
  createIncomeCategory,
  deleteExpenseCategory,
  deleteFund,
  deleteIncomeCategory,
  fetchCatalog,
  fetchExpenseCategories,
  fetchFunds,
  fetchIncomeCategories,
  updateExpenseCategory,
  updateFund,
  updateIncomeCategory,
} from '#lib/repos/treasury/index.js';

const ERR = { message: 'boom' };
const fundRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  name: 'Misiones',
  restricted: false,
  opening_balance: 0,
  sort: 0,
  archived: false,
  created_at: '2026-01-01T12:00:00Z',
  ...over,
});

describe('repos/treasury/catalog', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('reads (treasury-tab.js:64-71)', () => {
    it('all three read unarchived, sort then name', async () => {
      mock.results.fin_funds = [{ data: [fundRow({ opening_balance: 250.75 })] }];
      const funds = await fetchFunds();
      expect(mock.query().table).toBe('fin_funds');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['archived', false],
        ['sort'],
        ['name'],
      ]);
      if (!funds.ok) throw new Error('expected funds');
      expect(funds.data[0].openingBalanceCents).toBe(25075);
      expect(funds.data[0]).not.toHaveProperty('opening_balance');

      mock.reset();
      await fetchIncomeCategories();
      expect(mock.query().table).toBe('fin_income_categories');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);

      mock.reset();
      await fetchExpenseCategories();
      expect(mock.query().table).toBe('fin_expense_categories');
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
    });

    it('fetchCatalog is the parallel port of loadFundData()', async () => {
      mock.results.fin_funds = [{ data: [fundRow()] }];
      mock.results.fin_income_categories = [{ data: [{ id: 'ic1', name: 'Diezmos' }] }];
      mock.results.fin_expense_categories = [{ data: [{ id: 'ec1', name: 'Renta' }] }];
      const catalog = await fetchCatalog();
      expect(mock.queries.map((q) => q.table)).toEqual([
        'fin_funds',
        'fin_income_categories',
        'fin_expense_categories',
      ]);
      if (!catalog.ok) throw new Error('expected a catalog');
      expect(catalog.data.funds).toHaveLength(1);
      expect(catalog.data.incomeCategories[0].name).toBe('Diezmos');
      expect(catalog.data.expenseCategories[0].name).toBe('Renta');
    });

    it('an empty catalog is a SUCCESS with three empty lists', async () => {
      expect(await fetchCatalog()).toEqual({
        ok: true,
        data: { funds: [], incomeCategories: [], expenseCategories: [] },
      });
    });

    it('every read fails as an error with a tagged warning — never []', async () => {
      mock.results.fin_funds = [{ data: null, error: ERR }];
      mock.results.fin_income_categories = [{ data: null, error: ERR }];
      mock.results.fin_expense_categories = [{ data: null, error: ERR }];
      expect(await fetchCatalog()).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchFunds:', 'boom');
      expect(warn).toHaveBeenCalledWith('[treasury] fetchIncomeCategories:', 'boom');
      expect(warn).toHaveBeenCalledWith('[treasury] fetchExpenseCategories:', 'boom');
    });

    it('ONE failed list fails the whole catalog — no wizard with an empty dropdown', async () => {
      mock.results.fin_funds = [{ data: [fundRow()] }];
      mock.results.fin_income_categories = [{ data: [{ id: 'ic1', name: 'Diezmos' }] }];
      mock.results.fin_expense_categories = [
        { data: null, error: { message: 'permission denied', code: '42501' }, status: 403 },
      ];
      expect(await fetchCatalog()).toEqual(failure('forbidden', '42501: permission denied'));
    });
  });

  describe('fund writes (WIZ.fund.toPayload)', () => {
    it('converts the opening balance to numeric dollars', async () => {
      mock.results.fin_funds = [{ data: fundRow({ opening_balance: 25075 / 100 }) }];
      const res = await createFund({
        name: 'Misiones',
        restricted: true,
        openingBalanceCents: 25075,
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')).toEqual([
        { name: 'Misiones', restricted: true, opening_balance: 250.75 },
      ]);
      expect(res.ok && res.data.openingBalanceCents).toBe(25075);
    });

    it('omits opening_balance when the caller did not set one', async () => {
      mock.results.fin_funds = [{ data: fundRow() }];
      await createFund({ name: 'General' });
      expect(mock.args('insert')).toEqual([{ name: 'General' }]);
    });

    it('allows a NEGATIVE opening balance — the column has no CHECK', async () => {
      mock.results.fin_funds = [{ data: fundRow({ opening_balance: -12.34 }) }];
      const res = await createFund({ name: 'Deuda', openingBalanceCents: -1234 });
      expect(mock.args('insert')).toEqual([{ name: 'Deuda', opening_balance: -12.34 }]);
      expect(res.ok).toBe(true);
    });

    it('still rejects a non-integer cents value', async () => {
      expect(await createFund({ name: 'x', openingBalanceCents: 1.5 })).toEqual(
        invalidInput('El saldo inicial debe ser una cantidad válida.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('update / delete shapes', async () => {
      mock.results.fin_funds = [{ data: fundRow({ name: 'Renombrado' }) }];
      await updateFund('f1', { name: 'Renombrado' });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);
      expect(mock.args('update')).toEqual([{ name: 'Renombrado' }]);
      expect(mock.args('eq')).toEqual(['id', 'f1']);

      mock.reset();
      mock.results.fin_funds = [{ count: 1 }];
      expect(await deleteFund('f1')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('delete')).toEqual([{ count: 'exact' }]);

      expect(await updateFund('', {})).toEqual(invalidInput('Falta el identificador del fondo.'));
      expect(await deleteFund('')).toEqual(invalidInput('Falta el identificador del fondo.'));
    });

    it('a fund delete that matched no row is not_found, never a success (D-027)', async () => {
      mock.results.fin_funds = [{ count: 0 }];
      expect(await deleteFund('f1')).toEqual(NOT_FOUND);
      expect(warn).toHaveBeenCalledWith('[treasury] deleteFund:', 'no row was affected');
    });

    it('deleting a fund still referenced by entries is a conflict with its own copy', async () => {
      mock.results.fin_funds = [
        {
          data: null,
          error: { message: 'violates foreign key constraint', code: '23503' },
          status: 409,
        },
      ];
      expect(await deleteFund('f1')).toEqual({
        ok: false,
        error: {
          kind: 'conflict',
          message: 'No se puede completar porque está vinculado a otros datos.',
          detail: '23503: violates foreign key constraint',
        },
      });
    });
  });

  describe('category writes', () => {
    it('income categories', async () => {
      mock.results.fin_income_categories = [{ data: { id: 'ic1', name: 'Ofrenda especial' } }];
      const res = await createIncomeCategory({ name: 'Ofrenda especial' });
      expect(mock.query().table).toBe('fin_income_categories');
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(res).toEqual({ ok: true, data: { id: 'ic1', name: 'Ofrenda especial' } });

      mock.reset();
      mock.results.fin_income_categories = [{ data: { id: 'ic1', name: 'x' } }];
      await updateIncomeCategory('ic1', { name: 'x' });
      expect(mock.chain()).toEqual(['update', 'eq', 'select', 'single']);

      mock.reset();
      mock.results.fin_income_categories = [{ count: 1 }];
      expect(await deleteIncomeCategory('ic1')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('eq')).toEqual(['id', 'ic1']);

      mock.reset();
      mock.results.fin_income_categories = [{ count: 0 }];
      expect(await deleteIncomeCategory('ic1')).toEqual(NOT_FOUND);
    });

    it('expense categories carry group_name', async () => {
      mock.results.fin_expense_categories = [
        { data: { id: 'ec1', name: 'Renta', group_name: 'Servicios' } },
      ];
      await createExpenseCategory({ name: 'Renta', group_name: 'Servicios' });
      expect(mock.query().table).toBe('fin_expense_categories');
      expect(mock.args('insert')).toEqual([{ name: 'Renta', group_name: 'Servicios' }]);

      mock.reset();
      mock.results.fin_expense_categories = [{ data: { id: 'ec1' } }];
      await updateExpenseCategory('ec1', { group_name: 'Otros' });
      expect(mock.args('update')).toEqual([{ group_name: 'Otros' }]);

      mock.reset();
      mock.results.fin_expense_categories = [{ count: 1 }];
      expect(await deleteExpenseCategory('ec1')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
    });

    it('write errors come back as the mapped error branch, never thrown', async () => {
      mock.results.fin_expense_categories = [{ data: null, error: ERR }];
      expect(await createExpenseCategory({ name: 'x' })).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] createExpenseCategory:', 'boom');
      expect(await deleteExpenseCategory('')).toEqual(
        invalidInput('Falta el identificador de la categoría.'),
      );
      expect(await updateIncomeCategory('', {})).toEqual(
        invalidInput('Falta el identificador de la categoría.'),
      );
    });
  });

  // RLS: the read policies are `to authenticated using (true)` — anon gets nothing.
  describeSessionGate(catalog, '[treasury]', {
    staffOnly: {
      fetchFunds: () => fetchFunds(),
      fetchIncomeCategories: () => fetchIncomeCategories(),
      fetchExpenseCategories: () => fetchExpenseCategories(),
      fetchCatalog: () => fetchCatalog(),
      createFund: () => createFund({ name: 'Misiones' }),
      updateFund: () => updateFund('f1', { name: 'x' }),
      deleteFund: () => deleteFund('f1'),
      createIncomeCategory: () => createIncomeCategory({ name: 'x' }),
      updateIncomeCategory: () => updateIncomeCategory('ic1', { name: 'x' }),
      deleteIncomeCategory: () => deleteIncomeCategory('ic1'),
      createExpenseCategory: () => createExpenseCategory({ name: 'x' }),
      updateExpenseCategory: () => updateExpenseCategory('ec1', { name: 'x' }),
      deleteExpenseCategory: () => deleteExpenseCategory('ec1'),
    },
  });
});
