// S21 — DataTable's sorting contract (src/lib/components/data-table.ts).
// The legacy special-events table tracked sortKey/sortDir that NOTHING read
// (PORT-DEBT S21 Appendix); these tests are the proof that the sort state now
// produces the render order.
import { describe, expect, it } from 'vitest';
import {
  ariaSort,
  compareValues,
  nextSort,
  sortRows,
  type DataTableColumn,
} from '$lib/components/data-table';

interface Row {
  id: string;
  payee: string;
  cents: number;
  due: string | null;
}

const ROWS: Row[] = [
  { id: 'a', payee: 'Zulema', cents: 2500, due: '2026-08-02' },
  { id: 'b', payee: 'ábaco', cents: -1000, due: null },
  { id: 'c', payee: 'Miguel', cents: 12000, due: '2026-01-15' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'payee', label: 'Beneficiario', sortable: true, value: (r) => r.payee },
  { key: 'cents', label: 'Monto', money: true, sortable: true, value: (r) => r.cents },
  { key: 'due', label: 'Vence', sortable: true, value: (r) => r.due },
  { key: 'actions', label: 'Acciones', hideLabel: true },
];

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('compareValues', () => {
  it('sorts numbers numerically, not lexically', () => {
    expect([12, 9, 100].sort(compareValues)).toEqual([9, 12, 100]);
  });

  it('sorts text with Spanish collation: accents fold, ñ keeps its own place', () => {
    expect(compareValues('ábaco', 'balde')).toBeLessThan(0);
    expect(compareValues('ábaco', 'Abril')).toBeLessThan(0); // accent-insensitive
    expect(compareValues('Ñandú', 'Nutria')).toBeGreaterThan(0); // ñ sorts after n
  });

  it('puts nullish and empty values LAST, whichever side they are on', () => {
    expect(compareValues(null, 'a')).toBeGreaterThan(0);
    expect(compareValues('a', null)).toBeLessThan(0);
    expect(compareValues('', undefined)).toBe(0);
  });
});

describe('sortRows', () => {
  it('returns input order when there is no sort key', () => {
    expect(ids(sortRows(ROWS, COLUMNS, undefined))).toEqual(['a', 'b', 'c']);
  });

  it('returns input order for an unknown key or a column with no comparator', () => {
    expect(ids(sortRows(ROWS, COLUMNS, 'nope'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortRows(ROWS, COLUMNS, 'actions'))).toEqual(['a', 'b', 'c']);
  });

  it('sorts by a text column both ways', () => {
    expect(ids(sortRows(ROWS, COLUMNS, 'payee', 'asc'))).toEqual(['b', 'c', 'a']);
    expect(ids(sortRows(ROWS, COLUMNS, 'payee', 'desc'))).toEqual(['a', 'c', 'b']);
  });

  it('sorts a money column by its integer cents, negatives first', () => {
    expect(ids(sortRows(ROWS, COLUMNS, 'cents', 'asc'))).toEqual(['b', 'a', 'c']);
    expect(ids(sortRows(ROWS, COLUMNS, 'cents', 'desc'))).toEqual(['c', 'a', 'b']);
  });

  it('keeps a null date last even when the direction flips', () => {
    expect(ids(sortRows(ROWS, COLUMNS, 'due', 'asc'))).toEqual(['c', 'a', 'b']);
    expect(ids(sortRows(ROWS, COLUMNS, 'due', 'desc'))).toEqual(['b', 'a', 'c']);
  });

  it('honours a custom comparator over `value`', () => {
    const byIdDesc: DataTableColumn<Row>[] = [
      { key: 'payee', label: 'x', compare: (a, b) => b.id.localeCompare(a.id) },
    ];
    expect(ids(sortRows(ROWS, byIdDesc, 'payee'))).toEqual(['c', 'b', 'a']);
  });

  it('never mutates the caller array', () => {
    const rows = [...ROWS];
    sortRows(rows, COLUMNS, 'payee', 'desc');
    expect(ids(rows)).toEqual(['a', 'b', 'c']);
  });

  it('is stable for equal values', () => {
    const tied: Row[] = [
      { id: '1', payee: 'Ana', cents: 0, due: null },
      { id: '2', payee: 'Ana', cents: 0, due: null },
      { id: '3', payee: 'Ana', cents: 0, due: null },
    ];
    expect(ids(sortRows(tied, COLUMNS, 'payee'))).toEqual(['1', '2', '3']);
  });
});

describe('nextSort / ariaSort', () => {
  it('a NEW column starts ascending', () => {
    expect(nextSort('cents', 'payee', 'desc')).toEqual({ sortKey: 'cents', sortDir: 'asc' });
  });

  it('the active column toggles direction', () => {
    expect(nextSort('payee', 'payee', 'asc')).toEqual({ sortKey: 'payee', sortDir: 'desc' });
    expect(nextSort('payee', 'payee', 'desc')).toEqual({ sortKey: 'payee', sortDir: 'asc' });
  });

  it('reports aria-sort only for the active column', () => {
    expect(ariaSort('payee', 'payee', 'asc')).toBe('ascending');
    expect(ariaSort('payee', 'payee', 'desc')).toBe('descending');
    expect(ariaSort('cents', 'payee', 'asc')).toBe('none');
    expect(ariaSort('payee', undefined, 'asc')).toBe('none');
  });
});
