/* ============================================================================
 * web/src/lib/repos/treasury/shared.ts — treasury domain rules + repo plumbing
 * ----------------------------------------------------------------------------
 * The pure half of the treasury repo (S52). It imports NO Supabase client, so
 * UI, PDF builders and pure test suites can use it standalone.
 *
 * Three things live here, and they are the contracts the whole treasury rests
 * on — S53 (books), S54 (recurrentes/por pagar/notas), S55 (reportes),
 * S56 (ministry/project), S56b (recibos), S56c (registro rápido):
 *
 *   1. MONEY AT THE BOUNDARY (D-003). The DB column is `numeric(12,2)` dollars;
 *      everything above this file speaks INTEGER CENTS. `toEntry` mappers
 *      convert on read, `toNumeric` converts on write, and no caller ever sees
 *      a float. Legacy summed floats (`treasury-tab.js:25`,
 *      `report-builder.js:131-134`) — that divergence is approved by D-003.
 *   2. THE ALLOCATION CONTRACT, ported verbatim from `treasury-tab.js:38-44`:
 *      General → `ministry_id` and `label` both null · a ministry → its uuid ·
 *      the pastor stipend → `label = 'Pastor'`. Encode is label-first.
 *   3. THE `auto:` NOTE TAGS. `fin_expenses.note` doubles as a linkage key for
 *      rows the app generates: `auto:recurring:<id>:<YYYY-MM>` (a materialized
 *      recurring payment) and `auto:payable:<id>` (a payable mirrored into the
 *      books). `cleanNote()` is what keeps them off the screen.
 *
 * Usage:
 *   import { monthRange, allocDecode, cleanNote } from '$lib/repos/treasury';
 *   const rows = await fetchExpenses(monthRange('2026-08'));
 * ========================================================================== */

import { sumC, toCents } from '$lib/money';
import type { Tables, TablesInsert, TablesUpdate } from '$lib/db/database.types';

/* ── Repo plumbing ─────────────────────────────────────────────────────── */

/** Log tag shared by every treasury repo module. */
export const TAG = '[treasury]';

/** Read-path failure: warn, then the caller returns a safe empty. */
export function warnRead(fn: string, message: string): void {
  console.warn(`${TAG} ${fn}:`, message);
}

/** Write-path failure: warn and return the `WriteResult` error branch. */
export function writeFail(fn: string, message: string): { ok: false; error: string } {
  console.warn(`${TAG} ${fn}:`, message);
  return { ok: false, error: message };
}

/** Write-path success branch. */
export function writeOk<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/* ── Row aliases (generated types are the only source of truth) ────────── */

export type IncomeRow = Tables<'fin_income'>;
export type ExpenseRow = Tables<'fin_expenses'>;
export type PayableRow = Tables<'fin_payables'>;
export type RecurringRow = Tables<'fin_recurring'>;
export type ProjectRow = Tables<'fin_projects'>;
export type FundRow = Tables<'fin_funds'>;
export type IncomeCategoryRow = Tables<'fin_income_categories'>;
export type ExpenseCategoryRow = Tables<'fin_expense_categories'>;
export type NoteRow = Tables<'fin_notes'>;

/**
 * The `CHECK` constraints the baseline puts on the status/frequency columns
 * (`00000000000000_baseline.sql:797,874,911`). The generated types widen them
 * to `string`; these narrow them back for the UI and document the DB rule.
 */
export type ExpenseStatus = 'paid' | 'pending';
export type PayableStatus = 'open' | 'paid';
export type RecurringFrequency = 'monthly' | 'weekly' | 'yearly';

/* ── Money at the boundary (D-003) ─────────────────────────────────────── */

/**
 * `numeric` dollars → integer cents, defensively: a read must never throw
 * (repo contract), so an unparseable amount warns and counts as 0 rather than
 * taking the whole view down. The DB column is `not null numeric(12,2)`, so
 * this only fires on a schema drift or a hand-broken row.
 */
export function amountToCents(value: number | string | null | undefined, where: string): number {
  if (value === null || value === undefined) return 0;
  try {
    return toCents(value);
  } catch {
    warnRead(where, `importe no numérico: ${JSON.stringify(value)}`);
    return 0;
  }
}

