// S52 — repos/treasury/shared: the pure contracts every treasury session sits
// on. Cents exactness (D-003), the allocation encode/decode ported from
// treasury-tab.js:38-44, the `auto:` note tags, and TZ-free date ranges
// (G-002). No Supabase client is involved — this module must not need one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toNumeric } from '$lib/money';
import {
  AUTO_NOTE_PREFIX,
  PASTOR_LABEL,
  allocDecode,
  allocEncode,
  amountToCents,
  centsError,
  cleanNote,
  isAutoNote,
  lastDayOfMonth,
  monthKeyOf,
  monthRange,
  payableNoteTag,
  recurringNoteTag,
  sumCents,
  toExpenseEntry,
  toFundEntry,
  toIncomeEntry,
  toPayableEntry,
  toRecurringEntry,
  writeFail,
  writeOk,
  yearRange,
} from '$lib/repos/treasury/shared';

describe('repos/treasury/shared — money at the boundary (D-003)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  // `numeric(12,2)` values that break naive float handling, plus the edges of
  // what the column can hold.
  const AWKWARD_CENTS = [
    0, 1, 5, 9, 10, 11, 25, 99, 100, 101, 105, 110, 999, 1000, 1005, 1234, 4999, 5000, 5001, 12345,
    99999, 100000, 123456, 1000000, 199999999, 999999999999,
  ];

  it('cents → numeric → cents is the identity for awkward amounts', () => {
    for (const cents of AWKWARD_CENTS) {
      expect(amountToCents(toNumeric(cents), 'test')).toBe(cents);
      expect(amountToCents(String(toNumeric(cents)), 'test')).toBe(cents);
    }
  });

  it('round-trips negative amounts too (fin_funds.opening_balance has no CHECK)', () => {
    for (const cents of AWKWARD_CENTS.filter((c) => c !== 0)) {
      expect(amountToCents(toNumeric(-cents), 'test')).toBe(-cents);
    }
    // -0 normalises to 0, which is what a `numeric` column stores.
    expect(amountToCents(toNumeric(-0), 'test')).toBe(0);
  });

  it('maps the exact dollar strings PostgREST can return for numeric(12,2)', () => {
    expect(amountToCents(1234.56, 'test')).toBe(123456);
    expect(amountToCents('1234.56', 'test')).toBe(123456);
    expect(amountToCents('0.10', 'test')).toBe(10);
    expect(amountToCents('850.00', 'test')).toBe(85000);
    expect(amountToCents(0, 'test')).toBe(0);
  });

  it('never throws on a broken amount — warns and counts as zero', () => {
    expect(amountToCents(null, 'toIncomeEntry')).toBe(0);
    expect(amountToCents(undefined, 'toIncomeEntry')).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(amountToCents('nope', 'toIncomeEntry')).toBe(0);
    expect(amountToCents(Number.NaN, 'toIncomeEntry')).toBe(0);
    expect(warn).toHaveBeenCalledWith('[treasury] toIncomeEntry:', 'importe no numérico: "nope"');
  });

  it('sums exactly where the legacy float sum drifted', () => {
    // Legacy: 0.1 + 0.2 + 0.3 !== 0.6 in IEEE754.
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(toNumeric(sumCents([10, 20, 30]))).toBe(0.6);
    expect(sumCents([])).toBe(0);
    // A year of small offerings must not drift.
    expect(sumCents(Array.from({ length: 5000 }, () => 1))).toBe(5000);
  });

  it('centsError guards the DB CHECK constraints with Spanish copy', () => {
    expect(centsError(0)).toBeNull();
    expect(centsError(123456)).toBeNull();
    expect(centsError(-1)).toBe('El monto no puede ser negativo.');
    expect(centsError(-1, { allowNegative: true })).toBeNull();
    expect(centsError(10.5)).toBe('El monto debe ser una cantidad válida.');
    expect(centsError(Number.NaN)).toBe('El monto debe ser una cantidad válida.');
    expect(centsError(Number.POSITIVE_INFINITY)).toBe('El monto debe ser una cantidad válida.');
    expect(centsError(-5, { field: 'saldo inicial' })).toBe(
      'El saldo inicial no puede ser negativo.',
    );
  });

  it('row mappers replace `amount` with `amountCents` and keep every other column', () => {
    const income = toIncomeEntry({
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
    });
    expect(income.amountCents).toBe(123456);
    expect(income).not.toHaveProperty('amount');
    expect(income.source).toBe('Diezmos');

    expect(
      toExpenseEntry({
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
      }).amountCents,
    ).toBe(85000);

    expect(
      toPayableEntry({
        id: 'p1',
        creditor: 'Proveedor',
        amount: 99.99,
        due_on: null,
        ministry_id: null,
        status: 'open',
        note: null,
        created_by: null,
        created_at: '2026-08-01T12:00:00Z',
        paid_at: null,
      }).amountCents,
    ).toBe(9999);

    expect(
      toRecurringEntry({
        id: 'r1',
        payee: 'Pastor',
        ministry_id: null,
        category: null,
        amount: 1200,
        frequency: 'monthly',
        day_of_month: 5,
        active: true,
        note: null,
        label: 'Pastor',
        created_by: null,
        created_at: '2026-01-01T12:00:00Z',
      }).amountCents,
    ).toBe(120000);

    const fund = toFundEntry({
      id: 'f1',
      name: 'Misiones',
      restricted: true,
      opening_balance: -12.34,
      sort: 0,
      archived: false,
      created_at: '2026-01-01T12:00:00Z',
    });
    expect(fund.openingBalanceCents).toBe(-1234);
    expect(fund).not.toHaveProperty('opening_balance');
    expect(fund.restricted).toBe(true);
  });

  it('writeOk / writeFail produce the WriteResult branches (and writeFail warns)', () => {
    expect(writeOk({ id: 'x' })).toEqual({ ok: true, data: { id: 'x' } });
    expect(writeFail('createIncome', 'boom')).toEqual({ ok: false, error: 'boom' });
    expect(warn).toHaveBeenCalledWith('[treasury] createIncome:', 'boom');
  });
});

