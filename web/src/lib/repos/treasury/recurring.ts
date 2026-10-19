/* ============================================================================
 * web/src/lib/repos/treasury/recurring.ts — `fin_recurring` + materialization
 * ----------------------------------------------------------------------------
 * Recurring payments and the job that turns them into real `fin_expenses`
 * rows for a month. Ported from `treasury-tab.js` `renderRecurring` (:361) and
 * `ensureRecurringForMonth` (:377-399).
 *
 * Idempotency is carried by the note tag `auto:recurring:<id>:<YYYY-MM>`: the
 * month's already-generated tags are read first and every recurring payment
 * that already has one is skipped. `cleanNote()` keeps the tag off the screen.
 *
 * Two deliberate divergences from legacy, both recorded in the S52 NOTES:
 *   · legacy ignored both read errors; a failed tag read left `have` empty and
 *     would DUPLICATE the month's rows. Here either read failing aborts with a
 *     `WriteResult` error — idempotence beats "best effort" on a ledger.
 *   · legacy compared against `new Date()`; `today` is an injectable parameter
 *     so the guard is deterministic in tests and during prerender.
 *
 * Legacy semantics that are PRESERVED on purpose (the fixes belong to S54, see
 * PORT-DEBT): only `frequency = 'monthly'` is ever materialized, so weekly and
 * yearly rows generate nothing; and the wizard never edits `active`.
 *
 * Usage:
 *   import { fetchRecurring, materializeRecurring } from '#lib/repos/treasury/index.js';
 *   const res = await materializeRecurring('2026-08', { createdBy: userId });
 *   if (res.ok && res.data.inserted) refreshExpenses();
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { toNumeric } from '#lib/money.js';
import { todayISO } from '#lib/date.js';
import type { TablesInsert, TablesUpdate } from '#lib/db/database.types.js';
import { fail, invalid, noRows, ok } from '../errors';
import type { ReadResult, WriteResult } from '../types';
import {
  AUTO_NOTE_PREFIX,
  TAG,
  centsError,
  lastDayOfMonth,
  monthKeyOf,
  monthRange,
  recurringNoteTag,
  toRecurringEntry,
  type DateRange,
  type RecurringEntry,
  type RecurringInsert,
  type RecurringUpdate,
} from './shared';

/** The `note` prefix every materialized row carries. */
const RECURRING_NOTE_LIKE = `${AUTO_NOTE_PREFIX}recurring:%`;

/** The category a materialized row falls back to (`treasury-tab.js:396`). */
const RECURRING_CATEGORY = 'Recurrente';

/* ── Reads ─────────────────────────────────────────────────────────────── */

/** Every recurring payment, active first then by payee (`treasury-tab.js:361`). */
export async function fetchRecurring(): Promise<ReadResult<RecurringEntry[]>> {
  const { data, error, status } = await supabase
    .from('fin_recurring')
    .select('*')
    .order('active', { ascending: false })
    .order('payee');
  if (error) return fail(TAG, 'fetchRecurring', error, status);
  return ok((data ?? []).map(toRecurringEntry));
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createRecurring(
  input: RecurringInsert,
): Promise<WriteResult<RecurringEntry>> {
  const bad = centsError(input.amountCents);
  if (bad) return invalid(bad);
  const { amountCents, ...rest } = input;
  const row: TablesInsert<'fin_recurring'> = { ...rest, amount: toNumeric(amountCents) };
  const { data, error, status } = await supabase
    .from('fin_recurring')
    .insert(row)
    .select()
    .single();
  if (error) return fail(TAG, 'createRecurring', error, status);
  return ok(toRecurringEntry(data));
}

export async function updateRecurring(
  id: string,
  patch: RecurringUpdate,
): Promise<WriteResult<RecurringEntry>> {
  if (!id) return invalid('Falta el identificador del pago recurrente.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_recurring'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return invalid(bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error, status } = await supabase
    .from('fin_recurring')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updateRecurring', error, status);
  return ok(toRecurringEntry(data));
}

export async function deleteRecurring(id: string): Promise<WriteResult> {
  if (!id) return invalid('Falta el identificador del pago recurrente.');
  const { error, status, count } = await supabase
    .from('fin_recurring')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deleteRecurring', error, status);
  if (!count) return noRows(TAG, 'deleteRecurring');
  return ok(undefined);
}

/* ── Materialization ───────────────────────────────────────────────────── */

export type MaterializeOptions = {
  /** `auth.uid()` of the operator, stamped on the generated rows. */
  createdBy?: string | null;
  /** Local "today" as `YYYY-MM-DD`; injectable so the guard is deterministic. */
  today?: string;
};

/**
 * Create the missing `fin_expenses` rows for every ACTIVE MONTHLY recurring
 * payment in `monthKey`. Idempotent: a payment that already has its
 * `auto:recurring:<id>:<month>` row in that month is skipped, and a future
 * month (or a payment created after the month) generates nothing.
 *
 * @returns the number of rows inserted; `0` is a normal, successful outcome.
 */
export async function materializeRecurring(
  monthKey: string,
  { createdBy = null, today = todayISO() }: MaterializeOptions = {},
): Promise<WriteResult<{ inserted: number }>> {
  let range: DateRange;
  try {
    range = monthRange(monthKey);
  } catch {
    return invalid('Mes inválido.');
  }
  // Never generate rows for a month that has not started (`treasury-tab.js:378`).
  if (monthKey > monthKeyOf(today)) return ok({ inserted: 0 });

  const [recRes, tagRes] = await Promise.all([
    supabase.from('fin_recurring').select('*').eq('active', true).eq('frequency', 'monthly'),
    supabase
      .from('fin_expenses')
      .select('note')
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end)
      .like('note', RECURRING_NOTE_LIKE),
  ]);
  if (recRes.error) {
    return fail(TAG, 'materializeRecurring recurring', recRes.error, recRes.status);
  }
  // Without the existing tags we cannot tell what is already there, and
  // guessing would double-post the month.
  if (tagRes.error) return fail(TAG, 'materializeRecurring tags', tagRes.error, tagRes.status);

  const recurring = recRes.data ?? [];
  if (!recurring.length) return ok({ inserted: 0 });

  const existing = new Set((tagRes.data ?? []).map((r) => r.note));
  const [year, month] = monthKey.split('-').map(Number);
  const last = lastDayOfMonth(year, month);

  const rows: TablesInsert<'fin_expenses'>[] = [];
  for (const r of recurring) {
    // A payment does not back-fill the months before it existed.
    if (monthKeyOf(r.created_at ?? '') > monthKey) continue;
    const note = recurringNoteTag(r.id, monthKey);
    if (existing.has(note)) continue;
    const day = Math.min(r.day_of_month || 1, last);
    rows.push({
      occurred_on: `${monthKey}-${String(day).padStart(2, '0')}`,
      ministry_id: r.ministry_id,
      label: r.label,
      payee: r.payee,
      category: r.category || RECURRING_CATEGORY,
      // DB → DB: the numeric never leaves the data layer, so it is copied as
      // read rather than round-tripped through cents (exact by construction).
      amount: r.amount,
      status: 'paid',
      note,
      created_by: createdBy,
    });
  }
  if (!rows.length) return ok({ inserted: 0 });

  const { error, status } = await supabase.from('fin_expenses').insert(rows);
  if (error) return fail(TAG, 'materializeRecurring', error, status);
  return ok({ inserted: rows.length });
}
