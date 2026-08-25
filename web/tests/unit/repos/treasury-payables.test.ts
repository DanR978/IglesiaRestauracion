// S52 — repos/treasury/payables: list/CRUD plus the `auto:payable:<id>` books
// mirror (treasury-tab.js:402-438). The mirror is what makes a paid bill show
// up in Gastos/Resumen/Reportes, so its payload and its delete-then-insert
// order are asserted precisely.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  createPayable,
  deletePayable,
  fetchPayables,
  markPayablePaid,
  updatePayable,
} from '$lib/repos/treasury';

const ERR = { message: 'boom' };
const MIN_A = '11111111-1111-1111-1111-111111111111';
const PAID_AT = '2026-08-20T15:04:05.000Z';

const payable = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  creditor: 'Proveedor',
  amount: 99.99,
  due_on: '2026-08-31',
  ministry_id: null,
  status: 'open',
  note: null,
  created_by: null,
  created_at: '2026-08-01T12:00:00Z',
  paid_at: null,
  ...over,
});

describe('repos/treasury/payables', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchPayables (treasury-tab.js:403-404)', () => {
    it('orders by status then due date, undated last', async () => {
      mock.results.fin_payables = [{ data: [payable()] }];
      const rows = await fetchPayables();
      expect(mock.query().table).toBe('fin_payables');
      expect(mock.chain()).toEqual(['select', 'order', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['status'],
        ['due_on', { ascending: true, nullsFirst: false }],
      ]);
      expect(rows[0].amountCents).toBe(9999);
    });

    it('filters the status server-side when asked', async () => {
      await fetchPayables({ status: 'open' });
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
      expect(mock.args('eq')).toEqual(['status', 'open']);
    });

    it('[] + warn on error', async () => {
      mock.results.fin_payables = [{ data: null, error: ERR }];
      expect(await fetchPayables()).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchPayables:', 'boom');
    });
  });

  describe('CRUD (WIZ.payables.toPayload)', () => {
    it('create converts cents; update omits amount unless given', async () => {
      mock.results.fin_payables = [{ data: payable() }];
      await createPayable({
        creditor: 'Proveedor',
        amountCents: 9999,
        due_on: '2026-08-31',
        ministry_id: null,
        note: null,
        created_by: 'u1',
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')[0]).toMatchObject({ creditor: 'Proveedor', amount: 99.99 });

      mock.reset();
      mock.results.fin_payables = [{ data: payable() }];
      await updatePayable('p1', { note: 'llamar' });
      expect(mock.args('update')).toEqual([{ note: 'llamar' }]);
      expect(mock.args('eq')).toEqual(['id', 'p1']);
    });

    it('guards ids and amounts', async () => {
      expect(await createPayable({ creditor: 'x', amountCents: -1 })).toEqual({
        ok: false,
        error: 'El monto no puede ser negativo.',
      });
      expect(await updatePayable('', {})).toEqual({
        ok: false,
        error: 'Falta el identificador de la cuenta por pagar.',
      });
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('deletePayable (treasury-tab.js:419)', () => {
    it('removes the payable, then its mirrored expense', async () => {
      expect(await deletePayable('p1')).toEqual({ ok: true, data: undefined });
      expect(mock.queries.map((q) => q.table)).toEqual(['fin_payables', 'fin_expenses']);
      expect(mock.chain(0)).toEqual(['delete', 'eq']);
      expect(mock.args('eq', 0)).toEqual(['id', 'p1']);
      expect(mock.args('eq', 1)).toEqual(['note', 'auto:payable:p1']);
    });

    it('does not touch the books when the payable delete fails', async () => {
      mock.results.fin_payables = [{ error: ERR }];
      expect(await deletePayable('p1')).toEqual({ ok: false, error: 'boom' });
      expect(mock.queries).toHaveLength(1);
    });

    it('requires an id', async () => {
      expect(await deletePayable('')).toEqual({
        ok: false,
        error: 'Falta el identificador de la cuenta por pagar.',
      });
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('markPayablePaid (treasury-tab.js:425-438)', () => {
    it('updates the payable, clears the old mirror, then inserts the new one', async () => {
      const res = await markPayablePaid(
        { id: 'p1', ministry_id: MIN_A, creditor: 'Proveedor', amountCents: 9999 },
        { createdBy: 'u1', paidAt: PAID_AT },
      );
      expect(res).toEqual({ ok: true, data: { paidAt: PAID_AT } });
      expect(mock.queries.map((q) => q.table)).toEqual([
        'fin_payables',
        'fin_expenses',
        'fin_expenses',
      ]);
      expect(mock.args('update', 0)).toEqual([{ status: 'paid', paid_at: PAID_AT }]);
      expect(mock.args('eq', 0)).toEqual(['id', 'p1']);
      expect(mock.chain(1)).toEqual(['delete', 'eq']);
      expect(mock.args('eq', 1)).toEqual(['note', 'auto:payable:p1']);
      expect(mock.args('insert', 2)).toEqual([
        {
          occurred_on: '2026-08-20',
          ministry_id: MIN_A,
          label: null,
          payee: 'Proveedor',
          category: 'Cuenta pagada',
          amount: 99.99,
          status: 'paid',
          note: 'auto:payable:p1',
          created_by: 'u1',
        },
      ]);
    });

    it('normalises a missing ministry to null', async () => {
      await markPayablePaid(
        { id: 'p1', ministry_id: null, creditor: 'Proveedor', amountCents: 100 },
        { paidAt: PAID_AT },
      );
      expect(mock.args('insert', 2)[0]).toMatchObject({ ministry_id: null, created_by: null });
    });

    it('stops at the update failure and writes no mirror', async () => {
      mock.results.fin_payables = [{ error: ERR }];
      expect(
        await markPayablePaid({
          id: 'p1',
          ministry_id: null,
          creditor: 'x',
          amountCents: 100,
        }),
      ).toEqual({ ok: false, error: 'boom' });
      expect(mock.queries).toHaveLength(1);
    });

    it('says so plainly when the payable was marked but the mirror failed', async () => {
      mock.results.fin_expenses = [{}, { error: ERR }];
      const res = await markPayablePaid(
        { id: 'p1', ministry_id: null, creditor: 'x', amountCents: 100 },
        { paidAt: PAID_AT },
      );
      expect(res).toEqual({
        ok: false,
        error: 'Se marcó como pagada, pero no se pudo registrar el gasto: boom',
      });
    });

    it('validates its arguments before writing anything', async () => {
      expect(
        await markPayablePaid({
          id: '',
          ministry_id: null,
          creditor: 'x',
          amountCents: 100,
        }),
      ).toEqual({ ok: false, error: 'Falta la cuenta por pagar.' });
      expect(
        await markPayablePaid({
          id: 'p1',
          ministry_id: null,
          creditor: 'x',
          amountCents: 1.5,
        }),
      ).toEqual({ ok: false, error: 'El monto debe ser una cantidad válida.' });
      expect(mock.queries).toHaveLength(0);
    });
  });
});
