/* ============================================================================
 * web/src/lib/components/data-table.ts — DataTable column contract + sorting (S21)
 * ----------------------------------------------------------------------------
 * The pure half of DataTable.svelte: the column shape every admin table
 * declares, and the comparator that makes sort state ACTUALLY drive render
 * order. The legacy special-events table shipped a full sortable CSS surface
 * plus `sortKey`/`sortDir` module state that nothing ever read (PORT-DEBT S21
 * Appendix) — here the sorted array is what the component renders.
 *
 * Usage:
 *   import { sortRows, type DataTableColumn } from '$lib/components/data-table';
 * ========================================================================== */
import type { Snippet } from 'svelte';

export type CellAlign = 'start' | 'end';
export type SortDir = 'asc' | 'desc';

/** How a money cell is tinted. Consumes --money-* only (D-016). */
export type MoneyTone = 'pos' | 'neg' | 'warn' | 'none';

/** Row emphasis. `overdue` is the Por-pagar treatment; `muted` is a settled row. */
export type RowTone = 'default' | 'overdue' | 'muted';

/** What the table is currently showing. Every async view renders all three. */
export type DataTableState = 'ready' | 'loading' | 'error';

export interface DataTableColumn<T> {
  /** Stable identifier — also the sort key and the `data-label` source. */
  key: string;
  /** Header text, and the `label:` prefix each cell shows in card mode. */
  label: string;
  /** Right-align + tabular-nums. Implied by `money`. */
  numeric?: boolean;
  /**
   * `value(row)` returns INTEGER CENTS (D-003); the cell renders formatUSD and
   * takes its +/- tint from `moneyTone` (default: the sign).
   */
  money?: boolean;
  /** Override the default (numeric ? 'end' : 'start'). */
  align?: CellAlign;
  /** Per-row money tint, when the sign is not the meaning. */
  moneyTone?: (row: T) => MoneyTone;
  sortable?: boolean;
  /** Full comparator. Defaults to comparing `value(row)`. */
  compare?: (a: T, b: T) => number;
  /** Plain cell value — rendered when there is no `cell` snippet, and the default sort key. */
  value?: (row: T) => string | number | null | undefined;
  /** Rich cell content (badges, links, the row kebab). */
  cell?: Snippet<[T]>;
  /** Drop the `label:` prefix in card mode (the actions column). */
  hideLabel?: boolean;
}

/** Nullish sorts last in both directions; numbers numerically; text with es collation. */
export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

/**
 * A NEW array in sort order. Returns the input order untouched when there is
 * no sort key, when the key names no column, or when that column declares
 * neither `compare` nor `value`.
 */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly DataTableColumn<T>[],
  sortKey: string | undefined,
  sortDir: SortDir = 'asc',
): T[] {
  const source = [...rows];
  if (!sortKey) return source;

  const column = columns.find((c) => c.key === sortKey);
  if (!column) return source;

  const compare = column.compare ?? (column.value ? cmpByValue(column.value) : undefined);
  if (!compare) return source;

  const sign = sortDir === 'desc' ? -1 : 1;
  // Stable: Array#sort is stable per spec, so equal rows keep their input order.
  return source.sort((a, b) => sign * compare(a, b));
}

function cmpByValue<T>(value: NonNullable<DataTableColumn<T>['value']>) {
  return (a: T, b: T) => compareValues(value(a), value(b));
}

/** The next sort state for a header click: a new column starts ascending. */
export function nextSort(
  key: string,
  sortKey: string | undefined,
  sortDir: SortDir,
): { sortKey: string; sortDir: SortDir } {
  if (sortKey !== key) return { sortKey: key, sortDir: 'asc' };
  return { sortKey: key, sortDir: sortDir === 'asc' ? 'desc' : 'asc' };
}

/** `aria-sort` for a header cell. */
export function ariaSort(
  key: string,
  sortKey: string | undefined,
  sortDir: SortDir,
): 'ascending' | 'descending' | 'none' {
  if (sortKey !== key) return 'none';
  return sortDir === 'asc' ? 'ascending' : 'descending';
}
