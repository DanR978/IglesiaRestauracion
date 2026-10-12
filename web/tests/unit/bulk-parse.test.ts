// S56c — the CONTRACT for $lib/bulk-parse. There is no legacy oracle for bulk
// entry (new feature: VERIFICATION.md box #5 is N/A), so this suite IS the
// specification the BulkEntryGrid / PasteImport session is written against.
// Changing an expectation here is changing the feature.
//
// G-002: the date block runs under two timezones AND under a trap that makes
// constructing a Date throw — a parser that never touches the clock cannot
// move a diezmo to the wrong day for a viewer in Tokyo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FIELD_LABELS,
  PASTOR,
  PROJECT_CATEGORY,
  allocDecode,
  parseAmount,
  parseBulkPaste,
  parseDate,
  targetTable,
  toInsertPayload,
  type ParsedRow,
} from '$lib/bulk-parse';
import { sumC, toNumeric } from '$lib/money';

const lines = (...rows: string[]): string => rows.join('\n');

const BOM = '\ufeff';
const NBSP = '\u00a0';
const NARROW_NBSP = '\u202f';
const UNICODE_MINUS = '\u2212';

/* ── Delimiter sniffing ────────────────────────────────────────────────────── */

describe('delimiter sniffing', () => {
  it('reads a tab-separated Excel paste', () => {
    const r = parseBulkPaste(lines('01/02/2026\tDiezmos\t100', '02/02/2026\tOfrenda\t50'));
    expect(r.delimiter).toBe('\t');
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
  });

  it('reads a semicolon-separated paste', () => {
    const r = parseBulkPaste(lines('01/02/2026;Diezmos;1,50', '02/02/2026;Ofrenda;2,50'));
    expect(r.delimiter).toBe(';');
    expect(r.rows.map((x) => x.amountCents)).toEqual([150, 250]);
  });

  it('reads a comma-separated paste', () => {
    const r = parseBulkPaste(lines('01/02/2026,Diezmos,100', '02/02/2026,Ofrenda,50'));
    expect(r.delimiter).toBe(',');
    expect(r.rows).toHaveLength(2);
  });

  it('prefers tab over a comma that only lives inside a cell', () => {
    const r = parseBulkPaste('01/02/2026\tOfrenda, misionera\t100');
    expect(r.delimiter).toBe('\t');
    expect(r.rows[0].concept).toBe('Ofrenda, misionera');
  });

  it('prefers semicolon over a comma used as the decimal separator', () => {
    const r = parseBulkPaste(lines('01/02/2026;Diezmos;1.234,56', '02/02/2026;Ofrenda;2,50'));
    expect(r.delimiter).toBe(';');
    expect(r.rows.map((x) => x.amountCents)).toEqual([123456, 250]);
  });

  it('accepts a delimiter present on exactly 80 % of the non-empty lines', () => {
    const r = parseBulkPaste(
      lines(
        '01/02/2026;Diezmos;10',
        '02/02/2026;Ofrenda;20',
        '03/02/2026;Misiones;30',
        '04/02/2026;Primicias;40',
        'Total 100',
      ),
    );
    expect(r.delimiter).toBe(';');
    expect(r.rows).toHaveLength(4);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 5, field: 'row', text: 'Total 100' });
    expect(r.errors[0].message).toContain('1 columna;');
  });

  it('rejects a delimiter present on fewer than 80 % of the lines', () => {
    const r = parseBulkPaste(
      lines(
        '01/02/2026;Diezmos;10',
        '02/02/2026;Ofrenda;20',
        '03/02/2026;Misiones;30',
        'Total 60',
        'Sin separador',
      ),
    );
    expect(r.delimiter).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 1, field: 'row' });
    expect(r.errors[0].message).toMatch(/No se detectaron columnas/);
  });

  it('reports a single row error when nothing splits the block', () => {
    const r = parseBulkPaste(lines('solo texto', 'sin columnas'));
    expect(r).toMatchObject({ delimiter: null, columns: null, headerSkipped: false, rows: [] });
    expect(r.errors).toHaveLength(1);
  });
});

/* ── Quoted fields ─────────────────────────────────────────────────────────── */

