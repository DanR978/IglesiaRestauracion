/* ============================================================================
 * web/src/lib/bulk-parse.ts — "pegar desde Excel" engine for Registro rápido (S56c)
 * ----------------------------------------------------------------------------
 * The PURE half of S56c: turn a block of text pasted out of Excel / Sheets /
 * a CSV into treasury rows, and turn a row into the exact insert payload the
 * legacy wizards produce. No DOM, no Supabase, no clock — every function here
 * is total and deterministic, which is what lets the Vitest suite next to it
 * (tests/unit/bulk-parse.test.ts) be the frozen contract the grid/paste UI is
 * written against.
 *
 * Three invariants carry the whole module:
 *
 *   G-002 — dates are `YYYY-MM-DD` STRINGS, built by hand from the digits the
 *           user typed. Nothing here constructs a `Date`, so nothing here can
 *           shift a day when the viewer is in Tokyo. Day-first ALWAYS
 *           (Spanish-locale paste): `03/04/2026` is the 3rd of April. An
 *           unreadable date is a per-row error — never a guess.
 *   D-003 — money is INTEGER CENTS, parsed through `$lib/money`'s `toCents`
 *           after locale normalization. `ParsedRow.amountCents` and the
 *           `amount` field of every payload below are cents.
 *           **The repo layer converts**: `insertIncomeBatch` /
 *           `insertExpenseBatch` (S52/S53) call `toNumeric(amount)`
 *           immediately before `.insert()`, because `fin_income.amount` and
 *           `fin_expenses.amount` are `numeric(12,2)` DOLLARS. Nothing between
 *           this module and that call may treat `amount` as dollars.
 *   never throws — `parseBulkPaste` returns `{ rows, errors }`; the only
 *           throwing dependency (`toCents`) is guarded at its single call site.
 *
 * The payload mappers live here on purpose: the wizard (single add) and the
 * bulk grid must not drift, so both call `toInsertPayload`. Field sets are
 * reproduced from legacy `js/pages/admin/treasury-tab.js` (`WIZ.income` /
 * `WIZ.expenses` `toPayload`, `allocDecode`) and
 * `js/pages/admin/project-treasury.js` (`addEntry`).
 *
 * Usage:
 *   import { parseBulkPaste, toInsertPayload, targetTable } from '$lib/bulk-parse';
 *
 *   const { rows, errors } = parseBulkPaste(textarea.value);
 *   const payloads = rows.map((r) => toInsertPayload(r, { mode: 'income', fund: 'General' }));
 *   await insertBatch(targetTable(ctx), payloads);   // repo converts cents → numeric
 * ========================================================================== */

import { pad2 } from '$lib/date';
import { toCents } from '$lib/money';

/* ── Public types ──────────────────────────────────────────────────────────── */

/** Sniffed delimiters, in priority order: Excel tab → semicolon → comma. */
export type Delimiter = '\t' | ';' | ',';

/** Which grid column an error belongs to; `row` means the whole line. */
export type ParseField = 'date' | 'concept' | 'amount' | 'note' | 'row';

export interface ParsedRow {
  /** 1-based line number in the pasted text (blank lines counted). */
  line: number;
  /** Calendar date as a plain `YYYY-MM-DD` string (G-002 — never a `Date`). */
  occurredOn: string;
  /** Free text: `source` for ingresos, `payee` for gastos. Never empty. */
  concept: string;
  /** Integer cents, always greater than zero (D-003). */
  amountCents: number;
  /** The optional 4th column, trimmed; `null` when absent or blank. */
  note: string | null;
}

export interface ParseError {
  /** 1-based line number in the pasted text. */
  line: number;
  field: ParseField;
  /** Spanish, ready to render beside the offending line. */
  message: string;
  /** The offending cell — or the whole line for `field: 'row'`. */
  text: string;
}

export interface ParseResult {
  /** Rows that passed every check, in paste order. Invalid rows are absent. */
  rows: ParsedRow[];
  /** Every problem found, in line order; a row can contribute more than one. */
  errors: ParseError[];
  /** The delimiter that won the sniff, or `null` when none reached 80 %. */
  delimiter: Delimiter | null;
  /** 3 (fecha·concepto·monto) or 4 (…·nota); `null` when nothing was usable. */
  columns: 3 | 4 | null;
  /** True when the first line was detected as a header and skipped. */
  headerSkipped: boolean;
}