describe('repos/treasury/shared — date ranges (G-002)', () => {
  it('monthRange covers the whole month, inclusive', () => {
    expect(monthRange('2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthRange('2026-04')).toEqual({ start: '2026-04-01', end: '2026-04-30' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(monthRange('2026-01')).toEqual({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('lastDayOfMonth gets the leap-year rule right without a Date', () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2025, 2)).toBe(28);
    expect(lastDayOfMonth(2000, 2)).toBe(29); // divisible by 400
    expect(lastDayOfMonth(1900, 2)).toBe(28); // divisible by 100, not 400
    expect(lastDayOfMonth(2100, 2)).toBe(28);
    expect([1, 3, 5, 7, 8, 10, 12].map((m) => lastDayOfMonth(2026, m))).toEqual([
      31, 31, 31, 31, 31, 31, 31,
    ]);
    expect([4, 6, 9, 11].map((m) => lastDayOfMonth(2026, m))).toEqual([30, 30, 30, 30]);
  });

  it('is timezone-independent — the helper must never reach for `new Date`', () => {
    const original = process.env.TZ;
    const seen = new Set<string>();
    for (const tz of ['America/New_York', 'Asia/Tokyo', 'UTC', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      seen.add(JSON.stringify([monthRange('2026-03'), monthRange('2024-02'), yearRange(2026)]));
    }
    process.env.TZ = original;
    expect(seen.size).toBe(1);
  });

  it('rejects a malformed month key rather than guessing a range', () => {
    for (const bad of ['2026-13', '2026-00', '26-08', '2026-8', '2026-08-01', '', 'agosto']) {
      expect(() => monthRange(bad)).toThrow(RangeError);
    }
  });

  it('yearRange covers Jan 1 → Dec 31 and rejects a non-year', () => {
    expect(yearRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(yearRange('2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(() => yearRange(26)).toThrow(RangeError);
    expect(() => yearRange('20261')).toThrow(RangeError);
  });

  it('monthKeyOf slices the month out of an ISO date', () => {
    expect(monthKeyOf('2026-08-31')).toBe('2026-08');
    expect(monthKeyOf('2026-01-01T00:00:00Z')).toBe('2026-01');
    expect(monthKeyOf('')).toBe('');
  });
});

describe('repos/treasury/shared — the allocation contract', () => {
  const MIN = '11111111-2222-3333-4444-555555555555';

  it('decodes the three wizard choices exactly as treasury-tab.js:38', () => {
    expect(allocDecode('')).toEqual({ ministry_id: null, label: null });
    expect(allocDecode('pastor')).toEqual({ ministry_id: null, label: PASTOR_LABEL });
    expect(allocDecode(MIN)).toEqual({ ministry_id: MIN, label: null });
  });

  it('encodes label-first, exactly as treasury-tab.js:43', () => {
    expect(allocEncode({ ministry_id: null, label: PASTOR_LABEL })).toBe('pastor');
    expect(allocEncode({ ministry_id: MIN, label: null })).toBe(MIN);
    expect(allocEncode({ ministry_id: null, label: null })).toBe('');
    expect(allocEncode({})).toBe('');
    expect(allocEncode(null)).toBe('');
    expect(allocEncode(undefined)).toBe('');
    // A row carrying BOTH still encodes as the pastor line.
    expect(allocEncode({ ministry_id: MIN, label: PASTOR_LABEL })).toBe('pastor');
    // The label match is case-sensitive, like the legacy `=== 'Pastor'`.
    expect(allocEncode({ ministry_id: null, label: 'pastor' })).toBe('');
  });

  it('round-trips every canonical allocation', () => {
    for (const row of [
      { ministry_id: null, label: null },
      { ministry_id: null, label: PASTOR_LABEL },
      { ministry_id: MIN, label: null },
    ]) {
      expect(allocDecode(allocEncode(row))).toEqual(row);
    }
  });
});

describe('repos/treasury/shared — the `auto:` note tags', () => {
  it('builds the two linkage tags legacy writes', () => {
    expect(recurringNoteTag('r1', '2026-08')).toBe('auto:recurring:r1:2026-08');
    expect(payableNoteTag('p1')).toBe('auto:payable:p1');
    expect(AUTO_NOTE_PREFIX).toBe('auto:');
  });

  it('isAutoNote / cleanNote hide generated notes and keep human ones', () => {
    const cases: [string | null | undefined, boolean, string][] = [
      [null, false, ''],
      [undefined, false, ''],
      ['', false, ''],
      ['auto:recurring:r1:2026-08', true, ''],
      ['auto:payable:p1', true, ''],
      ['auto:', true, ''],
      ['auto', false, 'auto'], // no colon → a human note
      [' auto:x', false, ' auto:x'], // leading space → not a tag
      ['Pagar al músico', false, 'Pagar al músico'],
    ];
    for (const [note, expectedAuto, expectedClean] of cases) {
      expect(isAutoNote(note)).toBe(expectedAuto);
      expect(cleanNote(note)).toBe(expectedClean);
    }
  });
});