describe('quoted CSV fields', () => {
  it('keeps a delimiter that sits inside quotes', () => {
    const r = parseBulkPaste(
      lines('01/02/2026,"Ofrenda, misionera",100', '02/02/2026,"Diezmo ""especial""",50'),
    );
    expect(r.delimiter).toBe(',');
    expect(r.rows.map((x) => x.concept)).toEqual(['Ofrenda, misionera', 'Diezmo "especial"']);
  });

  it('keeps a semicolon that sits inside quotes', () => {
    const r = parseBulkPaste(lines('01/02/2026;"Comida; bebida";10', '02/02/2026;Gasolina;20'));
    expect(r.rows.map((x) => x.concept)).toEqual(['Comida; bebida', 'Gasolina']);
  });

  it('keeps a tab that sits inside quotes', () => {
    const r = parseBulkPaste('01/02/2026\t"Ofrenda\tespecial"\t100');
    expect(r.rows[0].concept).toBe('Ofrenda\tespecial');
  });

  it('treats a quote in the middle of a cell as literal text', () => {
    const r = parseBulkPaste('01/02/2026,Ofrenda "especial",100');
    expect(r.rows[0].concept).toBe('Ofrenda "especial"');
  });
});

/* ── Line endings, blank lines, empty input ────────────────────────────────── */

describe('line handling', () => {
  it('treats CRLF, LF and CR identically', () => {
    const rows = ['01/02/2026\tDiezmos\t10', '02/02/2026\tOfrenda\t20'];
    const lf = parseBulkPaste(rows.join('\n'));
    expect(parseBulkPaste(rows.join('\r\n'))).toEqual(lf);
    expect(parseBulkPaste(rows.join('\r'))).toEqual(lf);
    expect(lf.rows).toHaveLength(2);
  });

  it('skips blank lines and keeps 1-based source line numbers', () => {
    const r = parseBulkPaste('\n\n01/02/2026\tDiezmos\t10\n   \n02/02/2026\tOfrenda\t20\n\n');
    expect(r.rows.map((x) => x.line)).toEqual([3, 5]);
  });

  it('strips a leading BOM', () => {
    const r = parseBulkPaste(BOM + '01/02/2026\tDiezmos\t10');
    expect(r.rows[0].occurredOn).toBe('2026-02-01');
  });

  it('returns an empty result for an empty paste', () => {
    const empty = { rows: [], errors: [], delimiter: null, columns: null, headerSkipped: false };
    expect(parseBulkPaste('')).toEqual(empty);
    expect(parseBulkPaste('   \n\n\t\n')).toEqual(empty);
  });
});

/* ── Header detection ──────────────────────────────────────────────────────── */

describe('header detection', () => {
  it('skips a Spanish header row', () => {
    const r = parseBulkPaste(lines('Fecha\tConcepto\tMonto', '01/02/2026\tDiezmos\t10'));
    expect(r.headerSkipped).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.line)).toEqual([2]);
  });

  it('skips a 4-column Spanish header row', () => {
    const r = parseBulkPaste(lines('Fecha;Concepto;Monto;Nota', '01/02/2026;Diezmos;10;Sobre 12'));
    expect(r).toMatchObject({ headerSkipped: true, columns: 4 });
    expect(r.rows[0].note).toBe('Sobre 12');
  });

  it('skips an English header row', () => {
    const r = parseBulkPaste(lines('Date,Description,Amount', '01/02/2026,Tithe,10'));
    expect(r.headerSkipped).toBe(true);
    expect(r.rows).toHaveLength(1);
  });

  it('keeps a first row that already holds a date and an amount', () => {
    const r = parseBulkPaste(lines('01/02/2026\tDiezmos\t10', '02/02/2026\tOfrenda\t20'));
    expect(r.headerSkipped).toBe(false);
    expect(r.rows).toHaveLength(2);
  });

  it('never treats a lone line as a header', () => {
    const r = parseBulkPaste('Fecha\tConcepto\tMonto');
    expect(r.headerSkipped).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.field)).toEqual(['date', 'amount']);
  });

  it('only ever considers the FIRST line — a later unreadable line is an error', () => {
    const r = parseBulkPaste(
      lines('01/02/2026\tDiezmos\t10', 'sin fecha\tni monto\ttexto', '03/02/2026\tOfrenda\t30'),
    );
    expect(r.headerSkipped).toBe(false);
    expect(r.rows.map((x) => x.line)).toEqual([1, 3]);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([
      [2, 'date'],
      [2, 'amount'],
    ]);
  });
});

