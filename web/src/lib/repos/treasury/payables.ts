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
 * Usage:
 *   import { fetchPayables, markPayablePaid } from '$lib/repos/treasury';
 * ========================================================================== */

import { supabase } from '$lib/db/client';
import { toNumeric } from '$lib/money';
import type { TablesInsert, TablesUpdate } from '$lib/db/database.types';
import type { WriteResult } from '../types';
import { deleteExpensesByNote } from './entries';
import {
  centsError,
  payableNoteTag,
  toPayableEntry,
  warnRead,
  writeFail,
  writeOk,
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
  PayableEntry[]
> {
  let q = supabase.from('fin_payables').select('*');
  if (status) q = q.eq('status', status);
  const { data, error } = await q
    .order('status')
    .order('due_on', { ascending: true, nullsFirst: false });
  if (error) {
    warnRead('fetchPayables', error.message);
    return [];
  }
  return (data ?? []).map(toPayableEntry);
}

/* ── Writes ────────────────────────────────────────────────────────────── */

export async function createPayable(input: PayableInsert): Promise<WriteResult<PayableEntry>> {
  const bad = centsError(input.amountCents);
  if (bad) return writeFail('createPayable', bad);
  const { amountCents, ...rest } = input;
  const row: TablesInsert<'fin_payables'> = { ...rest, amount: toNumeric(amountCents) };
  const { data, error } = await supabase.from('fin_payables').insert(row).select().single();
  if (error) return writeFail('createPayable', error.message);
  return writeOk(toPayableEntry(data));
}

export async function updatePayable(
  id: string,
  patch: PayableUpdate,
): Promise<WriteResult<PayableEntry>> {
  if (!id) return writeFail('updatePayable', 'Falta el identificador de la cuenta por pagar.');
  const { amountCents, ...rest } = patch;
  const row: TablesUpdate<'fin_payables'> = { ...rest };
  if (amountCents !== undefined) {
    const bad = centsError(amountCents);
    if (bad) return writeFail('updatePayable', bad);
    row.amount = toNumeric(amountCents);
  }
  const { data, error } = await supabase
    .from('fin_payables')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return writeFail('updatePayable', error.message);
  return writeOk(toPayableEntry(data));
}

/**
 * Delete a payable and its mirrored expense, in that order
 * (`treasury-tab.js:419`). A payable with no mirror deletes cleanly — the
 * mirror delete matches zero rows and still succeeds.
 */
export async function deletePayable(id: string): Promise<WriteResult> {
  if (!id) return writeFail('deletePayable', 'Falta el identificador de la cuenta por pagar.');
  const { error } = await supabase.from('fin_payables').delete().eq('id', id);
  if (error) return writeFail('deletePayable', error.message);
  return deleteExpensesByNote(payableNoteTag(id));
}

/** What `markPayablePaid` needs from the row the user acted on. */
export type PayableToPay = Pick<PayableEntry, 'id' | 'ministry_id' | 'creditor' | 'amountCents'>;

export type MarkPaidOptions = {
  /** `auth.uid()` of the operator, stamped on the mirrored expense. */
  createdBy?: string | null;
  /** ISO timestamp to record; injectable so the write is deterministic in tests. */
  paidAt?: string;
};

/**
 * Mark a payable paid and mirror it into the books as a real expense
 * (`treasury-tab.js:425-438`): update the payable, drop any previous mirror,
 * insert the new one. Idempotent through the `auto:payable:<id>` tag.
 *
 * @returns the `paid_at` timestamp that was recorded.
 */
export async function markPayablePaid(
  payable: PayableToPay,
  { createdBy = null, paidAt = new Date().toISOString() }: MarkPaidOptions = {},
): Promise<WriteResult<{ paidAt: string }>> {
  if (!payable?.id) return writeFail('markPayablePaid', 'Falta la cuenta por pagar.');
  const bad = centsError(payable.amountCents);
  if (bad) return writeFail('markPayablePaid', bad);

  const { error: updateError } = await supabase
    .from('fin_payables')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', payable.id);
  if (updateError) return writeFail('markPayablePaid', updateError.message);

  const note = payableNoteTag(payable.id);
  const cleared = await deleteExpensesByNote(note);
  if (!cleared.ok) {
    return writeFail(
      'markPayablePaid',
      `Se marcó como pagada, pero no se pudo actualizar el gasto: ${cleared.error}`,
    );
  }

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
  const { error } = await supabase.from('fin_expenses').insert(mirror);
  if (error) {
    return writeFail(
      'markPayablePaid',
      `Se marcó como pagada, pero no se pudo registrar el gasto: ${error.message}`,
    );
  }
  return writeOk({ paidAt });
}