/** Spanish labels for `ParseField` — the UI renders these, never its own. */
export const FIELD_LABELS: Record<ParseField, string> = {
  date: 'Fecha',
  concept: 'Concepto',
  amount: 'Monto',
  note: 'Nota',
  row: 'Fila',
};

/* ── Constants ─────────────────────────────────────────────────────────────── */

const DELIMITERS: readonly Delimiter[] = ['\t', ';', ','];

/** A delimiter wins only if it splits at least this share of the non-empty lines. */
const MIN_DELIMITER_PERCENT = 80;

/** A header is only looked for when the block has more than one line. */
const MIN_LINES_FOR_HEADER = 2;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MSG_NO_DELIMITER =
  'No se detectaron columnas. Pega directamente desde Excel, o separa los datos con tabulación, punto y coma o coma.';
const MSG_DATE_FORMAT =
  'Fecha inválida. Usa dd/mm/aaaa, d/m/aa, dd-mm-aaaa o aaaa-mm-dd (el día va primero).';
const MSG_DATE_CALENDAR = 'Esa fecha no existe. Recuerda que el día va primero (dd/mm/aaaa).';
const MSG_CONCEPT_EMPTY = 'Falta el concepto.';
const MSG_AMOUNT_FORMAT = 'Monto inválido. Usa 1.234,56 o 1,234.56.';
const MSG_AMOUNT_AMBIGUOUS =
  'Monto ambiguo: la coma puede ser decimal o de miles. Escribe dos decimales (12,50) o quítala.';
const MSG_AMOUNT_NEGATIVE = 'El monto no puede ser negativo.';
const MSG_AMOUNT_ZERO = 'El monto debe ser mayor que cero.';
const MSG_AMOUNT_RANGE = 'Monto fuera de rango.';

/* ── Line splitting ────────────────────────────────────────────────────────── */

/**
 * Split one line on `delim`, honouring `"quoted, fields"` and the CSV `""`
 * escape. A quote only opens a field (so `Ofrenda "especial"` keeps its
 * quotes); anything after the closing quote is appended verbatim.
 *
 * Quoting is resolved per PHYSICAL line: a newline inside a quoted cell ends
 * the record, exactly as the ≥80 %-of-lines delimiter sniff assumes. Excel
 * pastes of multi-line cells are therefore reported as ragged rows rather than
 * silently merged — see NOTES.md.
 */
function splitCells(line: string, delim: Delimiter): string[] {
  const cells: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === delim) {
      cells.push(field);
      field = '';
    } else field += ch;
  }
  cells.push(field);
  return cells;
}

/** Drop the empty cells Excel appends when whole rows/columns are selected. */
function trimTrailingEmpty(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === '') end--;
  return cells.slice(0, end);
}

/** First delimiter that splits ≥80 % of the non-empty lines; `null` if none. */
function sniffDelimiter(lines: string[]): Delimiter | null {
  for (const delim of DELIMITERS) {
    const hits = lines.filter((line) => splitCells(line, delim).length > 1).length;
    if (hits * 100 >= lines.length * MIN_DELIMITER_PERCENT) return delim;
  }
  return null;
}

/* ── Dates ─────────────────────────────────────────────────────────────────── */

/** `parsed` = the text was date-shaped but rejected; used for header sniffing. */
type DateResult = { ok: true; iso: string } | { ok: false; message: string; parsed: boolean };

const DATE_ISO_RE = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
const DATE_DMY_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/;

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const daysInMonth = (y: number, m: number): number =>
  m === 2 && isLeapYear(y) ? 29 : MONTH_DAYS[m - 1];

/**
 * Parse a pasted date into a `YYYY-MM-DD` string without ever building a
 * `Date` (G-002). Accepts `dd/mm/yyyy`, `d/m/yy` (→ 20yy), `dd-mm-yyyy` and
 * `yyyy-mm-dd`; `/` and `-` are interchangeable and a 4-digit first component
 * is what selects the ISO reading. Everything else — including `mm/dd/yyyy`,
 * which is indistinguishable from a day-first date — is an error, because the
 * congregation writes the day first and a silent swap misfiles money.
 */