/* ── Column mapping ────────────────────────────────────────────────────────── */

describe('column mapping', () => {
  it('maps 3 columns to fecha · concepto · monto', () => {
    const r = parseBulkPaste('01/02/2026\tDiezmos\t10');
    expect(r.columns).toBe(3);
    expect(r.rows[0]).toEqual({
      line: 1,
      occurredOn: '2026-02-01',
      concept: 'Diezmos',
      amountCents: 1000,
      note: null,
    });
  });

  it('maps 4 columns to fecha · concepto · monto · nota', () => {
    const r = parseBulkPaste('01/02/2026\tDiezmos\t10\tSobre #12');
    expect(r.columns).toBe(4);
    expect(r.rows[0].note).toBe('Sobre #12');
  });

  it('drops the trailing empty cells Excel adds for a whole-row selection', () => {
    const r = parseBulkPaste('01/02/2026\tDiezmos\t10\t\t\t');
    expect(r.columns).toBe(3);
    expect(r.rows[0].note).toBeNull();
  });

  it('handles ragged rows one line at a time', () => {
    const r = parseBulkPaste(
      lines(
        '01/02/2026\tDiezmos\t10\tSobre',
        '02/02/2026\tOfrenda\t20',
        '03/02/2026\tMisiones',
        '04/02/2026\tPrimicias\t40\tX\tY',
      ),
    );
    expect(r.columns).toBe(4);
    expect(r.rows.map((x) => x.note)).toEqual(['Sobre', null]);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([
      [3, 'row'],
      [4, 'row'],
    ]);
    expect(r.errors[0].message).toContain('2 columnas');
    expect(r.errors[1].message).toContain('5 columnas');
  });

  it('reports a missing concepto rather than writing a blank into the books', () => {
    const r = parseBulkPaste('01/02/2026\t\t10');
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([
      { line: 1, field: 'concept', message: 'Falta el concepto.', text: '01/02/2026\t\t10' },
    ]);
  });

  it('reports every broken column of a row', () => {
    const r = parseBulkPaste('ayer\t\tgratis');
    expect(r.errors.map((e) => e.field)).toEqual(['date', 'concept', 'amount']);
    expect(r.errors.map((e) => e.line)).toEqual([1, 1, 1]);
  });

  it('labels every field in Spanish for the UI', () => {
    expect(FIELD_LABELS).toEqual({
      date: 'Fecha',
      concept: 'Concepto',
      amount: 'Monto',
      note: 'Nota',
      row: 'Fila',
    });
  });
});

/* ── Dates (G-002: two timezones, and no Date at all) ──────────────────────── */

const GOOD_DATES: [string, string][] = [
  ['01/02/2026', '2026-02-01'],
  ['1/2/2026', '2026-02-01'],
  ['1/2/26', '2026-02-01'],
  ['01-02-2026', '2026-02-01'],
  ['1-2-26', '2026-02-01'],
  ['2026-02-01', '2026-02-01'],
  ['2026-2-1', '2026-02-01'],
  ['2026/02/01', '2026-02-01'],
  ['03/04/2026', '2026-04-03'],
  ['13/04/2026', '2026-04-13'],
  ['31/12/2099', '2099-12-31'],
  ['31/01/26', '2026-01-31'],
  ['29/02/2024', '2024-02-29'],
  ['28/02/2100', '2100-02-28'],
  ['  05/06/2026  ', '2026-06-05'],
];

const BAD_SHAPE_DATES = [
  '',
  'Fecha',
  'ayer',
  '1/2/2',
  '1/2/20267',
  '2026.02.01',
  '01 feb 2026',
  '2026-02-01T00:00',
  '01/02/2026 10:30',
  '1//2026',
];

