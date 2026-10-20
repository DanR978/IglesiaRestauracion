/* ============================================================================
 * web/src/lib/repos/treasury/payables.ts — `fin_payables` + the books mirror
 * ----------------------------------------------------------------------------
 * Ported from `treasury-tab.js` `renderPayables` (:402-421) and `markPaid`
 * (:425-438).
 *
 * The mirror is the load-bearing part: `fin_expenses` is the single source of
 * truth for Gastos / Resumen / Reportes, so marking a payable paid writes a
 * matching expense tagged `auto:payable:<id>`. The tag makes it idempotent
 * (the old mirror is deleted first) and invisible (`cleanNote()`), and
 * deleting the payable takes the mirror with it.
 *
 * Both multi-step writes are safe to retry: each step converges when run
 * again, so the error a view shows with a Retry button is always the right
 * next action.
 *
 * Usage:
 *   import { fetchPayables, markPayablePaid } from '#lib/repos/treasury/index.js';
 *   const res = await markPayablePaid(row, { createdBy: userId });
 *   if (!res.ok) showError(res.error.message);
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import { toNumeric } from '#lib/money.js';
import type { TablesInsert, TablesUpdate } from '#lib/db/database.types.js';
import { fail, invalid, noRows, ok } from '../errors';
import { requireSession } from '../session';
import type { ReadResult, RepoError, RepoFailure, WriteResult } from '../types';
import { deleteExpensesByNote } from './entries';
import {
  TAG,
  centsError,
  payableNoteTag,
  toPayableEntry,
  type PayableEntry,
  type PayableInsert,
  type PayableStatus,
  type PayableUpdate,
} from './shared';

/** The category stamped on a mirrored expense (`treasury-tab.js:434`). */
const PAID_BILL_CATEGORY = 'Cuenta pagada';

/* ── Reads ─────────────────────────────────────────────────────────────── */

/**
 * Payables by status then due date, undated last (`treasury-tab.js:403-404`).
 * `status` filters server-side — Resumen only ever wants the open ones.
 */
export async function fetchPayables({ status }: { status?: PayableStatus } = {}): Promise<
  ReadResult<PayableEntry[]>
> {
  const denied = await requireSession(TAG, 'fetchPayables');
  if (denied) return denied;
  let q = supabase.from('fin_payables').select('*');
  if (status) q = q.eq('status', status);
  const res = await q.order('status').order('due_on', { ascending: true, nullsFirst: false });
  if (res.error) return fail(TAG, 'fetchPayables', res.error, res.status);
  return ok((res.data ?? []).map(toPayableEntry));
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createPayable(input: PayableInsert): Promise<WriteResult<PayableEntry>> {
  const denied = await requireSession(TAG, 'createPayable');
  if (denied) return denied;
  const bad = centsError(input.amountCents);
  if (bad) return invalid(bad);
  const { amountCents, ...rest } = input;
  const row: TablesInsert<'fin_payables'> = { ...rest, amount: toNumeric(amountCents) };
  const { data, error, status } = await supabase.from('fin_payables').insert(row).select().single();
  if (error) return fail(TAG, 'createPayable', error, status);
  return ok(toPayableEntry(data));
}

export async function updatePayable(
  id: string,
  patch: PayableUpdate,
): Promise<WriteResult<PayableEntry>> {
  const denied = await requireSession(TAG, 'updatePayable');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la cuenta por pagar.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_payables'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return invalid(bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error, status } = await supabase
    .from('fin_payables')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(TAG, 'updatePayable', error, status);
  return ok(toPayableEntry(data));
}

/**
 * Delete a payable and its mirrored expense (`treasury-tab.js:419`). The
 * mirror goes FIRST so a Retry converges: deleting again finds no mirror (a
 * success) and then removes the payable. Legacy deleted the payable first,
 * which strands the mirror for good once a payable delete that matches no row
 * is an error (D-027). A payable with no mirror deletes cleanly.
 */
export async function deletePayable(id: string): Promise<WriteResult> {
  const denied = await requireSession(TAG, 'deletePayable');
  if (denied) return denied;
  if (!id) return invalid('Falta el identificador de la cuenta por pagar.');
  const mirror = await deleteExpensesByNote(payableNoteTag(id));
  if (!mirror.ok) return mirror;
  const { error, status, count } = await supabase
    .from('fin_payables')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return fail(TAG, 'deletePayable', error, status);
  if (!count) return noRows(TAG, 'deletePayable');
  return ok(undefined);
}

/** What `markPayablePaid` needs from the row the user acted on. */
export type PayableToPay = Pick<PayableEntry, 'id' | 'ministry_id' | 'creditor' | 'amountCents'>;

export type MarkPaidOptions = {
  /** `auth.uid()` of the operator, stamped on the mirrored expense. */
  createdBy?: string | null;
  /** ISO timestamp to record; injectable so the write is deterministic in tests. */
  paidAt?: string;
};

/** The payable is already paid: say so first, then why the books step failed. */
function paidWithoutMirror(step: string, error: RepoError): RepoFailure {
  return {
    ok: false,
    error: {
      ...error,
      message: `Se marcó como pagada, pero no se pudo ${step} el gasto. ${error.message}`,
    },
  };
}

/**
 * Mark a payable paid and mirror it into the books as a real expense
 * (`treasury-tab.js:425-438`): update the payable, drop any previous mirror,
 * insert the new one. Idempotent through the `auto:payable:<id>` tag, so a
 * Retry after a partial failure finishes the job. An update that matched no
 * payable stops before the books are touched.
 *
 * @returns the `paid_at` timestamp that was recorded.
 */
export async function markPayablePaid(
  payable: PayableToPay,
  { createdBy = null, paidAt = new Date().toISOString() }: MarkPaidOptions = {},
): Promise<WriteResult<{ paidAt: string }>> {
  const denied = await requireSession(TAG, 'markPayablePaid');
  if (denied) return denied;
  if (!payable?.id) return invalid('Falta la cuenta por pagar.');
  const bad = centsError(payable.amountCents);
  if (bad) return invalid(bad);

  const updated = await supabase
    .from('fin_payables')
    .update({ status: 'paid', paid_at: paidAt }, { count: 'exact' })
    .eq('id', payable.id);
  if (updated.error) return fail(TAG, 'markPayablePaid', updated.error, updated.status);
  if (!updated.count) return noRows(TAG, 'markPayablePaid');

  const note = payableNoteTag(payable.id);
  const cleared = await deleteExpensesByNote(note);
  if (!cleared.ok) return paidWithoutMirror('actualizar', cleared.error);

  const mirror: TablesInsert<'fin_expenses'> = {
    occurred_on: paidAt.slice(0, 10),
    ministry_id: payable.ministry_id || null,
    label: null,
    payee: payable.creditor,
    category: PAID_BILL_CATEGORY,
    amount: toNumeric(payable.amountCents),
    status: 'paid',
    note,
    created_by: createdBy,
  };
  const { error, status } = await supabase.from('fin_expenses').insert(mirror);
  if (error) {
    return paidWithoutMirror('registrar', fail(TAG, 'markPayablePaid', error, status).error);
  }
  return ok({ paidAt });
}