export function parseDate(text: string): DateResult {
  const s = text.trim();
  let y: number;
  let m: number;
  let d: number;

  const iso = DATE_ISO_RE.exec(s);
  const dmy = iso ? null : DATE_DMY_RE.exec(s);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
  } else {
    return { ok: false, message: MSG_DATE_FORMAT, parsed: false };
  }

  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    return { ok: false, message: MSG_DATE_CALENDAR, parsed: true };
  }
  return { ok: true, iso: `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}` };
}

/* ── Money ─────────────────────────────────────────────────────────────────── */

/** `parsed` = the text was number-shaped but rejected; used for header sniffing. */
type AmountResult = { ok: true; cents: number } | { ok: false; message: string; parsed: boolean };

const CURRENCY_WORDS_RE = /us\$|usd|dlls|dls|d[oó]lar(?:es)?/gi;
const DECIMAL_COMMA_RE = /^\d+,\d{2}$/;
const THOUSANDS_COMMA_RE = /^\d{1,3}(?:,\d{3})+$/;

/**
 * Parse a pasted amount into integer cents (D-003).
 *
 * Normalization: U+2212 becomes a plain minus, every whitespace character
 * (NBSP and the narrow NBSP included — Excel uses them as thousands
 * separators) is removed, then `$`, `USD`, `dólares` and friends are stripped.
 *
 * Separators, in the order the church actually pastes them:
 *   - BOTH `.` and `,` present → the LAST one is the decimal, the other is
 *     thousands: `1.234,56` and `1,234.56` are both 123456 cents.
 *   - a lone `,` with exactly two trailing digits → decimal comma (`12,50`).
 *   - a lone `,` in `1,234` / `1,234,567` grouping → thousands.
 *   - anything else with a lone `,` (`12,5`) is AMBIGUOUS — 12,50 or 125? —
 *     and becomes a row error rather than a guess.
 *   - a lone `.` is the decimal point, which is what `toCents` already does.
 *
 * Zero and negative amounts are row errors: `fin_income`/`fin_expenses` both
 * carry `check (amount >= 0)`, and a $0 line in the books is a typo.
 */
export function parseAmount(text: string): AmountResult {
  let s = text
    .replace(/\u2212/g, '-')
    .replace(/\s/g, '')
    .replace(CURRENCY_WORDS_RE, '')
    .replace(/\$/g, '');

  let sign = 1;
  if (s.startsWith('-') || s.startsWith('+')) {
    if (s.startsWith('-')) sign = -1;
    s = s.slice(1);
  }

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) {
    return { ok: false, message: MSG_AMOUNT_FORMAT, parsed: false };
  }

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = s.split(thousands).join('').split(decimal).join('.');
  } else if (lastComma >= 0) {
    if (DECIMAL_COMMA_RE.test(s)) normalized = s.split(',').join('.');
    else if (THOUSANDS_COMMA_RE.test(s)) normalized = s.split(',').join('');
    else return { ok: false, message: MSG_AMOUNT_AMBIGUOUS, parsed: true };
  } else {
    normalized = s;
  }

  let cents: number;
  try {
    cents = toCents(normalized) * sign;
  } catch (err) {
    return err instanceof RangeError
      ? { ok: false, message: MSG_AMOUNT_RANGE, parsed: true }
      : { ok: false, message: MSG_AMOUNT_FORMAT, parsed: false };
  }

  if (cents < 0) return { ok: false, message: MSG_AMOUNT_NEGATIVE, parsed: true };
  if (cents === 0) return { ok: false, message: MSG_AMOUNT_ZERO, parsed: true };
  return { ok: true, cents };
}

/* ── Header detection ──────────────────────────────────────────────────────── */

const looksLikeDate = (cell: string): boolean => {
  const r = parseDate(cell);
  return r.ok || r.parsed;
};

const looksLikeAmount = (cell: string): boolean => {
  const r = parseAmount(cell);
  return r.ok || r.parsed;
};

/**
 * A header is a first line whose cells hold NO date-shaped and NO
 * number-shaped value (`Fecha · Concepto · Monto`). Only the first line is
 * ever considered — a later unreadable line is a broken row, not a header.
 */
const isHeaderRow = (cells: string[]): boolean =>
  !cells.some(looksLikeDate) && !cells.some(looksLikeAmount);

/* ── The parser ────────────────────────────────────────────────────────────── */