const BAD_CALENDAR_DATES = [
  '04/13/2026',
  '31/02/2026',
  '29/02/2026',
  '29/02/2100',
  '00/01/2026',
  '01/00/2026',
  '32/01/2026',
  '2026-13-01',
  '2026-02-30',
  '0000-01-01',
];

const TIMEZONES = ['America/New_York', 'Asia/Tokyo'];

/** Run `fn` with a `Date` that explodes on use — the G-002 proof. */
function withoutDate<T>(fn: () => T): T {
  const RealDate = globalThis.Date;
  globalThis.Date = new Proxy(RealDate, {
    construct() {
      throw new Error('bulk-parse constructed a Date');
    },
    apply() {
      throw new Error('bulk-parse called Date()');
    },
  });
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

it('the Date trap the G-002 proof relies on really fires', () => {
  expect(() => withoutDate(() => new Date())).toThrow(/constructed a Date/);
  expect(() => withoutDate(() => Date())).toThrow(/called Date/);
  expect(withoutDate(() => 'pure')).toBe('pure');
});

it('the TZ switch the date suite relies on really takes effect', () => {
  const previous = process.env.TZ;
  try {
    const noon = Date.UTC(2026, 1, 1, 3, 0, 0);
    process.env.TZ = 'America/New_York';
    expect(new Date(noon).getDate()).toBe(31);
    process.env.TZ = 'Asia/Tokyo';
    expect(new Date(noon).getDate()).toBe(1);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

describe.each(TIMEZONES)('dates under TZ=%s', (tz) => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  it.each(GOOD_DATES)('parses %s as %s, day-first', (input, iso) => {
    expect(parseDate(input)).toEqual({ ok: true, iso });
  });

  it.each(BAD_SHAPE_DATES)('rejects the unreadable %j', (input) => {
    const r = parseDate(input);
    expect(r).toMatchObject({ ok: false, parsed: false });
    if (!r.ok) expect(r.message).toMatch(/Fecha inválida/);
  });

  it.each(BAD_CALENDAR_DATES)('rejects the impossible %s', (input) => {
    const r = parseDate(input);
    expect(r).toMatchObject({ ok: false, parsed: true });
    if (!r.ok) expect(r.message).toMatch(/no existe/);
  });

  it('never swaps day and month to rescue a US-style date', () => {
    expect(parseDate('04/13/2026').ok).toBe(false);
    expect(parseDate('12/11/2026')).toEqual({ ok: true, iso: '2026-11-12' });
  });

  it('reads two-digit years as 20yy', () => {
    expect(parseDate('01/01/00')).toEqual({ ok: true, iso: '2000-01-01' });
    expect(parseDate('31/12/99')).toEqual({ ok: true, iso: '2099-12-31' });
  });

  it('produces the same rows whatever the clock says', () => {
    const r = parseBulkPaste(lines('31/12/2026\tDiezmos\t10', '01/01/2027\tOfrenda\t20'));
    expect(r.rows.map((x) => x.occurredOn)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('parses without ever constructing a Date', () => {
    const r = withoutDate(() =>
      parseBulkPaste(lines('Fecha\tConcepto\tMonto', '29/02/2024\tDiezmos\t1.234,56')),
    );
    expect(r.rows).toEqual([
      { line: 2, occurredOn: '2024-02-29', concept: 'Diezmos', amountCents: 123456, note: null },
    ]);
  });
});

/* ── Money → integer cents (D-003) ─────────────────────────────────────────── */

const GOOD_AMOUNTS: [string, number][] = [
  ['100', 10000],
  ['0.01', 1],
  ['12.50', 1250],
  ['$12.50', 1250],
  ['$ 12.50', 1250],
  ['12,50', 1250],
  ['1.234,56', 123456],
  ['1,234.56', 123456],
  ['1.234.567,89', 123456789],
  ['1,234,567.89', 123456789],
  ['1,234', 123400],
  ['1,234,567', 123456700],
  ['1 234,56', 123456],
  [`1${NBSP}234,56`, 123456],
  [`1${NARROW_NBSP}234,56`, 123456],
  ['USD 45.00', 4500],
  ['45 usd', 4500],
  ['45 dólares', 4500],
  ['45 dolares', 4500],
  ['US$ 45', 4500],
  ['+2.50', 250],
  ['  75  ', 7500],
  ['.5', 50],
  ['0.005', 1],
  ['10.075', 1008],
];

const BAD_AMOUNTS: [string, RegExp][] = [
  ['12,5', /ambiguo/],
  ['1,2,3', /ambiguo/],
  [',50', /ambiguo/],
  ['-1', /no puede ser negativo/],
  ['-1.234,56', /no puede ser negativo/],
  [`${UNICODE_MINUS}1`, /no puede ser negativo/],
  ['0', /mayor que cero/],
  ['0.00', /mayor que cero/],
  ['-0.00', /mayor que cero/],
  ['0,00', /mayor que cero/],
  ['', /Monto inválido/],
  ['   ', /Monto inválido/],
  ['abc', /Monto inválido/],
  ['$', /Monto inválido/],
  ['.', /Monto inválido/],
  ['1.2.3', /Monto inválido/],
  ['(100)', /Monto inválido/],
  ['1e5', /Monto inválido/],
  ['10 pesos mexicanos', /Monto inválido/],
  ['99999999999999999999', /fuera de rango/],
];

describe('money → integer cents', () => {
  it.each(GOOD_AMOUNTS)('parses %j as %i cents', (input, cents) => {
    expect(parseAmount(input)).toEqual({ ok: true, cents });
  });

  it.each(BAD_AMOUNTS)('rejects %j', (input, message) => {
    const r = parseAmount(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(message);
  });

  it('resolves both/last-separator-wins the same way in both locales', () => {
    expect(parseAmount('1.234,56')).toEqual(parseAmount('1,234.56'));
  });

  it('reads a lone dot as the decimal point, even with three decimals', () => {
    // DOCUMENTED HAZARD (NOTES.md): "1.234" is $1.23, not $1,234 — a lone dot
    // is always the decimal point. The grid is the preview: the user sees the
    // formatted cents before saving.
    expect(parseAmount('1.234')).toEqual({ ok: true, cents: 123 });
  });

  it('carries the amount into the row as cents', () => {
    const r = parseBulkPaste('01/02/2026\tDiezmos\t$1,234.56');
    expect(r.rows[0].amountCents).toBe(123456);
  });

  it('totals a paste exactly, in cents', () => {
    const r = parseBulkPaste(
      lines('01/02/2026\tA\t0,10', '02/02/2026\tB\t0,20', '03/02/2026\tC\t333,33'),
    );
    expect(sumC(...r.rows.map((x) => x.amountCents))).toBe(33363);
  });
});

/* ── Robustness ────────────────────────────────────────────────────────────── */

describe('robustness', () => {
  it('never throws, whatever is pasted', () => {
    const nasty = [
      '',
      '   ',
      '\n\r\n\r',
      '\t'.repeat(50),
      '"'.repeat(50),
      ';;;;;;',
      ',,,,,,',
      ' \t\t',
      '😀\t😀\t😀',
      'a'.repeat(10_000),
      '01/02/2026\tX\t99999999999999999999',
      '01/02/2026\tX\t1,'.repeat(3),
      '"01/02/2026\tsin cierre\t10',
    ];
    for (const input of nasty) {
      expect(() => parseBulkPaste(input), JSON.stringify(input).slice(0, 40)).not.toThrow();
    }
  });

  it('reports an out-of-range amount instead of blowing up', () => {
    const r = parseBulkPaste('01/02/2026\tDiezmos\t99999999999999999999');
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatchObject({ line: 1, field: 'amount' });
    expect(r.errors[0].message).toMatch(/fuera de rango/);
  });

  it('parses a 200-row paste exactly', () => {
    const block = Array.from({ length: 200 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      return `${day}/03/2026\tOfrenda ${i + 1}\t${i + 1}.25`;
    }).join('\r\n');
    const r = parseBulkPaste(block);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(200);
    expect(r.rows[0]).toMatchObject({ line: 1, occurredOn: '2026-03-01', amountCents: 125 });
    expect(r.rows[199]).toMatchObject({ line: 200, occurredOn: '2026-03-04', amountCents: 20025 });
    // sum((i+1)*100 + 25) for i in 0..199 = 100*20100 + 25*200
    expect(sumC(...r.rows.map((x) => x.amountCents))).toBe(2_015_000);
  });

  it('matches the S56c smoke: 10 rows, one bad date, one bad amount', () => {
    const block = [
      'Fecha\tConcepto\tMonto',
      '01/03/2026\tDiezmos\t100.00',
      '02/03/2026\tOfrenda\t50,50',
      '03/03/2026\tMisiones\t$25',
      '31/02/2026\tPrimicias\t10.00',
      '05/03/2026\tOfrenda especial\t12,5',
      '06/03/2026\tDiezmos\t1.234,56',
      '07/03/2026\tOfrenda\t1,234.56',
      '08/03/2026\tMisiones\t0.75',
      '09/03/2026\tDiezmos\t80',
      '10/03/2026\tOfrenda\t20',
    ].join('\r\n');
    const r = parseBulkPaste(block);
    expect(r.headerSkipped).toBe(true);
    expect(r.rows).toHaveLength(8);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([
      [5, 'date'],
      [6, 'amount'],
    ]);
    expect(sumC(...r.rows.map((x) => x.amountCents))).toBe(
      10000 + 5050 + 2500 + 123456 + 123456 + 75 + 8000 + 2000,
    );
  });
});

/* ── Row → insert payload ──────────────────────────────────────────────────── */

const MINISTRY_ID = '4f0d6f3a-1c2b-4a55-9c1e-7d2a3b4c5d6e';
const PROJECT_ID = 'b7c9e1d2-3f44-4a66-8b12-0c9d8e7f6a5b';
const USER_ID = '9a8b7c6d-5e4f-4321-9876-543210fedcba';

const ROW: ParsedRow = {
  line: 2,
  occurredOn: '2026-02-01',
  concept: '  Diezmos  ',
  amountCents: 12345,
  note: '  Sobre 12  ',
};

const BLANK: ParsedRow = { ...ROW, concept: '   ', note: '   ' };

describe('allocDecode — the wizard allocation contract', () => {
  it('encodes General, a ministry and the pastor exactly as the legacy wizard', () => {
    expect(allocDecode('')).toEqual({ ministry_id: null, label: null });
    expect(allocDecode(MINISTRY_ID)).toEqual({ ministry_id: MINISTRY_ID, label: null });
    expect(allocDecode('pastor')).toEqual({ ministry_id: null, label: PASTOR });
    expect(PASTOR).toBe('Pastor');
  });
});

describe('toInsertPayload — income', () => {
  it('builds the WIZ.income field set', () => {
    const p = toInsertPayload(ROW, { mode: 'income', fund: '  Misiones  ', createdBy: USER_ID });
    expect(p).toEqual({
      occurred_on: '2026-02-01',
      source: 'Diezmos',
      fund: 'Misiones',
      amount: 12345,
      note: 'Sobre 12',
      created_by: USER_ID,
    });
    expect(Object.keys(p).sort()).toEqual(
      ['amount', 'created_by', 'fund', 'note', 'occurred_on', 'source'].sort(),
    );
  });

  it('defaults fund and created_by to null', () => {
    expect(toInsertPayload(ROW, { mode: 'income' })).toMatchObject({
      fund: null,
      created_by: null,
    });
    expect(toInsertPayload(ROW, { mode: 'income', fund: '   ' })).toMatchObject({ fund: null });
  });

  it('targets fin_income', () => {
    expect(targetTable({ mode: 'income' })).toBe('fin_income');
  });
});

describe('toInsertPayload — expense', () => {
  it('builds the WIZ.expenses field set with a General allocation', () => {
    const p = toInsertPayload(ROW, { mode: 'expense', alloc: '' });
    expect(p).toEqual({
      occurred_on: '2026-02-01',
      ministry_id: null,
      label: null,
      payee: 'Diezmos',
      category: null,
      amount: 12345,
      status: 'paid',
      note: 'Sobre 12',
      created_by: null,
    });
    expect(Object.keys(p).sort()).toEqual(
      [
        'amount',
        'category',
        'created_by',
        'label',
        'ministry_id',
        'note',
        'occurred_on',
        'payee',
        'status',
      ].sort(),
    );
  });

  it('encodes a ministry allocation', () => {
    expect(toInsertPayload(ROW, { mode: 'expense', alloc: MINISTRY_ID })).toMatchObject({
      ministry_id: MINISTRY_ID,
      label: null,
    });
  });

  it('encodes the pastor allocation as a label', () => {
    expect(toInsertPayload(ROW, { mode: 'expense', alloc: 'pastor' })).toMatchObject({
      ministry_id: null,
      label: 'Pastor',
    });
  });

  it('carries the batch category and status', () => {
    expect(
      toInsertPayload(ROW, {
        mode: 'expense',
        alloc: '',
        category: '  Alquiler  ',
        status: 'pending',
        createdBy: USER_ID,
      }),
    ).toMatchObject({ category: 'Alquiler', status: 'pending', created_by: USER_ID });
  });

  it('leaves an empty payee null, as the wizard does', () => {
    expect(toInsertPayload(BLANK, { mode: 'expense', alloc: '' })).toMatchObject({
      payee: null,
      note: null,
    });
  });

  it('targets fin_expenses', () => {
    expect(targetTable({ mode: 'expense', alloc: '' })).toBe('fin_expenses');
  });
});

describe('toInsertPayload — project', () => {
  it('builds the project income field set (addEntry)', () => {
    const p = toInsertPayload(ROW, { mode: 'project', kind: 'income', projectId: PROJECT_ID });
    expect(p).toEqual({
      occurred_on: '2026-02-01',
      source: 'Diezmos',
      fund: null,
      amount: 12345,
      note: 'Sobre 12',
      created_by: null,
      project_id: PROJECT_ID,
    });
  });

  it('falls back to "Ingreso" when a grid row has no concepto', () => {
    expect(
      toInsertPayload(BLANK, { mode: 'project', kind: 'income', projectId: PROJECT_ID }),
    ).toMatchObject({ source: 'Ingreso' });
  });

  it('builds the project expense field set, hardcoding Proyecto/paid', () => {
    const p = toInsertPayload(ROW, {
      mode: 'project',
      kind: 'expense',
      projectId: PROJECT_ID,
      createdBy: USER_ID,
    });
    expect(p).toEqual({
      occurred_on: '2026-02-01',
      ministry_id: null,
      label: null,
      payee: 'Diezmos',
      category: PROJECT_CATEGORY,
      amount: 12345,
      status: 'paid',
      note: 'Sobre 12',
      created_by: USER_ID,
      project_id: PROJECT_ID,
    });
    expect(PROJECT_CATEGORY).toBe('Proyecto');
  });

  it('targets the table its kind belongs to', () => {
    expect(targetTable({ mode: 'project', kind: 'income', projectId: PROJECT_ID })).toBe(
      'fin_income',
    );
    expect(targetTable({ mode: 'project', kind: 'expense', projectId: PROJECT_ID })).toBe(
      'fin_expenses',
    );
  });
});

describe('payload amounts stay in cents (D-003)', () => {
  it('hands the repo cents, which it converts with toNumeric before insert', () => {
    const p = toInsertPayload(ROW, { mode: 'income' });
    expect(p.amount).toBe(12345);
    expect(toNumeric(p.amount)).toBe(123.45);
  });

  it('round-trips a parsed paste into payloads without touching the date', () => {
    const r = parseBulkPaste(
      lines('Fecha;Concepto;Monto;Nota', '05/06/2026;Gasolina;1.234,56;Viaje'),
    );
    expect(r.rows).toHaveLength(1);
    expect(toInsertPayload(r.rows[0], { mode: 'expense', alloc: 'pastor' })).toEqual({
      occurred_on: '2026-06-05',
      ministry_id: null,
      label: 'Pastor',
      payee: 'Gasolina',
      category: null,
      amount: 123456,
      status: 'paid',
      note: 'Viaje',
      created_by: null,
    });
  });
});
