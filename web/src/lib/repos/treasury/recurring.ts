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
 *   import { fetchRecurring, materializeRecurring } from '$lib/repos/treasury';
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import { toNumeric } from '$lib/money';
import { todayISO } from '$lib/date';
import type { TablesInsert, TablesUpdate } from '$lib/db/database.types';
import type { WriteResult } from '../types';
import {
  AUTO_NOTE_PREFIX,
  centsError,
  lastDayOfMonth,
  monthKeyOf,
  monthRange,
  recurringNoteTag,
  toRecurringEntry,
  warnRead,
  writeFail,
  writeOk,
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
export async function fetchRecurring(): Promise<RecurringEntry[]> {
  const { data, error } = await supabase
    .from('fin_recurring')
    .select('*')
    .order('active', { ascending: false })
    .order('payee');
  if (error) {
    warnRead('fetchRecurring', error.message);
    return [];
  }
  return (data ?? []).map(toRecurringEntry);
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createRecurring(
  input: RecurringInsert,
): Promise<WriteResult<RecurringEntry>> {
  const bad = centsError(input.amountCents);
  if (bad) return writeFail('createRecurring', bad);
  const { amountCents, ...rest } = input;
  const row: TablesInsert<'fin_recurring'> = { ...rest, amount: toNumeric(amountCents) };
  const { data, error } = await supabase.from('fin_recurring').insert(row).select().single();
  if (error) return writeFail('createRecurring', error.message);
  return writeOk(toRecurringEntry(data));
}

export async function updateRecurring(
  id: string,
  patch: RecurringUpdate,
): Promise<WriteResult<RecurringEntry>> {
  if (!id) return writeFail('updateRecurring', 'Falta el identificador del pago recurrente.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_recurring'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return writeFail('updateRecurring', bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error } = await supabase
    .from('fin_recurring')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updateRecurring', error.message);
  return writeOk(toRecurringEntry(data));
}

export async function deleteRecurring(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deleteRecurring', 'Falta el identificador del pago recurrente.');
  const { error } = await supabase.from('fin_recurring').delete().eq('id', id);
  if (error) return writeFail('deleteRecurring', error.message);
  return writeOk(undefined);
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
    return writeFail('materializeRecurring', 'Mes inválido.');
  }
  // Never generate rows for a month that has not started (`treasury-tab.js:378`).
  if (monthKey > monthKeyOf(today)) return writeOk({ inserted: 0 });

  const [recRes, tagRes] = await Promise.all([
    supabase.from('fin_recurring').select('*').eq('active', true).eq('frequency', 'monthly'),
    supabase
      .from('fin_expenses')
      .select('note')
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end)
      .like('note', RECURRING_NOTE_LIKE),
  ]);
  if (recRes.error) return writeFail('materializeRecurring', recRes.error.message);
  // Without the existing tags we cannot tell what is already there, and
  // guessing would double-post the month.
  if (tagRes.error) return writeFail('materializeRecurring', tagRes.error.message);

  const recurring = recRes.data ?? [];
  if (!recurring.length) return writeOk({ inserted: 0 });

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
  if (!rows.length) return writeOk({ inserted: 0 });

  const { error } = await supabase.from('fin_expenses').insert(rows);
  if (error) return writeFail('materializeRecurring', error.message);
  return writeOk({ inserted: rows.length });
}