const columnCountMessage = (n: number): string =>
  `La fila tiene ${n} ${n === 1 ? 'columna' : 'columnas'}; se esperan 3 (fecha, concepto, monto) o 4 (con nota).`;

/**
 * Parse a pasted Excel/CSV block into treasury rows.
 *
 * Column mapping is positional: 3 columns are `fecha · concepto · monto`,
 * 4 add `nota`. Rows are independent — one broken line never costs you the
 * other 199 — and every problem is reported with its line, its column and the
 * offending text so the UI can list it beside the paste.
 *
 * Total by construction: it never throws, whatever the input.
 */
export function parseBulkPaste(input: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  const lines = input.replace(/^\ufeff/, '').split(/\r\n|\n|\r/);
  const nonEmpty = lines
    .map((text, i) => ({ line: i + 1, text }))
    .filter((l) => l.text.trim() !== '');
  if (nonEmpty.length === 0) {
    return { rows, errors, delimiter: null, columns: null, headerSkipped: false };
  }

  const delimiter = sniffDelimiter(nonEmpty.map((l) => l.text));
  if (!delimiter) {
    // One error for the block, not 200 identical ones: the whole paste is
    // unusable, and the UI shows the reason beside its first line.
    errors.push({
      line: nonEmpty[0].line,
      field: 'row',
      message: MSG_NO_DELIMITER,
      text: nonEmpty[0].text.trim(),
    });
    return { rows, errors, delimiter: null, columns: null, headerSkipped: false };
  }

  const records = nonEmpty.map((l) => ({
    line: l.line,
    text: l.text.trim(),
    cells: trimTrailingEmpty(splitCells(l.text, delimiter).map((c) => c.trim())),
  }));

  const headerSkipped = records.length >= MIN_LINES_FOR_HEADER && isHeaderRow(records[0].cells);
  const data = headerSkipped ? records.slice(1) : records;

  for (const rec of data) {
    const { cells } = rec;
    if (cells.length < 3 || cells.length > 4) {
      errors.push({
        line: rec.line,
        field: 'row',
        message: columnCountMessage(cells.length),
        text: rec.text,
      });
      continue;
    }

    const date = parseDate(cells[0]);
    const concept = cells[1];
    const amount = parseAmount(cells[2]);
    if (!date.ok || concept === '' || !amount.ok) {
      if (!date.ok) {
        errors.push({ line: rec.line, field: 'date', message: date.message, text: cells[0] });
      }
      if (concept === '') {
        errors.push({
          line: rec.line,
          field: 'concept',
          message: MSG_CONCEPT_EMPTY,
          text: rec.text,
        });
      }
      if (!amount.ok) {
        errors.push({ line: rec.line, field: 'amount', message: amount.message, text: cells[2] });
      }
      continue;
    }

    rows.push({
      line: rec.line,
      occurredOn: date.iso,
      concept,
      amountCents: amount.cents,
      note: cells.length === 4 ? cells[3] : null,
    });
  }

  const widths = data.map((r) => r.cells.length).filter((n) => n === 3 || n === 4);
  const columns = widths.length === 0 ? null : widths.includes(4) ? 4 : 3;
  return { rows, errors, delimiter, columns, headerSkipped };
}

/* ── Row → insert payload ──────────────────────────────────────────────────────
 * Field sets reproduced from the legacy wizards so a bulk save and a single
 * add are indistinguishable in the DB. `amount` is CENTS here; the repo calls
 * `toNumeric()` on it at the `.insert()` boundary (D-003).
 * ------------------------------------------------------------------------- */

/** `fin_expenses.label` for a pastor-allocated expense (legacy `PASTOR`). */
export const PASTOR = 'Pastor';

/** `fin_expenses.category` every project entry is filed under (legacy `addEntry`). */
export const PROJECT_CATEGORY = 'Proyecto';

/**
 * Decode the wizard's allocation choice — `''` General, a ministry uuid, or
 * `'pastor'` — into the `ministry_id` / `label` pair the row stores.
 * Port of `treasury-tab.js` `allocDecode`; S53 must IMPORT this, never fork it.
 */
export function allocDecode(choice: string): {
  ministry_id: string | null;
  label: string | null;
} {
  if (choice === 'pastor') return { ministry_id: null, label: PASTOR };
  if (choice) return { ministry_id: choice, label: null };
  return { ministry_id: null, label: null };
}

