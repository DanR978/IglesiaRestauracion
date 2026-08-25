// S52 — repos/treasury/recurring: list/CRUD plus `materializeRecurring`, the
// idempotent port of ensureRecurringForMonth (treasury-tab.js:377-399). The
// `auto:recurring:<id>:<month>` tag is the whole idempotency mechanism, so it
// is asserted from both sides: tags that exist are skipped, and a failed tag
// read must NOT fall through to a duplicate insert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock } from './mock-client';
import {
  createRecurring,
  deleteRecurring,
  fetchRecurring,
  materializeRecurring,
  updateRecurring,
} from '$lib/repos/treasury';

const ERR = { message: 'boom' };
const MIN_A = '11111111-1111-1111-1111-111111111111';

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  payee: 'Arrendador',
  ministry_id: null,
  category: null,
  amount: 850,
  frequency: 'monthly',
  day_of_month: 1,
  active: true,
  note: null,
  label: null,
  created_by: null,
  created_at: '2026-01-01T12:00:00Z',
  ...over,
});

describe('repos/treasury/recurring', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchRecurring (treasury-tab.js:361)', () => {
    it('active first, then payee', async () => {
      mock.results.fin_recurring = [{ data: [rec({ amount: 1200.5 })] }];
      const rows = await fetchRecurring();
      expect(mock.query().table).toBe('fin_recurring');
      expect(mock.chain()).toEqual(['select', 'order', 'order']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['active', { ascending: false }],
        ['payee'],
      ]);
      expect(rows[0].amountCents).toBe(120050);
    });

    it('[] + warn on error', async () => {
      mock.results.fin_recurring = [{ data: null, error: ERR }];
      expect(await fetchRecurring()).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[treasury] fetchRecurring:', 'boom');
    });
  });

  describe('CRUD (WIZ.recurring.toPayload)', () => {
    it('create converts cents and keeps the derived payee/allocation', async () => {
      mock.results.fin_recurring = [{ data: rec() }];
      await createRecurring({
        payee: 'Pastor Juan',
        ministry_id: null,
        label: 'Pastor Juan',
        category: null,
        amountCents: 120000,
        frequency: 'monthly',
        day_of_month: 5,
        created_by: 'u1',
      });
      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')[0]).toMatchObject({
        payee: 'Pastor Juan',
        label: 'Pastor Juan',
        amount: 1200,
        frequency: 'monthly',
        day_of_month: 5,
      });
    });

    it('update omits amount unless given; delete filters by id', async () => {
      mock.results.fin_recurring = [{ data: rec({ active: false }) }];
      await updateRecurring('r1', { active: false });
      expect(mock.args('update')).toEqual([{ active: false }]);

      mock.reset();
      expect(await deleteRecurring('r1')).toEqual({ ok: true, data: undefined });
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('eq')).toEqual(['id', 'r1']);

      expect(await updateRecurring('', {})).toEqual({
        ok: false,
        error: 'Falta el identificador del pago recurrente.',
      });
      expect(await createRecurring({ payee: 'x', amountCents: -1 })).toEqual({
        ok: false,
        error: 'El monto no puede ser negativo.',
      });
    });
  });

  describe('materializeRecurring (treasury-tab.js:377-399)', () => {
    it('reads only ACTIVE MONTHLY payments and the month’s existing tags', async () => {
      mock.results.fin_recurring = [{ data: [] }];
      await materializeRecurring('2026-08', { today: '2026-08-20' });
      expect(mock.queries.map((q) => q.table)).toEqual(['fin_recurring', 'fin_expenses']);
      expect(mock.chain(0)).toEqual(['select', 'eq', 'eq']);
      expect(mock.query(0).calls.map((c) => c.args)).toEqual([
        ['*'],
        ['active', true],
        ['frequency', 'monthly'],
      ]);
      expect(mock.chain(1)).toEqual(['select', 'gte', 'lte', 'like']);
      expect(mock.query(1).calls.map((c) => c.args)).toEqual([
        ['note'],
        ['occurred_on', '2026-08-01'],
        ['occurred_on', '2026-08-31'],
        ['note', 'auto:recurring:%'],
      ]);
    });

    it('inserts one tagged expense per un-materialized payment', async () => {
      mock.results.fin_recurring = [
        {
          data: [
            rec({ id: 'r1', day_of_month: 1, amount: 850 }),
            rec({ id: 'r2', payee: 'Pastor', label: 'Pastor', day_of_month: 5, amount: 1200 }),
            rec({ id: 'r3', payee: 'Medios', ministry_id: MIN_A, day_of_month: null, amount: 40 }),
          ],
        },
      ];
      mock.results.fin_expenses = [{ data: [] }];
      const res = await materializeRecurring('2026-08', {
        createdBy: 'u1',
        today: '2026-08-20',
      });
      expect(res).toEqual({ ok: true, data: { inserted: 3 } });
      expect(mock.queries.map((q) => q.table)).toEqual([
        'fin_recurring',
        'fin_expenses',
        'fin_expenses',
      ]);
      expect(mock.args('insert', 2)).toEqual([
        [
          {
            occurred_on: '2026-08-01',
            ministry_id: null,
            label: null,
            payee: 'Arrendador',
            category: 'Recurrente',
            amount: 850,
            status: 'paid',
            note: 'auto:recurring:r1:2026-08',
            created_by: 'u1',
          },
          {
            occurred_on: '2026-08-05',
            ministry_id: null,
            label: 'Pastor',
            payee: 'Pastor',
            category: 'Recurrente',
            amount: 1200,
            status: 'paid',
            note: 'auto:recurring:r2:2026-08',
            created_by: 'u1',
          },
          {
            occurred_on: '2026-08-01',
            ministry_id: MIN_A,
            label: null,
            payee: 'Medios',
            category: 'Recurrente',
            amount: 40,
            status: 'paid',
            note: 'auto:recurring:r3:2026-08',
            created_by: 'u1',
          },
        ],
      ]);
    });

    it('is idempotent: a payment whose tag is already there is skipped', async () => {
      mock.results.fin_recurring = [{ data: [rec({ id: 'r1' }), rec({ id: 'r2' })] }];
      mock.results.fin_expenses = [{ data: [{ note: 'auto:recurring:r1:2026-08' }] }];
      const res = await materializeRecurring('2026-08', { today: '2026-08-20' });
      expect(res).toEqual({ ok: true, data: { inserted: 1 } });
      expect((mock.args('insert', 2)[0] as { note: string }[])[0].note).toBe(
        'auto:recurring:r2:2026-08',
      );
    });

    it('a second run over the same month inserts nothing', async () => {
      mock.results.fin_recurring = [{ data: [rec({ id: 'r1' })] }];
      mock.results.fin_expenses = [{ data: [{ note: 'auto:recurring:r1:2026-08' }] }];
      expect(await materializeRecurring('2026-08', { today: '2026-08-20' })).toEqual({
        ok: true,
        data: { inserted: 0 },
      });
      expect(mock.queries).toHaveLength(2); // no insert
    });

    it('clamps the day to the month and defaults a missing day to the 1st', async () => {
      mock.results.fin_recurring = [
        { data: [rec({ id: 'r1', day_of_month: 31 }), rec({ id: 'r2', day_of_month: 0 })] },
      ];
      mock.results.fin_expenses = [{ data: [] }];
      await materializeRecurring('2026-02', { today: '2026-08-20' });
      expect(
        (mock.args('insert', 2)[0] as { occurred_on: string }[]).map((r) => r.occurred_on),
      ).toEqual(['2026-02-28', '2026-02-01']);
    });

    it('does not back-fill months before the payment existed', async () => {
      mock.results.fin_recurring = [{ data: [rec({ created_at: '2026-09-15T00:00:00Z' })] }];
      mock.results.fin_expenses = [{ data: [] }];
      expect(await materializeRecurring('2026-08', { today: '2026-10-01' })).toEqual({
        ok: true,
        data: { inserted: 0 },
      });
      expect(mock.queries).toHaveLength(2);
    });

    it('never generates rows for a future month, and issues no query at all', async () => {
      expect(await materializeRecurring('2026-09', { today: '2026-08-20' })).toEqual({
        ok: true,
        data: { inserted: 0 },
      });
      expect(mock.queries).toHaveLength(0);
      // The current month IS materialized.
      mock.results.fin_recurring = [{ data: [] }];
      await materializeRecurring('2026-08', { today: '2026-08-01' });
      expect(mock.queries).toHaveLength(2);
    });

    it('rejects a malformed month key without querying', async () => {
      expect(await materializeRecurring('2026-13')).toEqual({ ok: false, error: 'Mes inválido.' });
      expect(mock.queries).toHaveLength(0);
    });

    it('ABORTS when the existing-tag read fails — never risks double-posting', async () => {
      mock.results.fin_recurring = [{ data: [rec()] }];
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await materializeRecurring('2026-08', { today: '2026-08-20' })).toEqual({
        ok: false,
        error: 'boom',
      });
      expect(mock.queries).toHaveLength(2); // the insert never happened
    });

    it('aborts when the recurring read fails, and surfaces an insert failure', async () => {
      mock.results.fin_recurring = [{ data: null, error: ERR }];
      mock.results.fin_expenses = [{ data: [] }];
      expect(await materializeRecurring('2026-08', { today: '2026-08-20' })).toEqual({
        ok: false,
        error: 'boom',
      });

      mock.reset();
      mock.results.fin_recurring = [{ data: [rec()] }];
      mock.results.fin_expenses = [{ data: [] }, { error: ERR }];
      expect(await materializeRecurring('2026-08', { today: '2026-08-20' })).toEqual({
        ok: false,
        error: 'boom',
      });
    });
  });
});
