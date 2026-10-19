// S52 — repos/treasury/summary: the narrow aggregate projections. Asserts the
// literal select strings (G-024), the pushed-down range (PERF-07) and exact
// cent totals (D-003). S22b — aggregates are ALL OR NOTHING: if any of their
// parallel reads fails the result is `{ ok: false }`, never totals computed
// from the reads that happened to succeed — legacy's "$0.00 because the query
// errored" (PORT-DEBT S53/S56) cannot be represented any more. They also read
// EVERY row, one `.range()` page of 1000 at a time under an `id` order, so
// PostgREST's max-rows can't truncate a total (G-033), and signed out they
// are `auth`, never a "$0.00" made of RLS-empty reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/db/client.js', () => import('./mock-client'));

import { mock } from './mock-client';
import { NO_SESSION, OFFLINE, SIGNED_OUT, failure } from './results';
import { describeSessionGate } from './session-gate';
import * as summary from '#lib/repos/treasury/summary.js';
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

/** A full page — PostgREST's max-rows (1000) — so the repo must ask for the next. */
const fullPage = <Row>(row: Row): Row[] => Array.from({ length: 1000 }, () => row);
/** The `.range()` of every query issued against `table`, in order. */
const rangesOf = (table: string) =>
  mock.queries
    .filter((q) => q.table === table)
    .map((q) => q.calls.find((c) => c.method === 'range')?.args);
const TOO_MANY_ROWS = {
  ok: false,
  error: {
    kind: 'unknown',
    message: 'Hay demasiados movimientos para calcular este total. Acota el rango de fechas.',
    detail: 'more than 50000 rows',
  },
};

