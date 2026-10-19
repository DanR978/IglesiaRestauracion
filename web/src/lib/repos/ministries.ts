/* ============================================================================
 * web/src/lib/repos/ministries.ts — the church's ministries (S40)
 * ----------------------------------------------------------------------------
 * The read js/pages/admin/ministries.js `loadMinistries()` ran inline
 * (`ministries.select('*').order('name')`) — which kept only `data`, so a
 * failed fetch rendered "No hay ministerios todavía" (PORT-DEBT S44). Here a
 * failure is `{ ok: false, error }`, never an empty list (ADR-0004); it logs
 * under `[ministries]`.
 *
 * Staff-only: `ministries` has no anon policy, and the aal2 layer
 * (20261019000001) hides every row from a session that has not passed its
 * second factor — so a dead session would read as "no ministries". The
 * session is checked first (./session). Writes are the developer tier's
 * (has_system_tab('ministries')) and arrive with S44.
 *
 * Usage:
 *   import { fetchMinistries } from '#lib/repos/ministries.js';
 *   const res = await fetchMinistries();
 *   if (res.ok) render(res.data);       // sorted by name
 * ========================================================================== */

import { supabase } from '#lib/db/client.js';
import type { Tables } from '#lib/db/database.types.js';
import { fail, ok } from './errors';
import { requireSession } from './session';
import type { ReadResult } from './types';

const TAG = '[ministries]';

export type Ministry = Tables<'ministries'>;

/** Every ministry, by name. */
export async function fetchMinistries(): Promise<ReadResult<Ministry[]>> {
  const denied = await requireSession(TAG, 'fetchMinistries');
  if (denied) return denied;
  const { data, error, status } = await supabase
    .from('ministries')
    .select('id,name,color,created_at')
    .order('name');
  if (error) return fail(TAG, 'fetchMinistries', error, status);
  return ok(data ?? []);
}
