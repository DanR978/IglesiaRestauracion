// S52 — repos/treasury/summary: the narrow aggregate projections. Asserts the
// literal select strings (G-024), the pushed-down range (PERF-07) and exact
// cent totals (D-003). S22b — aggregates are ALL OR NOTHING: if any of their
// parallel reads fails the result is `{ ok: false }`, never totals computed
// from the reads that happened to succeed — legacy's "$0.00 because the query
// errored" (PORT-DEBT S53/S56) cannot be represented any more.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { OFFLINE, failure } from './results';
import {
  fetchBooksSummary,
  fetchMinistryAllocationTotals,
  fetchProjectTotals,
  fetchReportEntries,
} from '#lib/repos/treasury/index.js';

const ERR = { message: 'boom' };
const AUG = { start: '2026-08-01', end: '2026-08-31' };
const YEAR = { start: '2026-01-01', end: '2026-12-31' };
const MIN_A = '11111111-1111-1111-1111-111111111111';
const MIN_B = '22222222-2222-2222-2222-222222222222';

describe('repos/treasury/summary', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchBooksSummary (treasury-tab.js:118-137)', () => {
    it('runs the three legacy queries with their literal projections', async () => {
      await fetchBooksSummary(AUG);
      expect(mock.queries.map((q) => q.table)).toEqual([
        'fin_income',
        'fin_expenses',
        'fin_payables',
      ]);
      expect(mock.chain(0)).toEqual(['select', 'is', 'gte', 'lte']);
      expect(mock.args('select', 0)).toEqual(['amount']);
      expect(mock.args('is', 0)).toEqual(['project_id', null]);
      expect(mock.args('gte', 0)).toEqual(['occurred_on', '2026-08-01']);
      expect(mock.args('lte', 0)).toEqual(['occurred_on', '2026-08-31']);

      expect(mock.chain(1)).toEqual(['select', 'is', 'gte', 'lte']);
      expect(mock.args('select', 1)).toEqual(['amount,ministry_id,label']);

      // Payables are ALL-TIME open, deliberately un-ranged (legacy :121).
      expect(mock.chain(2)).toEqual(['select', 'eq']);
      expect(mock.args('select', 2)).toEqual(['amount']);
      expect(mock.args('eq', 2)).toEqual(['status', 'open']);
    });

    it('totals in exact cents and splits expenses across the three lines', async () => {
      mock.results.fin_income = [{ data: [{ amount: 0.1 }, { amount: 0.2 }] }];
      mock.results.fin_expenses = [
        {
          data: [
            { amount: 0.1, ministry_id: null, label: null }, // General
            { amount: 850, ministry_id: null, label: null }, // General
            { amount: 1200, ministry_id: null, label: 'Pastor' }, // Pastor
            { amount: 1200, ministry_id: MIN_A, label: 'Pastor' }, // label wins
            { amount: 40.5, ministry_id: MIN_A, label: null },
            { amount: 9.5, ministry_id: MIN_A, label: null },
            { amount: 7, ministry_id: MIN_B, label: null },
          ],
        },
      ];
      mock.results.fin_payables = [{ data: [{ amount: 99.99 }] }];

      const res = await fetchBooksSummary(AUG);
      if (!res.ok) throw new Error('expected a summary');
      const s = res.data;
      expect(s.incomeCents).toBe(30); // 0.1 + 0.2 exactly, not 0.30000000000000004
      expect(s.expensesCents).toBe(10 + 85000 + 120000 + 120000 + 4050 + 950 + 700);
      expect(s.balanceCents).toBe(s.incomeCents - s.expensesCents);
      expect(s.openPayablesCents).toBe(9999);
      expect(s.byAllocation).toEqual({
        generalCents: 85010,
        pastorCents: 240000,
        byMinistryCents: { [MIN_A]: 5000, [MIN_B]: 700 },
      });
    });

    it('a quiet month is a SUCCESS of zeros — zero is only ever a real zero', async () => {
      expect(await fetchBooksSummary(AUG)).toEqual({
        ok: true,
        data: {
          incomeCents: 0,
          expensesCents: 0,
          balanceCents: 0,
          openPayablesCents: 0,
          byAllocation: { generalCents: 0, pastorCents: 0, byMinistryCents: {} },
        },
      });
    });

    it('ONE failed read (payables) fails the summary — never "Por pagar: $0.00"', async () => {
      mock.results.fin_income = [{ data: [{ amount: 10 }] }];
      mock.results.fin_payables = [{ data: null, error: ERR }];
      const res = await fetchBooksSummary(AUG);
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchBooksSummary payables:', 'boom');
    });

    it('a failed expenses read fails it too — a balance without expenses is wrong money', async () => {
      mock.results.fin_income = [{ data: [{ amount: 10 }] }];
      mock.results.fin_expenses = [OFFLINE];
      expect(await fetchBooksSummary(AUG)).toEqual(
        failure('network', 'TypeError: Failed to fetch'),
      );
      expect(warn).toHaveBeenCalledWith(
        '[treasury] fetchBooksSummary expenses:',
        'TypeError: Failed to fetch',
      );
    });

    it('never throws when every read fails; the first failure is returned', async () => {
      mock.results.fin_income = [{ data: null, error: { message: 'income boom' } }];
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      mock.results.fin_payables = [{ data: null, error: ERR }];
      expect(await fetchBooksSummary(AUG)).toEqual(failure('unknown', 'income boom'));
    });
  });

  describe('fetchProjectTotals (project-treasury.js:130-141)', () => {
    it('buckets both tables by project id, zeroing the ones with no rows', async () => {
      mock.results.fin_income = [
        {
          data: [
            { project_id: 'p1', amount: 10 },
            { project_id: 'p1', amount: 5.25 },
          ],
        },
      ];
      mock.results.fin_expenses = [{ data: [{ project_id: 'p2', amount: 3.5 }] }];
      expect(await fetchProjectTotals(['p1', 'p2', 'p3'])).toEqual({
        ok: true,
        data: {
          byProject: {
            p1: { incomeCents: 1525, expensesCents: 0 },
            p2: { incomeCents: 0, expensesCents: 350 },
            p3: { incomeCents: 0, expensesCents: 0 },
          },
        },
      });
      expect(mock.args('select', 0)).toEqual(['project_id,amount']);
      expect(mock.args('in', 0)).toEqual(['project_id', ['p1', 'p2', 'p3']]);
      expect(mock.chain(0)).toEqual(['select', 'in']);
    });

    it('ignores a project id nobody asked for', async () => {
      mock.results.fin_income = [{ data: [{ project_id: 'other', amount: 10 }] }];
      expect(await fetchProjectTotals(['p1'])).toEqual({
        ok: true,
        data: { byProject: { p1: { incomeCents: 0, expensesCents: 0 } } },
      });
    });

    it('pushes a range down when given; no ids means no query', async () => {
      await fetchProjectTotals(['p1'], AUG);
      expect(mock.chain(0)).toEqual(['select', 'in', 'gte', 'lte']);
      expect(mock.chain(1)).toEqual(['select', 'in', 'gte', 'lte']);
      mock.reset();
      expect(await fetchProjectTotals([])).toEqual({ ok: true, data: { byProject: {} } });
      expect(mock.queries).toHaveLength(0);
    });

    it('a failed side fails the totals — never a card that reads $0.00 (PORT-DEBT S56)', async () => {
      mock.results.fin_income = [{ data: null, error: ERR }];
      mock.results.fin_expenses = [{ data: [{ project_id: 'p1', amount: 1 }] }];
      expect(await fetchProjectTotals(['p1'])).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjectTotals income:', 'boom');
    });
  });

  describe('fetchMinistryAllocationTotals (project-treasury.js:166-173)', () => {
    it('sums church-books expenses per ministry', async () => {
      mock.results.fin_expenses = [
        {
          data: [
            { ministry_id: MIN_A, amount: 12.5 },
            { ministry_id: MIN_A, amount: 7.5 },
            { ministry_id: null, amount: 100 },
          ],
        },
      ];
      expect(await fetchMinistryAllocationTotals([MIN_A, MIN_B])).toEqual({
        ok: true,
        data: { byMinistry: { [MIN_A]: 2000, [MIN_B]: 0 } },
      });
      expect(mock.chain()).toEqual(['select', 'is', 'in']);
      expect(mock.args('select')).toEqual(['ministry_id,amount']);
      expect(mock.args('is')).toEqual(['project_id', null]);
    });

    it('range pushdown, empty list, and an error that is never a zero budget', async () => {
      await fetchMinistryAllocationTotals([MIN_A], AUG);
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'gte', 'lte']);
      mock.reset();
      expect(await fetchMinistryAllocationTotals([])).toEqual({
        ok: true,
        data: { byMinistry: {} },
      });
      expect(mock.queries).toHaveLength(0);
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      const res = await fetchMinistryAllocationTotals([MIN_A]);
      expect(res).toEqual(failure('unknown', 'boom'));
      expect(res).not.toEqual({ ok: true, data: { byMinistry: { [MIN_A]: 0 } } });
      expect(warn).toHaveBeenCalledWith('[treasury] fetchMinistryAllocationTotals:', 'boom');
    });
  });

  describe('fetchReportEntries (report-builder.js:107-112)', () => {
    it('keeps the two legacy projections and orders oldest first', async () => {
      mock.results.fin_income = [
        { data: [{ occurred_on: '2026-03-01', source: 'Diezmos', fund: 'General', amount: 1.05 }] },
      ];
      mock.results.fin_expenses = [
        {
          data: [
            {
              occurred_on: '2026-03-02',
              payee: 'Arrendador',
              category: 'Renta',
              label: null,
              ministry_id: null,
              amount: 850,
            },
          ],
        },
      ];
      const res = await fetchReportEntries(YEAR);
      expect(mock.args('select', 0)).toEqual(['occurred_on,source,fund,amount']);
      expect(mock.args('select', 1)).toEqual([
        'occurred_on,payee,category,label,ministry_id,amount',
      ]);
      expect(mock.chain(0)).toEqual(['select', 'is', 'gte', 'lte', 'order']);
      expect(mock.query(0).calls[4].args).toEqual(['occurred_on']);
      expect(res).toEqual({
        ok: true,
        data: {
          income: [
            { occurred_on: '2026-03-01', source: 'Diezmos', fund: 'General', amountCents: 105 },
          ],
          expenses: [
            {
              occurred_on: '2026-03-02',
              payee: 'Arrendador',
              category: 'Renta',
              label: null,
              ministry_id: null,
              amountCents: 85000,
            },
          ],
        },
      });
    });

    it('a half-loaded report is an error — a PDF without its expenses is a wrong report', async () => {
      mock.results.fin_income = [
        { data: [{ occurred_on: '2026-03-01', source: 'Diezmos', fund: 'General', amount: 1 }] },
      ];
      mock.results.fin_expenses = [{ data: null, error: ERR }];
      expect(await fetchReportEntries(YEAR)).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchReportEntries expenses:', 'boom');
    });
  });
});