/**
 * Validate a cents amount before a write. Returns `null` when valid, else a
 * Spanish message ready for `toast(error, 'error')` — cheaper and clearer than
 * letting the `amount >= 0` CHECK come back as a raw Postgres string.
 */
export function centsError(
  cents: number,
  { field = 'monto', allowNegative = false }: { field?: string; allowNegative?: boolean } = {},
): string | null {
  if (!Number.isSafeInteger(cents)) return `El ${field} debe ser una cantidad válida.`;
  if (!allowNegative && cents < 0) return `El ${field} no puede ser negativo.`;
  return null;
}

/** Exact integer total. Loops rather than spreading so a year of rows is safe. */
export function sumCents(values: number[]): number {
  let total = 0;
  for (const value of values) total = sumC(total, value);
  return total;
}

/* ── Read projections: rows with `amount` replaced by `amountCents` ────── */

export type IncomeEntry = Omit<IncomeRow, 'amount'> & { amountCents: number };
export type ExpenseEntry = Omit<ExpenseRow, 'amount'> & { amountCents: number };
export type PayableEntry = Omit<PayableRow, 'amount'> & { amountCents: number };
export type RecurringEntry = Omit<RecurringRow, 'amount'> & { amountCents: number };
export type FundEntry = Omit<FundRow, 'opening_balance'> & { openingBalanceCents: number };

export function toIncomeEntry(row: IncomeRow): IncomeEntry {
  const { amount, ...rest } = row;
  return { ...rest, amountCents: amountToCents(amount, 'toIncomeEntry') };
}

export function toExpenseEntry(row: ExpenseRow): ExpenseEntry {
  const { amount, ...rest } = row;
  return { ...rest, amountCents: amountToCents(amount, 'toExpenseEntry') };
}

export function toPayableEntry(row: PayableRow): PayableEntry {
  const { amount, ...rest } = row;
  return { ...rest, amountCents: amountToCents(amount, 'toPayableEntry') };
}

export function toRecurringEntry(row: RecurringRow): RecurringEntry {
  const { amount, ...rest } = row;
  return { ...rest, amountCents: amountToCents(amount, 'toRecurringEntry') };
}

export function toFundEntry(row: FundRow): FundEntry {
  const { opening_balance, ...rest } = row;
  return {
    ...rest,
    openingBalanceCents: amountToCents(opening_balance, 'toFundEntry'),
  };
}

/* ── Write payloads: the generated Insert/Update with cents swapped in ─── */

export type IncomeInsert = Omit<TablesInsert<'fin_income'>, 'amount'> & { amountCents: number };
export type IncomeUpdate = Omit<TablesUpdate<'fin_income'>, 'amount'> & { amountCents?: number };
export type ExpenseInsert = Omit<TablesInsert<'fin_expenses'>, 'amount'> & { amountCents: number };
export type ExpenseUpdate = Omit<TablesUpdate<'fin_expenses'>, 'amount'> & { amountCents?: number };
export type PayableInsert = Omit<TablesInsert<'fin_payables'>, 'amount'> & { amountCents: number };
export type PayableUpdate = Omit<TablesUpdate<'fin_payables'>, 'amount'> & { amountCents?: number };
export type RecurringInsert = Omit<TablesInsert<'fin_recurring'>, 'amount'> & {
  amountCents: number;
};
export type RecurringUpdate = Omit<TablesUpdate<'fin_recurring'>, 'amount'> & {
  amountCents?: number;
};
export type FundInsert = Omit<TablesInsert<'fin_funds'>, 'opening_balance'> & {
  openingBalanceCents?: number;
};
export type FundUpdate = Omit<TablesUpdate<'fin_funds'>, 'opening_balance'> & {
  openingBalanceCents?: number;
};
export type IncomeCategoryInsert = TablesInsert<'fin_income_categories'>;
export type IncomeCategoryUpdate = TablesUpdate<'fin_income_categories'>;
export type ExpenseCategoryInsert = TablesInsert<'fin_expense_categories'>;
export type ExpenseCategoryUpdate = TablesUpdate<'fin_expense_categories'>;
export type NoteInsert = TablesInsert<'fin_notes'>;
export type NoteUpdate = TablesUpdate<'fin_notes'>;
export type ProjectInsert = TablesInsert<'fin_projects'>;
export type ProjectUpdate = TablesUpdate<'fin_projects'>;