interface BaseContext {
  /** `auth.users.id` of the signed-in user; `null` when unknown. */
  createdBy?: string | null;
}

/** Church books → `fin_income`. */
export interface IncomeContext extends BaseContext {
  mode: 'income';
  /** Free-text fund for the whole batch (`fin_income.fund`). */
  fund?: string | null;
}

/** Church books → `fin_expenses`. */
export interface ExpenseContext extends BaseContext {
  mode: 'expense';
  /** Allocation choice for the whole batch: `''` | ministry uuid | `'pastor'`. */
  alloc: string;
  /** Expense category name for the whole batch (`fin_expenses.category`). */
  category?: string | null;
  status?: 'paid' | 'pending';
}

/** Ministry / personal project quick-add → either table, scoped to a project. */
export interface ProjectContext extends BaseContext {
  mode: 'project';
  kind: 'income' | 'expense';
  projectId: string;
}

export type BulkContext = IncomeContext | ExpenseContext | ProjectContext;

/** `fin_income` insert — `amount` in CENTS (repo converts). */
export interface IncomeInsert {
  occurred_on: string;
  source: string;
  fund: string | null;
  amount: number;
  note: string | null;
  created_by: string | null;
}

/** `fin_expenses` insert — `amount` in CENTS (repo converts). */
export interface ExpenseInsert {
  occurred_on: string;
  ministry_id: string | null;
  label: string | null;
  payee: string | null;
  category: string | null;
  amount: number;
  status: 'paid' | 'pending';
  note: string | null;
  created_by: string | null;
}

export type ProjectIncomeInsert = IncomeInsert & { project_id: string };
export type ProjectExpenseInsert = ExpenseInsert & { project_id: string };

export type BulkInsert = IncomeInsert | ExpenseInsert | ProjectIncomeInsert | ProjectExpenseInsert;

/** The table a context inserts into — pair it with `toInsertPayload`. */
export function targetTable(ctx: BulkContext): 'fin_income' | 'fin_expenses' {
  const kind = ctx.mode === 'project' ? ctx.kind : ctx.mode;
  return kind === 'income' ? 'fin_income' : 'fin_expenses';
}

export function toInsertPayload(row: ParsedRow, ctx: IncomeContext): IncomeInsert;
export function toInsertPayload(row: ParsedRow, ctx: ExpenseContext): ExpenseInsert;
export function toInsertPayload(
  row: ParsedRow,
  ctx: ProjectContext,
): ProjectIncomeInsert | ProjectExpenseInsert;
export function toInsertPayload(row: ParsedRow, ctx: BulkContext): BulkInsert;
/**
 * Build the insert payload for one row. Pure — unlike the legacy wizards it
 * does NOT fall back to `todayISO()` for a missing date: the grid supplies
 * today as the default value of an empty date cell, so the clock stays in the
 * UI where a test can pin it (G-002). Every other default matches
 * `WIZ.income` / `WIZ.expenses` `toPayload` and `project-treasury.js addEntry`.
 */
export function toInsertPayload(row: ParsedRow, ctx: BulkContext): BulkInsert {
  const note = row.note?.trim() || null;
  const created_by = ctx.createdBy ?? null;
  const concept = row.concept.trim();

  switch (ctx.mode) {
    case 'income':
      return {
        occurred_on: row.occurredOn,
        source: concept,
        fund: ctx.fund?.trim() || null,
        amount: row.amountCents,
        note,
        created_by,
      };
    case 'expense': {
      const alloc = allocDecode(ctx.alloc ?? '');
      return {
        occurred_on: row.occurredOn,
        ministry_id: alloc.ministry_id,
        label: alloc.label,
        payee: concept || null,
        category: ctx.category?.trim() || null,
        amount: row.amountCents,
        status: ctx.status ?? 'paid',
        note,
        created_by,
      };
    }
    case 'project':
      return ctx.kind === 'income'
        ? {
            occurred_on: row.occurredOn,
            source: concept || 'Ingreso',
            fund: null,
            amount: row.amountCents,
            note,
            created_by,
            project_id: ctx.projectId,
          }
        : {
            occurred_on: row.occurredOn,
            ministry_id: null,
            label: null,
            payee: concept || null,
            category: PROJECT_CATEGORY,
            amount: row.amountCents,
            status: 'paid',
            note,
            created_by,
            project_id: ctx.projectId,
          };
  }
}