describe('repos/treasury/summary', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  describe('fetchBooksSummary (treasury-tab.js:118-137)', () => {
    it('runs the three legacy queries with their literal projections, paged by id', async () => {
      await fetchBooksSummary(AUG);
      expect(mock.queries.map((q) => q.table)).toEqual([
        'fin_income',
        'fin_expenses',
        'fin_payables',
      ]);
      expect(mock.chain(0)).toEqual(['select', 'is', 'gte', 'lte', 'order', 'range']);
      expect(mock.args('select', 0)).toEqual(['amount']);
      expect(mock.args('is', 0)).toEqual(['project_id', null]);
      expect(mock.args('gte', 0)).toEqual(['occurred_on', '2026-08-01']);
      expect(mock.args('lte', 0)).toEqual(['occurred_on', '2026-08-31']);
      expect(mock.args('order', 0)).toEqual(['id']);
      expect(mock.args('range', 0)).toEqual([0, 999]);

      expect(mock.chain(1)).toEqual(['select', 'is', 'gte', 'lte', 'order', 'range']);
      expect(mock.args('select', 1)).toEqual(['amount,ministry_id,label']);

      // Payables are ALL-TIME open, deliberately un-ranged (legacy :121).
      expect(mock.chain(2)).toEqual(['select', 'eq', 'order', 'range']);
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

    it('signed out is auth before any query — never "$0.00" made of RLS-empty reads', async () => {
      mock.session = SIGNED_OUT;
      const res = await fetchBooksSummary(AUG);
      expect(res).toEqual(NO_SESSION);
      expect(res.ok).toBe(false);
      expect(mock.queries).toEqual([]);
    });

    // A zero is a quiet month — or a live session RLS filtered down to nothing
    // (no finance tab): both are an empty 200, and this layer cannot tell them
    // apart. The session check rules out the dead session; RLS is the boundary
    // (D-002) and the view decides who reaches the books.
    it('signed in, a quiet (or RLS-filtered) month is a SUCCESS of zeros', async () => {
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

    it('G-033: a full page asks for the next one — totals past PostgREST max-rows', async () => {
      mock.results.fin_income = [{ data: fullPage({ amount: 1 }) }, { data: [{ amount: 0.5 }] }];
      mock.results.fin_expenses = [
        { data: fullPage({ amount: 2, ministry_id: null, label: null }) },
        { data: [{ amount: 7, ministry_id: MIN_A, label: null }] },
      ];
      mock.results.fin_payables = [{ data: fullPage({ amount: 0.01 }) }, { data: [] }];

      expect(await fetchBooksSummary(AUG)).toEqual({
        ok: true,
        data: {
          incomeCents: 100050,
          expensesCents: 200700,
          balanceCents: 100050 - 200700,
          openPayablesCents: 1000,
          byAllocation: { generalCents: 200000, pastorCents: 0, byMinistryCents: { [MIN_A]: 700 } },
        },
      });
      for (const table of ['fin_income', 'fin_expenses', 'fin_payables']) {
        expect(rangesOf(table)).toEqual([
          [0, 999],
          [1000, 1999],
        ]);
      }
      // Every page repeats the filters and the total order.
      const secondIncomePage = mock.queries.filter((q) => q.table === 'fin_income')[1];
      expect(secondIncomePage.calls.map((c) => [c.method, c.args])).toEqual([
        ['select', ['amount']],
        ['is', ['project_id', null]],
        ['gte', ['occurred_on', '2026-08-01']],
        ['lte', ['occurred_on', '2026-08-31']],
        ['order', ['id']],
        ['range', [1000, 1999]],
      ]);
    });

    it('G-033: a failed second page fails the summary — never the first 1000 rows', async () => {
      mock.results.fin_income = [{ data: fullPage({ amount: 1 }) }, { data: null, error: ERR }];
      expect(await fetchBooksSummary(AUG)).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchBooksSummary income:', 'boom');
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
      expect(mock.chain(0)).toEqual(['select', 'in', 'order', 'range']);
      expect(mock.args('order', 0)).toEqual(['id']);
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
      expect(mock.chain(0)).toEqual(['select', 'in', 'gte', 'lte', 'order', 'range']);
      expect(mock.chain(1)).toEqual(['select', 'in', 'gte', 'lte', 'order', 'range']);
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

    it('G-033: sums every page of both sides', async () => {
      mock.results.fin_income = [
        { data: fullPage({ project_id: 'p1', amount: 1 }) },
        { data: [{ project_id: 'p1', amount: 2 }] },
      ];
      mock.results.fin_expenses = [
        { data: fullPage({ project_id: 'p2', amount: 0.5 }) },
        { data: [{ project_id: 'p2', amount: 0.25 }] },
      ];
      expect(await fetchProjectTotals(['p1', 'p2'], AUG)).toEqual({
        ok: true,
        data: {
          byProject: {
            p1: { incomeCents: 100200, expensesCents: 0 },
            p2: { incomeCents: 0, expensesCents: 50025 },
          },
        },
      });
      expect(rangesOf('fin_income')).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
      expect(rangesOf('fin_expenses')).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
    });

    it('G-033: a failed later page fails the totals', async () => {
      mock.results.fin_expenses = [
        { data: fullPage({ project_id: 'p1', amount: 1 }) },
        { data: null, error: ERR },
      ];
      expect(await fetchProjectTotals(['p1'])).toEqual(failure('unknown', 'boom'));
      expect(warn).toHaveBeenCalledWith('[treasury] fetchProjectTotals expenses:', 'boom');
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
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'order', 'range']);
      expect(mock.args('select')).toEqual(['ministry_id,amount']);
      expect(mock.args('is')).toEqual(['project_id', null]);
      expect(mock.args('order')).toEqual(['id']);
    });

    it('range pushdown, empty list, and an error that is never a zero budget', async () => {
      await fetchMinistryAllocationTotals([MIN_A], AUG);
      expect(mock.chain()).toEqual(['select', 'is', 'in', 'gte', 'lte', 'order', 'range']);
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

    it('G-033: sums every page', async () => {
      mock.results.fin_expenses = [
        { data: fullPage({ ministry_id: MIN_A, amount: 1 }) },
        { data: [{ ministry_id: MIN_B, amount: 3 }] },
      ];
      expect(await fetchMinistryAllocationTotals([MIN_A, MIN_B])).toEqual({
        ok: true,
        data: { byMinistry: { [MIN_A]: 100000, [MIN_B]: 300 } },
      });
      expect(rangesOf('fin_expenses')).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
    });

    it('G-033: 50 pages is the most a total reads — the 50th may be short', async () => {
      const page = fullPage({ ministry_id: MIN_A, amount: 1 });
      mock.results.fin_expenses = [
        ...Array.from({ length: 49 }, () => ({ data: page })),
        { data: page.slice(1) },
      ];
      expect(await fetchMinistryAllocationTotals([MIN_A])).toEqual({
        ok: true,
        data: { byMinistry: { [MIN_A]: 4999900 } },
      });
      expect(mock.queries).toHaveLength(50);
      expect(rangesOf('fin_expenses').at(-1)).toEqual([49000, 49999]);
    });

    it('G-033: a 50th page that comes back full is refused, never truncated', async () => {
      const page = fullPage({ ministry_id: MIN_A, amount: 1 });
      mock.results.fin_expenses = Array.from({ length: 51 }, () => ({ data: page }));
      expect(await fetchMinistryAllocationTotals([MIN_A])).toEqual(TOO_MANY_ROWS);
      expect(mock.queries).toHaveLength(50);
      expect(warn).toHaveBeenCalledWith(
        '[treasury] fetchMinistryAllocationTotals:',
        'more than 50000 rows',
      );
    });
  });

  describe('fetchReportEntries (report-builder.js:107-112)', () => {
    it('keeps the two legacy projections and orders oldest first, id last', async () => {
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
      expect(mock.chain(0)).toEqual(['select', 'is', 'gte', 'lte', 'order', 'order', 'range']);
      expect(mock.query(0).calls[4].args).toEqual(['occurred_on']);
      expect(mock.query(0).calls[5].args).toEqual(['id']);
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

    it('G-033: every page lands in the report, in page order', async () => {
      const row = { occurred_on: '2026-03-01', source: 'Diezmos', fund: 'General', amount: 1 };
      mock.results.fin_income = [
        { data: fullPage(row) },
        { data: [{ ...row, occurred_on: '2026-12-31', amount: 2 }] },
      ];
      const res = await fetchReportEntries(YEAR);
      if (!res.ok) throw new Error('expected a report');
      expect(res.data.income).toHaveLength(1001);
      expect(res.data.income.at(-1)).toEqual({
        occurred_on: '2026-12-31',
        source: 'Diezmos',
        fund: 'General',
        amountCents: 200,
      });
      expect(rangesOf('fin_income')).toEqual([
        [0, 999],
        [1000, 1999],
      ]);
    });

    it('G-033: a failed later page fails the report — never a PDF of the first 1000 rows', async () => {
      const row = { occurred_on: '2026-03-01', source: 'Diezmos', fund: 'General', amount: 1 };
      mock.results.fin_income = [{ data: fullPage(row) }, OFFLINE];
      expect(await fetchReportEntries(YEAR)).toEqual(
        failure('network', 'TypeError: Failed to fetch'),
      );
    });
  });

  // RLS: every `fin_*` policy is `to authenticated`.
  describeSessionGate(summary, '[treasury]', {
    staffOnly: {
      fetchBooksSummary: () => fetchBooksSummary(AUG),
      fetchProjectTotals: () => fetchProjectTotals(['p1']),
      fetchMinistryAllocationTotals: () => fetchMinistryAllocationTotals([MIN_A]),
      fetchReportEntries: () => fetchReportEntries(YEAR),
    },
  });
});