/* ── Date ranges (G-002: calendar dates stay YYYY-MM-DD strings) ───────── */

/** An inclusive `occurred_on` window: both ends are `YYYY-MM-DD`. */
export type DateRange = { start: string; end: string };

const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Days in a calendar month. Deliberately arithmetic, not `new Date(y, m, 0)`:
 * the legacy helper built a local Date to read `.getDate()`, which makes the
 * result depend on the runtime timezone (G-002).
 * @param month 1-indexed.
 */
export function lastDayOfMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return MONTH_LENGTHS[month - 1];
}

/**
 * `'2026-08'` → `{ start: '2026-08-01', end: '2026-08-31' }`.
 * @throws RangeError on a malformed month key — a silently wrong range would
 *         quietly mis-total a ledger, which is the one failure mode worse than
 *         a crash (same reasoning as `money.ts`).
 */
export function monthRange(monthKey: string): DateRange {
  const m = MONTH_KEY_RE.exec(monthKey);
  if (!m) throw new RangeError(`monthRange: not a YYYY-MM month key: ${JSON.stringify(monthKey)}`);
  const last = lastDayOfMonth(Number(m[1]), Number(m[2]));
  return { start: `${monthKey}-01`, end: `${monthKey}-${String(last).padStart(2, '0')}` };
}

/**
 * `2026` → `{ start: '2026-01-01', end: '2026-12-31' }`.
 * @throws RangeError on a non 4-digit year.
 */
export function yearRange(year: number | string): DateRange {
  const y = String(year);
  if (!YEAR_RE.test(y))
    throw new RangeError(`yearRange: not a 4-digit year: ${JSON.stringify(year)}`);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** The `YYYY-MM` a `YYYY-MM-DD` date falls in. */
export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/* ── The allocation contract (treasury-tab.js:29-44) ───────────────────── */

/** The `label` value that marks the pastor stipend line. */
export const PASTOR_LABEL = 'Pastor';

/**
 * The wizard's radio value: `''` = General · `'pastor'` = the pastor line ·
 * anything else = a ministry uuid.
 */
export type AllocationChoice = string;

/** The two `fin_expenses` / `fin_recurring` columns the choice writes. */
export type Allocation = { ministry_id: string | null; label: string | null };

/** Choice → columns. Port of `allocDecode` (`treasury-tab.js:38`). */
export function allocDecode(choice: AllocationChoice): Allocation {
  if (choice === 'pastor') return { ministry_id: null, label: PASTOR_LABEL };
  if (choice) return { ministry_id: choice, label: null };
  return { ministry_id: null, label: null };
}

/**
 * Columns → choice. Port of `allocEncode` (`treasury-tab.js:43`), including
 * its label-first precedence: a row carrying `label = 'Pastor'` encodes as
 * `'pastor'` even when it also has a `ministry_id`.
 */
export function allocEncode(
  row: { ministry_id?: string | null; label?: string | null } | null | undefined,
): AllocationChoice {
  return row?.label === PASTOR_LABEL ? 'pastor' : (row?.ministry_id ?? '');
}

/* ── `auto:` note tags (treasury-tab.js:27, 378, 431) ──────────────────── */

/** Every app-generated `fin_expenses.note` starts with this. */
export const AUTO_NOTE_PREFIX = 'auto:';

/** The idempotency key of a materialized recurring payment for one month. */
export function recurringNoteTag(recurringId: string, monthKey: string): string {
  return `${AUTO_NOTE_PREFIX}recurring:${recurringId}:${monthKey}`;
}

/** The idempotency key of a payable mirrored into `fin_expenses`. */
export function payableNoteTag(payableId: string): string {
  return `${AUTO_NOTE_PREFIX}payable:${payableId}`;
}

/** True when the note is an internal linkage tag rather than a human note. */
export function isAutoNote(note: string | null | undefined): boolean {
  return !!note && String(note).startsWith(AUTO_NOTE_PREFIX);
}

/**
 * The note as a human should see it — `''` for an empty note and for every
 * `auto:` tag. Port of `cleanNote` (`treasury-tab.js:27`).
 */
export function cleanNote(note: string | null | undefined): string {
  return note && !isAutoNote(note) ? note : '';
}
