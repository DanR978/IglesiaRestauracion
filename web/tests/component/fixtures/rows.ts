// Shared row shape for the S21 component fixtures — modelled on the treasury
// "Por pagar" table (creditor · amount · due date · row menu), which is the
// hardest DataTable case: money, a nullable date, overdue emphasis and
// auto-generated (mirrored) rows.
import type { RowTone } from '$lib/components/data-table';

export interface HarnessRow {
  id: string;
  payee: string;
  /** Integer cents (D-003). */
  cents: number;
  due: string | null;
  /** Auto-inserted by materializeRecurring / the payables mirror. */
  auto?: boolean;
  tone?: RowTone;
}
