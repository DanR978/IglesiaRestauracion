// S52 — repos/treasury/payables: list/CRUD plus the `auto:payable:<id>` books
// mirror (treasury-tab.js:402-438). The mirror is what makes a paid bill show
// up in Gastos/Resumen/Reportes, so its payload and its step order are
// asserted precisely. S22b — the ReadResult / WriteResult contract, D-027
// (a write that matched no payable never reaches the books), Retry
// convergence for both multi-step writes, and `auth` signed out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NOT_FOUND, OFFLINE, failure, invalidInput } from './results';
import { describeSessionGate } from './session-gate';
import { REPO_ERROR_MESSAGES } from '#lib/repos/errors.js';
import * as payables from '#lib/repos/treasury/payables.js';
import {
  createPayable,
  deletePayable,
  fetchPayables,
  markPayablePaid,
  updatePayable,
} from '#lib/repos/treasury/index.js';

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
      const res = await fetchPayables();
      expect(mock.query().table).toBe('fin_payables');
      expect(mock.chain()).toEqual(['select', 'order', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['status'],
        ['due_on', { ascending: true, nullsFirst: false }],
      ]);
      expect(res.ok && res.data[0].amountCents).toBe(9999);
    });

    it('filters the status server-side when asked', async () => {
      await fetchPayables({ status: 'open' });
      expect(mock.chain()).toEqual(['select', 'eq', 'order', 'order']);
      expect(mock.args('eq')).toEqual(['status', 'open']);
    });

    it('a failed read is an error, never "Por pagar: $0.00" (PORT-DEBT S53)', async () => {
      mock.results.fin_payables = [{ data: null, error: ERR }];
      const res = await fetchPayables();
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: [] });
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
      expect(await createPayable({ creditor: 'x', amountCents: -1 })).toEqual(
        invalidInput('El monto no puede ser negativo.'),
      );
      expect(await updatePayable('', {})).toEqual(
        invalidInput('Falta el identificador de la cuenta por pagar.'),
      );
      expect(mock.queries).toHaveLength(0);
    });

    it('write errors come back mapped', async () => {
      mock.results.fin_payables = [{ data: null, error: ERR }];
      expect(await createPayable({ creditor: 'x', amountCents: 1 })).toEqual(
        failure('unknown', 'boom'),
      );
      expect(warn).toHaveBeenCalledWith('[treasury] createPayable:', 'boom');
    });
  });

  describe('deletePayable (treasury-tab.js:419)', () => {
    it('removes the mirrored expense first, then the payable (counted)', async () => {
      mock.results.fin_payables = [{ count: 1 }];
      expect(await deletePayable('p1')).toEqual({ ok: true, data: undefined });
      expect(mock.queries.map((q) => q.table)).toEqual(['fin_expenses', 'fin_payables']);
      expect(mock.chain(0)).toEqual(['delete', 'eq']);
      expect(mock.args('eq', 0)).toEqual(['note', 'auto:payable:p1']);
      expect(mock.chain(1)).toEqual(['delete', 'eq']);
      expect(mock.args('delete', 1)).toEqual([{ count: 'exact' }]);
      expect(mock.args('eq', 1)).toEqual(['id', 'p1']);
    });

    it('a failed mirror delete leaves the payable untouched', async () => {
      mock.results.fin_expenses = [{ error: ERR }];
      expect(await deletePayable('p1')).toEqual(failure('unknown', 'boom'));
      expect(mock.queries.map((q) => q.table)).toEqual(['fin_expenses']);
    });

    it('a Retry converges after the payable delete itself failed', async () => {
      mock.results.fin_payables = [OFFLINE];
      expect(await deletePayable('p1')).toEqual(failure('network', 'TypeError: Failed to fetch'));
      // Retry: the mirror is already gone (zero matches is a success), the payable goes now.
      mock.results.fin_payables = [{ count: 1 }];
      expect(await deletePayable('p1')).toEqual({ ok: true, data: undefined });
    });

    it('a payable delete that matched no row is not_found (D-027)', async () => {
      mock.results.fin_payables = [{ count: 0 }];
      expect(await deletePayable('p1')).toEqual(NOT_FOUND);
    });

    it('requires an id', async () => {
      expect(await deletePayable('')).toEqual(
        invalidInput('Falta el identificador de la cuenta por pagar.'),
      );
      expect(mock.queries).toHaveLength(0);
    });
  });

  describe('markPayablePaid (treasury-tab.js:425-438)', () => {
    it('updates the payable (counted), clears the old mirror, then inserts the new one', async () => {
      mock.results.fin_payables = [{ count: 1 }];
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
      expect(mock.args('update', 0)).toEqual([
        { status: 'paid', paid_at: PAID_AT },
        { count: 'exact' },
      ]);
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
      mock.results.fin_payables = [{ count: 1 }];
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
      ).toEqual(failure('unknown', 'boom'));
      expect(mock.queries).toHaveLength(1);
    });

    it('an update that matched no payable never posts a gasto (D-027)', async () => {
      mock.results.fin_payables = [{ count: 0 }];
      expect(
        await markPayablePaid({ id: 'p1', ministry_id: null, creditor: 'x', amountCents: 100 }),
      ).toEqual(NOT_FOUND);
      expect(mock.queries.map((q) => q.table)).toEqual(['fin_payables']);
    });

    it('says plainly the bill is paid when the new mirror could not be written', async () => {
      mock.results.fin_payables = [{ count: 1 }];
      mock.results.fin_expenses = [{}, { error: ERR }];
      const res = await markPayablePaid(
        { id: 'p1', ministry_id: null, creditor: 'x', amountCents: 100 },
        { paidAt: PAID_AT },
      );
      expect(res).toEqual({
        ok: false,
        error: {
          kind: 'unknown',
          message: `Se marcó como pagada, pero no se pudo registrar el gasto. ${REPO_ERROR_MESSAGES.unknown}`,
          detail: 'boom',
        },
      });
      expect(warn).toHaveBeenCalledWith('[treasury] markPayablePaid:', 'boom');
    });

    it('…and when the old mirror could not be cleared (a Retry finishes the job)', async () => {
      mock.results.fin_payables = [{ count: 1 }];
      mock.results.fin_expenses = [OFFLINE];
      const res = await markPayablePaid(
        { id: 'p1', ministry_id: null, creditor: 'x', amountCents: 100 },
        { paidAt: PAID_AT },
      );
      expect(res).toEqual({
        ok: false,
        error: {
          kind: 'network',
          message: `Se marcó como pagada, pero no se pudo actualizar el gasto. ${REPO_ERROR_MESSAGES.network}`,
          detail: 'TypeError: Failed to fetch',
        },
      });
      expect(mock.queries).toHaveLength(2); // no insert after a failed clear
    });

    it('validates its arguments before writing anything', async () => {
      expect(
        await markPayablePaid({
          id: '',
          ministry_id: null,
          creditor: 'x',
          amountCents: 100,
        }),
      ).toEqual(invalidInput('Falta la cuenta por pagar.'));
      expect(
        await markPayablePaid({
          id: 'p1',
          ministry_id: null,
          creditor: 'x',
          amountCents: 1.5,
        }),
      ).toEqual(invalidInput('El monto debe ser una cantidad válida.'));
      expect(mock.queries).toHaveLength(0);
    });
  });

  // RLS: every `fin_*` policy is `to authenticated`.
  describeSessionGate(payables, '[treasury]', {
    staffOnly: {
      fetchPayables: () => fetchPayables(),
      createPayable: () => createPayable({ creditor: 'x', amountCents: 100 }),
      updatePayable: () => updatePayable('p1', { note: 'x' }),
      deletePayable: () => deletePayable('p1'),
      markPayablePaid: () =>
        markPayablePaid(
          { id: 'p1', ministry_id: null, creditor: 'x', amountCents: 100 },
          { paidAt: PAID_AT },
        ),
    },
  });
});
